"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbortedError = exports.OpenAiCompatClient = void 0;
/**
 * Client for any server exposing the OpenAI `/chat/completions` wire format
 * (OpenAI, DeepSeek, Groq, OpenRouter, Ollama, LM Studio, vLLM, ...).
 * Streams SSE and assembles tool calls incrementally.
 */
class OpenAiCompatClient {
    constructor(profile) {
        this.profile = profile;
    }
    endpoint(path) {
        const base = this.profile.baseUrl.replace(/\/+$/, "");
        return `${base}${path}`;
    }
    headers() {
        const h = { "Content-Type": "application/json" };
        if (this.profile.apiKey && this.profile.apiKey.trim() !== "") {
            h["Authorization"] = `Bearer ${this.profile.apiKey.trim()}`;
        }
        Object.assign(h, this.profile.extraHeaders ?? {});
        return h;
    }
    async chat(messages, tools, handlers, signal) {
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
        try {
            res = await fetch(this.endpoint("/chat/completions"), {
                method: "POST",
                headers: this.headers(),
                body: JSON.stringify(body),
                signal,
            });
        }
        catch (err) {
            if (signal?.aborted)
                throw new AbortedError();
            throw new Error(`Could not reach model server at ${this.profile.baseUrl} (${err.message}). ` +
                `Check the Base URL in Agent Kit settings and that the server is running.`);
        }
        if (!res.ok || !res.body) {
            const text = await safeText(res);
            throw new Error(`Model server returned HTTP ${res.status}: ${truncate(text, 500)}`);
        }
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
        return {
            content: contentParts.join(""),
            reasoning: reasoningParts.length ? reasoningParts.join("") : undefined,
            toolCalls,
            finishReason,
        };
    }
    async listModels() {
        const res = await fetch(this.endpoint("/models"), { headers: this.headers() });
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
function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + "..." : s;
}
//# sourceMappingURL=openaiCompat.js.map