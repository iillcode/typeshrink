import { ChatMessage, LlmClient, LlmResponse, ModelProfile, StreamHandlers, ToolCallRequest, ToolParameters } from "../harness/types";
import { Agent, fetch as undiciFetch } from "undici";

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
let aiMod: typeof import("ai") | null = null;
let compatMod: typeof import("@ai-sdk/openai-compatible") | null = null;

async function loadAi(): Promise<typeof import("ai")> {
	if (!aiMod) aiMod = await import("ai");
	return aiMod;
}
async function loadCompat(): Promise<typeof import("@ai-sdk/openai-compatible")> {
	if (!compatMod) compatMod = await import("@ai-sdk/openai-compatible");
	return compatMod;
}

/**
 * Long generations (reasoning models, large file writes) routinely exceed
 * undici's default 300s ceiling and surface as "terminated". Disable those
 * ceilings for model calls; retries still cover real connection drops.
 */
const llmAgent = new Agent({
	keepAliveTimeout: 10_000,
	keepAliveMaxTimeout: 60_000,
	headersTimeout: 0,
	bodyTimeout: 0,
	connect: { timeout: 30_000 },
});

export interface OpenAIToolSpec {
	type: "function";
	function: { name: string; description: string; parameters: ToolParameters };
}

/** Map our OpenAI-wire ChatMessage onto the AI SDK's ModelMessage shape. */
	function toModelMessages(messages: ChatMessage[]): any[] {
		const out: any[] = [];
	for (const m of messages) {
		if (m.role === "system") {
			out.push({ role: "system", content: m.content ?? "" });
		} else if (m.role === "user") {
			out.push({ role: "user", content: m.content ?? "" });
		} else if (m.role === "assistant") {
			const parts: Array<Record<string, unknown>> = [];
			if (m.reasoning_content) parts.push({ type: "reasoning", text: m.reasoning_content });
			if (m.content) parts.push({ type: "text", text: m.content });
			for (const tc of m.tool_calls ?? []) {
				let input: unknown = {};
				try {
					input = JSON.parse(tc.function.arguments || "{}");
				} catch {
					input = {};
				}
				parts.push({
					type: "tool-call",
					toolCallId: tc.id,
					toolName: tc.function.name,
					input,
				});
			}
			out.push({ role: "assistant", content: parts.length ? (parts as never) : "" });
		} else if (m.role === "tool") {
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

export class OpenAiCompatClient implements LlmClient {
	private provider?: import("@ai-sdk/openai-compatible").OpenAICompatibleProvider;
	/** Resolve once so model calls reuse one provider/fetch instance. */
	private providerPromise?: Promise<import("@ai-sdk/openai-compatible").OpenAICompatibleProvider>;

	constructor(
		private readonly profile: ModelProfile,
		private readonly log?: (level: "info" | "warn" | "error", message: string) => void,
	) {}

	private endpoint(path: string): string {
		const base = this.profile.baseUrl.replace(/\/+$/, "");
		return `${base}${path}`;
	}

	private makeFetch(): any {
		const dispatcher = llmAgent;
		return (input: any, init?: any) => undiciFetch(input, { ...init, dispatcher });
	}

	private async getProvider() {
		if (!this.providerPromise) {
			this.providerPromise = (async () => {
				const compat: any = await loadCompat();
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

	async chat(
		messages: ChatMessage[],
		tools: OpenAIToolSpec[],
		handlers: StreamHandlers,
		signal?: AbortSignal,
		opts?: { nonStreaming?: boolean },
	): Promise<LlmResponse> {
		return opts?.nonStreaming ? this.chatNonStreaming(messages, tools, signal) : this.chatStreaming(messages, tools, handlers, signal);
	}

	private async chatStreaming(
		messages: ChatMessage[],
		tools: OpenAIToolSpec[],
		handlers: StreamHandlers,
		signal?: AbortSignal,
	): Promise<LlmResponse> {
		const ai: any = await loadAi();
		const provider: any = await this.getProvider();
		const model = provider(this.profile.model);
		// v7 rejects `system` role inside `messages`; route it through `instructions`.
		const instructions = messages.filter((m) => m.role === "system").map((m) => m.content ?? "").filter(Boolean).join("\n\n") || undefined;
		const aiMessages = toModelMessages(messages.filter((m) => m.role !== "system"));
		const aiTools = this.toToolSet(ai, tools);

		const startedAt = Date.now();
		this.log?.("info", `POST ${this.endpoint("/chat/completions")} model=${this.profile.model} msgs=${messages.length}${tools.length ? ` tools=${tools.length}` : ""}`);
		let result: any;
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
		} catch (err) {
			if (signal?.aborted) throw new AbortedError();
			this.log?.("error", `Request failed after ${Date.now() - startedAt}ms: ${errMessage(err)}`);
			throw new Error(
				`Could not reach model server at ${this.profile.baseUrl} (${(err as Error).message}). ` +
					`Check the Base URL in Agent Kit settings and that the server is running.`,
			);
		}

		const contentParts: string[] = [];
		const reasoningParts: string[] = [];
		// Cline's sequence mapping (agent-runtime.ts): deltas append to the last
		// block of the same type, so reasoning → text → reasoning keeps its order.
		const blocks: Array<{ type: "reasoning" | "text"; text: string }> = [];
		const appendBlock = (type: "reasoning" | "text", text: string) => {
			const last = blocks[blocks.length - 1];
			if (last && last.type === type) last.text += text;
			else blocks.push({ type, text });
		};
		const calls = new Map<string, { id: string; name: string; args: string }>();
		let finishReason: string | null = null;

		try {
			for await (const part of result.fullStream) {
				if (signal?.aborted) throw new AbortedError();
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
		} catch (err) {
			if (signal?.aborted || (err as Error)?.name === "AbortError") throw new AbortedError();
			this.log?.("warn", `Stream interrupted after ${Date.now() - startedAt}ms: ${errMessage(err)} (retryable)`);
			throw err;
		}

		const toolCalls: ToolCallRequest[] = [...calls.entries()].map(([key, c], i) => ({
			index: i,
			id: c.id || key || `call_${i}`,
			type: "function" as const,
			function: { name: c.name, arguments: c.args || "{}" },
		}));

		this.log?.("info",
			`Stream finished in ${Date.now() - startedAt}ms — ` +
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
	private async chatNonStreaming(
		messages: ChatMessage[],
		tools: OpenAIToolSpec[],
		signal?: AbortSignal,
	): Promise<LlmResponse> {
		const ai: any = await loadAi();
		const provider: any = await this.getProvider();
		const model = provider(this.profile.model);
		const instructions = messages.filter((m) => m.role === "system").map((m) => m.content ?? "").filter(Boolean).join("\n\n") || undefined;
		const aiMessages = toModelMessages(messages.filter((m) => m.role !== "system"));
		const aiTools = this.toToolSet(ai, tools);

		const startedAt = Date.now();
		this.log?.("info", `POST (non-streaming) ${this.endpoint("/chat/completions")} model=${this.profile.model} msgs=${messages.length}`);
		let res: any;
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
		} catch (err) {
			if (signal?.aborted) throw new AbortedError();
			this.log?.("error", `Non-streaming request failed after ${Date.now() - startedAt}ms: ${errMessage(err)}`);
			throw new Error(`Could not reach model server at ${this.profile.baseUrl} (${(err as Error).message}).`);
		}

		const toolCalls: ToolCallRequest[] = (res.toolCalls ?? []).map((tc: any, i: number) => ({
			index: i,
			id: tc.toolCallId || `call_${i}`,
			type: "function" as const,
			function: {
				name: tc.toolName,
				arguments: JSON.stringify(tc.input ?? {}),
			},
		}));

		// v7 exposes reasoning as an array of parts; flatten to a string.
		const reasoning = Array.isArray(res.reasoning)
			? res.reasoning.map((r: any) => (typeof r === "string" ? r : (r?.text ?? ""))).join("")
			: typeof res.reasoning === "string"
				? res.reasoning
				: undefined;

		this.log?.("info",
			`Non-streaming finished in ${Date.now() - startedAt}ms — chars=${(res.text ?? "").length}, toolCalls=${toolCalls.length}, finish=${res.finishReason ?? "none"}`);
		const blocks: Array<{ type: "reasoning" | "text"; text: string }> = [];
		if (reasoning) blocks.push({ type: "reasoning", text: reasoning });
		if (res.text) blocks.push({ type: "text", text: res.text });
		return {
			content: res.text ?? "",
			reasoning,
			toolCalls,
			finishReason: res.finishReason ?? null,
			...(blocks.length ? { blocks } : {}),
		};
	}

	private toToolSet(ai: any, tools: OpenAIToolSpec[]): any {
		const set: Record<string, unknown> = {};
		for (const t of tools) {
			set[t.function.name] = ai.tool({
				description: t.function.description,
				parameters: ai.jsonSchema(t.function.parameters),
			});
		}
		return set;
	}

	async listModels(): Promise<string[]> {
		const headers: Record<string, string> = { Accept: "application/json" };
		if (this.profile.apiKey && this.profile.apiKey.trim() !== "") headers["Authorization"] = `Bearer ${this.profile.apiKey.trim()}`;
		Object.assign(headers, this.profile.extraHeaders ?? {});
		const res = await undiciFetch(this.endpoint("/models"), { headers, dispatcher: llmAgent }) as unknown as Response;
		if (!res.ok) {
			throw new Error(`GET /models failed with HTTP ${res.status}: ${truncate(await safeText(res), 300)}`);
		}
		const json = (await res.json()) as { data?: Array<{ id?: string }> };
		return (json.data ?? [])
			.map((m) => m.id ?? "")
			.filter((id) => id !== "")
			.sort((a, b) => a.localeCompare(b));
	}
}

/** Internal marker so the agent loop can distinguish user aborts from real errors. */
export class AbortedError extends Error {
	constructor() {
		super("Task aborted by user.");
		this.name = "AbortedError";
	}
}

async function safeText(res: Response): Promise<string> {
	try {
		return await res.text();
	} catch {
		return "<no body>";
	}
}

function errMessage(err: unknown): string {
	const e = err as { message?: string; cause?: { code?: string; message?: string } };
	const code = e?.cause?.code ? ` [${e.cause.code}]` : "";
	return `${e?.message ?? String(err)}${code}`;
}

function truncate(s: string, n: number): string {
	return s.length > n ? s.slice(0, n) + "..." : s;
}
