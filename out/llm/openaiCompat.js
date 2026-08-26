"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbortedError = exports.OpenAiCompatClient = void 0;
const undici_1 = require("undici");
/**
 * Node/undici kills fetches after 300s by default (headers or idle body) —
 * long-context requests and reasoning models routinely exceed that, surfacing
 * as "terminated". Disable those ceilings for model calls: generation may take
 * as long as it takes. Retries still cover real connection drops.
 */
const llmAgent = new undici_1.Agent({
    keepAliveTimeout: 10000,
    keepAliveMaxTimeout: 60000,
    headersTimeout: 0,
    bodyTimeout: 0,
    connect: { timeout: 30000 },
});
/**
 * Client for any server exposing the OpenAI `/chat/completions` wire format
 * (OpenAI, DeepSeek, Groq, OpenRouter, Ollama, LM Studio, vLLM, ...).
 * Streams SSE and assembles tool calls incrementally.
 */
class OpenAiCompatClient {
    constructor(profile, log) {
        this.profile = profile;
        this.log = log;
    }
    endpoint(path) {
        const base = this.profile.baseUrl.replace(/\/+$/, "");
        return `${base}${path}`;
    }
    headers() {
        const h = {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
        };
        if (this.profile.apiKey && this.profile.apiKey.trim() !== "") {
            h["Authorization"] = `Bearer ${this.profile.apiKey.trim()}`;
        }
        Object.assign(h, this.profile.extraHeaders ?? {});
        return h;
    }
    async chat(messages, tools, handlers, signal, opts) {
        if (opts?.nonStreaming)
            return this.chatNonStreaming(messages, tools, signal);
        const body = {
            model: this.profile.model,
            messages,
            stream: true,
            temperature: this.profile.temperature ?? 0.2,
        };
        if (this.profile.maxTokens && this.profile.maxTokens > 0) {
            body.max_tokens = this.profile.maxTokens;
        }
        if (tools.length > 0) {
            body.tools = tools;
            body.tool_choice = "auto";
        }
        let res;
        const startedAt = Date.now();
        this.log?.("info", `POST ${this.endpoint("/chat/completions")} model=${this.profile.model} msgs=${messages.length}${tools.length ? ` tools=${tools.length}` : ""}`);
        try {
            res = await (0, undici_1.fetch)(this.endpoint("/chat/completions"), {
                method: "POST",
                headers: this.headers(),
                body: JSON.stringify(body),
                signal,
                dispatcher: llmAgent,
            });
        }
        catch (err) {
            if (signal?.aborted)
                throw new AbortedError();
            this.log?.("error", `Request failed after ${Date.now() - startedAt}ms: ${errMessage(err)}`);
            throw new Error(`Could not reach model server at ${this.profile.baseUrl} (${err.message}). ` +
                `Check the Base URL in Agent Kit settings and that the server is running.`);
        }
        if (!res.ok || !res.body) {
            const text = await safeText(res);
            this.log?.("error", `HTTP ${res.status} from ${this.profile.baseUrl}: ${truncate(text, 500)}`);
            throw new Error(`Model server returned HTTP ${res.status}: ${truncate(text, 500)}`);
        }
        this.log?.("info", `HTTP ${res.status} — streaming…`);
        const contentParts = [];
        const reasoningParts = [];
        const calls = new Map();
        let finishReason = null;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
            for (;;) {
                if (signal?.aborted)
                    throw new AbortedError();
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                let nl;
                while ((nl = buffer.indexOf("\n")) >= 0) {
                    const line = buffer.slice(0, nl).replace(/\r$/, "");
                    buffer = buffer.slice(nl + 1);
                    if (!line.startsWith("data:"))
                        continue;
                    const payload = line.slice(5).trim();
                    if (payload === "[DONE]")
                        continue;
                    let chunk;
                    try {
                        chunk = JSON.parse(payload);
                    }
                    catch {
                        continue; // tolerate keep-alive / partial provider noise
                    }
                    const choice = chunk.choices?.[0];
                    if (!choice)
                        continue;
                    if (choice.finish_reason)
                        finishReason = choice.finish_reason;
                    const delta = choice.delta;
                    if (delta?.content) {
                        contentParts.push(delta.content);
                        handlers.onTextDelta?.(delta.content);
                    }
                    const reasoning = delta?.reasoning_content ?? delta?.reasoning;
                    if (reasoning) {
                        reasoningParts.push(reasoning);
                        handlers.onReasoningDelta?.(reasoning);
                    }
                    for (const tc of delta?.tool_calls ?? []) {
                        const existing = calls.get(tc.index) ?? { id: "", name: "", args: "" };
                        if (tc.id)
                            existing.id = tc.id;
                        if (tc.function?.name)
                            existing.name += tc.function.name;
                        if (tc.function?.arguments)
                            existing.args += tc.function.arguments;
                        calls.set(tc.index, existing);
                    }
                }
            }
        }
        catch (err) {
            void reader.cancel().catch(() => undefined);
            if (signal?.aborted || err?.name === "AbortError")
                throw new AbortedError();
            this.log?.("warn", `Stream interrupted after ${Date.now() - startedAt}ms: ${errMessage(err)} (retryable)`);
            throw err;
        }
        const toolCalls = [...calls.entries()]
            .sort(([a], [b]) => a - b)
            .map(([index, c]) => ({
            index,
            id: c.id || `call_${index}`,
            type: "function",
            function: { name: c.name, arguments: c.args || "{}" },
        }));
        this.log?.("info", `Stream finished in ${Date.now() - startedAt}ms — ` +
            `chars=${contentParts.reduce((n, s) => n + s.length, 0)} ` +
            `(reasoning ${reasoningParts.reduce((n, s) => n + s.length, 0)}), ` +
            `toolCalls=${toolCalls.length}, finish=${finishReason ?? "none"}`);
        return {
            content: contentParts.join(""),
            reasoning: reasoningParts.length ? reasoningParts.join("") : undefined,
            toolCalls,
            finishReason,
        };
    }
    /**
     * Single-shot JSON request (stream:false). Fallback when long-lived SSE
     * connections keep getting reset mid-generation — plain request/response
     * survives where the stream does not.
     */
    async chatNonStreaming(messages, tools, signal) {
        const body = {
            model: this.profile.model,
            messages,
            stream: false,
            temperature: this.profile.temperature ?? 0.2,
        };
        if (this.profile.maxTokens && this.profile.maxTokens > 0)
            body.max_tokens = this.profile.maxTokens;
        if (tools.length > 0) {
            body.tools = tools;
            body.tool_choice = "auto";
        }
        const startedAt = Date.now();
        this.log?.("info", `POST (non-streaming fallback) ${this.endpoint("/chat/completions")} model=${this.profile.model} msgs=${messages.length}`);
        let res;
        try {
            res = await (0, undici_1.fetch)(this.endpoint("/chat/completions"), {
                method: "POST",
                headers: { ...this.headers(), Accept: "application/json" },
                body: JSON.stringify(body),
                signal,
                dispatcher: llmAgent,
            });
        }
        catch (err) {
            if (signal?.aborted)
                throw new AbortedError();
            this.log?.("error", `Non-streaming request failed after ${Date.now() - startedAt}ms: ${errMessage(err)}`);
            throw new Error(`Could not reach model server at ${this.profile.baseUrl} (${err.message}).`);
        }
        if (!res.ok) {
            const text = await safeText(res);
            this.log?.("error", `HTTP ${res.status} (non-streaming): ${truncate(text, 500)}`);
            throw new Error(`Model server returned HTTP ${res.status}: ${truncate(text, 500)}`);
        }
        const json = (await res.json());
        const msg = json.choices?.[0]?.message ?? {};
        const toolCalls = (msg.tool_calls ?? []).map((tc, i) => ({
            index: typeof tc.index === "number" ? tc.index : i,
            id: tc.id || `call_${i}`,
            type: "function",
            function: { name: tc.function?.name ?? "", arguments: tc.function?.arguments || "{}" },
        }));
        this.log?.("info", `Non-streaming finished in ${Date.now() - startedAt}ms — chars=${(msg.content ?? "").length}, toolCalls=${toolCalls.length}, finish=${json.choices?.[0]?.finish_reason ?? "none"}`);
        return {
            content: msg.content ?? "",
            reasoning: msg.reasoning_content ?? msg.reasoning ?? undefined,
            toolCalls,
            finishReason: json.choices?.[0]?.finish_reason ?? null,
        };
    }
    async listModels() {
        const headers = this.headers();
        headers["Accept"] = "application/json";
        const res = await (0, undici_1.fetch)(this.endpoint("/models"), {
            headers,
            dispatcher: llmAgent,
        });
        if (!res.ok) {
            throw new Error(`GET /models failed with HTTP ${res.status}: ${truncate(await safeText(res), 300)}`);
        }
        const json = (await res.json());
        return (json.data ?? [])
            .map((m) => m.id ?? "")
            .filter((id) => id !== "")
            .sort((a, b) => a.localeCompare(b));
    }
}
exports.OpenAiCompatClient = OpenAiCompatClient;
/** Internal marker so the agent loop can distinguish user aborts from real errors. */
class AbortedError extends Error {
    constructor() {
        super("Task aborted by user.");
        this.name = "AbortedError";
    }
}
exports.AbortedError = AbortedError;
async function safeText(res) {
    try {
        return await res.text();
    }
    catch {
        return "<no body>";
    }
}
function errMessage(err) {
    const e = err;
    const code = e?.cause?.code ? ` [${e.cause.code}]` : "";
    return `${e?.message ?? String(err)}${code}`;
}
function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + "..." : s;
}
//# sourceMappingURL=openaiCompat.js.map