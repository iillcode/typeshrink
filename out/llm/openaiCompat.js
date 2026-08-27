"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbortedError = exports.OpenAiCompatClient = void 0;
const undici_1 = require("undici");
/**
 * Vercel AI SDK is ESM-only. We load it via dynamic `import()` (here, behind an
 * async cache) so this file still compiles to CommonJS for the headless test
 * harness, while the production extension bundles the SDK in with esbuild.
 *
 * Transport is delegated to the AI SDK (SSE parsing, buffer accumulation,
 * tool-call argument merging, abort propagation) — the same split Cline uses.
 * Everything above that (message assembly, reasoning/tool merging into our own
 * accumulators, retry hand-off) stays in our code, mirroring Cline's
 * agent-runtime layer.
 */
let aiMod = null;
let compatMod = null;
async function loadAi() {
    if (!aiMod)
        aiMod = await Promise.resolve().then(() => __importStar(require("ai")));
    return aiMod;
}
async function loadCompat() {
    if (!compatMod)
        compatMod = await Promise.resolve().then(() => __importStar(require("@ai-sdk/openai-compatible")));
    return compatMod;
}
/**
 * Long generations (reasoning models, large file writes) routinely exceed
 * undici's default 300s ceiling and surface as "terminated". Disable those
 * ceilings for model calls; retries still cover real connection drops.
 */
const llmAgent = new undici_1.Agent({
    keepAliveTimeout: 10000,
    keepAliveMaxTimeout: 60000,
    headersTimeout: 0,
    bodyTimeout: 0,
    connect: { timeout: 30000 },
});
/** Map our OpenAI-wire ChatMessage onto the AI SDK's ModelMessage shape. */
function toModelMessages(messages) {
    const out = [];
    for (const m of messages) {
        if (m.role === "system") {
            out.push({ role: "system", content: m.content ?? "" });
        }
        else if (m.role === "user") {
            out.push({ role: "user", content: m.content ?? "" });
        }
        else if (m.role === "assistant") {
            const parts = [];
            if (m.reasoning_content)
                parts.push({ type: "reasoning", text: m.reasoning_content });
            if (m.content)
                parts.push({ type: "text", text: m.content });
            for (const tc of m.tool_calls ?? []) {
                let input = {};
                try {
                    input = JSON.parse(tc.function.arguments || "{}");
                }
                catch {
                    input = {};
                }
                parts.push({
                    type: "tool-call",
                    toolCallId: tc.id,
                    toolName: tc.function.name,
                    input,
                });
            }
            out.push({ role: "assistant", content: parts.length ? parts : "" });
        }
        else if (m.role === "tool") {
            const out2 = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
            out.push({
                role: "tool",
                content: [
                    {
                        type: "tool-result",
                        toolCallId: m.tool_call_id ?? "",
                        toolName: m.name,
                        output: { type: "text", value: out2 },
                    },
                ],
            });
        }
    }
    return out;
}
class OpenAiCompatClient {
    constructor(profile, log) {
        this.profile = profile;
        this.log = log;
    }
    endpoint(path) {
        const base = this.profile.baseUrl.replace(/\/+$/, "");
        return `${base}${path}`;
    }
    makeFetch() {
        const dispatcher = llmAgent;
        return (input, init) => (0, undici_1.fetch)(input, { ...init, dispatcher });
    }
    async getProvider() {
        if (!this.providerPromise) {
            this.providerPromise = (async () => {
                const compat = await loadCompat();
                return compat.createOpenAICompatible({
                    baseURL: this.profile.baseUrl.replace(/\/+$/, ""),
                    apiKey: this.profile.apiKey && this.profile.apiKey.trim() !== "" ? this.profile.apiKey.trim() : "no-key",
                    name: "agentkit",
                    fetch: this.makeFetch(),
                    ...(this.profile.extraHeaders ? { headers: this.profile.extraHeaders } : {}),
                });
            })();
        }
        return this.providerPromise;
    }
    async chat(messages, tools, handlers, signal, opts) {
        return opts?.nonStreaming ? this.chatNonStreaming(messages, tools, signal) : this.chatStreaming(messages, tools, handlers, signal);
    }
    async chatStreaming(messages, tools, handlers, signal) {
        const ai = await loadAi();
        const provider = await this.getProvider();
        const model = provider(this.profile.model);
        // v7 rejects `system` role inside `messages`; route it through `instructions`.
        const instructions = messages.filter((m) => m.role === "system").map((m) => m.content ?? "").filter(Boolean).join("\n\n") || undefined;
        const aiMessages = toModelMessages(messages.filter((m) => m.role !== "system"));
        const aiTools = this.toToolSet(ai, tools);
        const startedAt = Date.now();
        this.log?.("info", `POST ${this.endpoint("/chat/completions")} model=${this.profile.model} msgs=${messages.length}${tools.length ? ` tools=${tools.length}` : ""}`);
        let result;
        try {
            result = ai.streamText({
                model,
                instructions,
                messages: aiMessages,
                tools: aiTools,
                temperature: this.profile.temperature ?? 0.2,
                ...(this.profile.maxTokens && this.profile.maxTokens > 0 ? { maxOutputTokens: this.profile.maxTokens } : {}),
                toolChoice: "auto",
                abortSignal: signal,
            });
        }
        catch (err) {
            if (signal?.aborted)
                throw new AbortedError();
            this.log?.("error", `Request failed after ${Date.now() - startedAt}ms: ${errMessage(err)}`);
            throw new Error(`Could not reach model server at ${this.profile.baseUrl} (${err.message}). ` +
                `Check the Base URL in Agent Kit settings and that the server is running.`);
        }
        const contentParts = [];
        const reasoningParts = [];
        // Cline's sequence mapping (agent-runtime.ts): deltas append to the last
        // block of the same type, so reasoning → text → reasoning keeps its order.
        const blocks = [];
        const appendBlock = (type, text) => {
            const last = blocks[blocks.length - 1];
            if (last && last.type === type)
                last.text += text;
            else
                blocks.push({ type, text });
        };
        const calls = new Map();
        let finishReason = null;
        try {
            for await (const part of result.fullStream) {
                if (signal?.aborted)
                    throw new AbortedError();
                switch (part.type) {
                    case "text-delta":
                        if (part.text) {
                            contentParts.push(part.text);
                            appendBlock("text", part.text);
                            handlers.onTextDelta?.(part.text);
                        }
                        break;
                    case "reasoning-delta":
                        if (part.text) {
                            reasoningParts.push(part.text);
                            appendBlock("reasoning", part.text);
                            handlers.onReasoningDelta?.(part.text);
                        }
                        break;
                    case "tool-input-start":
                        calls.set(part.id, { id: part.id, name: part.toolName ?? "", args: "" });
                        break;
                    case "tool-input-delta":
                        if (part.delta) {
                            const e = calls.get(part.id) ?? { id: part.id, name: "", args: "" };
                            e.args += part.delta;
                            calls.set(part.id, e);
                        }
                        break;
                    case "tool-input-end":
                        break;
                    case "tool-call":
                        // Final authoritative id/name (matches the start id).
                        calls.set(part.toolCallId, calls.get(part.toolCallId) ?? { id: part.toolCallId, name: part.toolName ?? "", args: "" });
                        break;
                    case "finish":
                        finishReason = part.finishReason ?? null;
                        break;
                    case "error":
                        throw part.error instanceof Error ? part.error : new Error(String(part.error));
                }
            }
        }
        catch (err) {
            if (signal?.aborted || err?.name === "AbortError")
                throw new AbortedError();
            this.log?.("warn", `Stream interrupted after ${Date.now() - startedAt}ms: ${errMessage(err)} (retryable)`);
            throw err;
        }
        const toolCalls = [...calls.entries()].map(([key, c], i) => ({
            index: i,
            id: c.id || key || `call_${i}`,
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
            ...(blocks.length ? { blocks } : {}),
        };
    }
    /**
     * Non-streaming fallback (stream:false). Used by the agent loop after
     * repeated SSE drops — some gateways accept a plain request/response where
     * long-lived SSE keeps resetting.
     */
    async chatNonStreaming(messages, tools, signal) {
        const ai = await loadAi();
        const provider = await this.getProvider();
        const model = provider(this.profile.model);
        const instructions = messages.filter((m) => m.role === "system").map((m) => m.content ?? "").filter(Boolean).join("\n\n") || undefined;
        const aiMessages = toModelMessages(messages.filter((m) => m.role !== "system"));
        const aiTools = this.toToolSet(ai, tools);
        const startedAt = Date.now();
        this.log?.("info", `POST (non-streaming) ${this.endpoint("/chat/completions")} model=${this.profile.model} msgs=${messages.length}`);
        let res;
        try {
            res = await ai.generateText({
                model,
                instructions,
                messages: aiMessages,
                tools: aiTools,
                temperature: this.profile.temperature ?? 0.2,
                ...(this.profile.maxTokens && this.profile.maxTokens > 0 ? { maxOutputTokens: this.profile.maxTokens } : {}),
                toolChoice: "auto",
                abortSignal: signal,
            });
        }
        catch (err) {
            if (signal?.aborted)
                throw new AbortedError();
            this.log?.("error", `Non-streaming request failed after ${Date.now() - startedAt}ms: ${errMessage(err)}`);
            throw new Error(`Could not reach model server at ${this.profile.baseUrl} (${err.message}).`);
        }
        const toolCalls = (res.toolCalls ?? []).map((tc, i) => ({
            index: i,
            id: tc.toolCallId || `call_${i}`,
            type: "function",
            function: {
                name: tc.toolName,
                arguments: JSON.stringify(tc.input ?? {}),
            },
        }));
        // v7 exposes reasoning as an array of parts; flatten to a string.
        const reasoning = Array.isArray(res.reasoning)
            ? res.reasoning.map((r) => (typeof r === "string" ? r : (r?.text ?? ""))).join("")
            : typeof res.reasoning === "string"
                ? res.reasoning
                : undefined;
        this.log?.("info", `Non-streaming finished in ${Date.now() - startedAt}ms — chars=${(res.text ?? "").length}, toolCalls=${toolCalls.length}, finish=${res.finishReason ?? "none"}`);
        const blocks = [];
        if (reasoning)
            blocks.push({ type: "reasoning", text: reasoning });
        if (res.text)
            blocks.push({ type: "text", text: res.text });
        return {
            content: res.text ?? "",
            reasoning,
            toolCalls,
            finishReason: res.finishReason ?? null,
            ...(blocks.length ? { blocks } : {}),
        };
    }
    toToolSet(ai, tools) {
        const set = {};
        for (const t of tools) {
            set[t.function.name] = ai.tool({
                description: t.function.description,
                parameters: ai.jsonSchema(t.function.parameters),
            });
        }
        return set;
    }
    async listModels() {
        const headers = { Accept: "application/json" };
        if (this.profile.apiKey && this.profile.apiKey.trim() !== "")
            headers["Authorization"] = `Bearer ${this.profile.apiKey.trim()}`;
        Object.assign(headers, this.profile.extraHeaders ?? {});
        const res = await (0, undici_1.fetch)(this.endpoint("/models"), { headers, dispatcher: llmAgent });
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