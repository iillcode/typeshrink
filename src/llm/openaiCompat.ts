import { ChatMessage, LlmClient, LlmResponse, ModelProfile, StreamHandlers, ToolCallRequest, ToolParameters } from "../harness/types";

export interface OpenAIToolSpec {
	type: "function";
	function: { name: string; description: string; parameters: ToolParameters };
}

interface DeltaChunk {
	choices?: Array<{
		delta?: {
			content?: string | null;
			reasoning_content?: string | null;
			reasoning?: string | null;
			tool_calls?: Array<{
				index: number;
				id?: string;
				type?: "function";
				function?: { name?: string; arguments?: string };
			}>;
		};
		finish_reason?: string | null;
	}>;
}

/**
 * Client for any server exposing the OpenAI `/chat/completions` wire format
 * (OpenAI, DeepSeek, Groq, OpenRouter, Ollama, LM Studio, vLLM, ...).
 * Streams SSE and assembles tool calls incrementally.
 */
export class OpenAiCompatClient implements LlmClient {
	constructor(private readonly profile: ModelProfile) {}

	private endpoint(path: string): string {
		const base = this.profile.baseUrl.replace(/\/+$/, "");
		return `${base}${path}`;
	}

	private headers(): Record<string, string> {
		const h: Record<string, string> = { "Content-Type": "application/json" };
		if (this.profile.apiKey && this.profile.apiKey.trim() !== "") {
			h["Authorization"] = `Bearer ${this.profile.apiKey.trim()}`;
		}
		Object.assign(h, this.profile.extraHeaders ?? {});
		return h;
	}

	async chat(messages: ChatMessage[], tools: OpenAIToolSpec[], handlers: StreamHandlers, signal?: AbortSignal): Promise<LlmResponse> {
		const body: Record<string, unknown> = {
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

		let res: Response;
		try {
			res = await fetch(this.endpoint("/chat/completions"), {
				method: "POST",
				headers: this.headers(),
				body: JSON.stringify(body),
				signal,
			});
		} catch (err) {
			if (signal?.aborted) throw new AbortedError();
			throw new Error(
				`Could not reach model server at ${this.profile.baseUrl} (${(err as Error).message}). ` +
					`Check the Base URL in Agent Kit settings and that the server is running.`,
			);
		}

		if (!res.ok || !res.body) {
			const text = await safeText(res);
			throw new Error(`Model server returned HTTP ${res.status}: ${truncate(text, 500)}`);
		}

		const contentParts: string[] = [];
		const reasoningParts: string[] = [];
		const calls = new Map<number, { id: string; name: string; args: string }>();
		let finishReason: string | null = null;

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		try {
			for (;;) {
				if (signal?.aborted) throw new AbortedError();
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				let nl: number;
				while ((nl = buffer.indexOf("\n")) >= 0) {
					const line = buffer.slice(0, nl).replace(/\r$/, "");
					buffer = buffer.slice(nl + 1);
					if (!line.startsWith("data:")) continue;
					const payload = line.slice(5).trim();
					if (payload === "[DONE]") continue;
					let chunk: DeltaChunk;
					try {
						chunk = JSON.parse(payload) as DeltaChunk;
					} catch {
						continue; // tolerate keep-alive / partial provider noise
					}
					const choice = chunk.choices?.[0];
					if (!choice) continue;
					if (choice.finish_reason) finishReason = choice.finish_reason;

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
						if (tc.id) existing.id = tc.id;
						if (tc.function?.name) existing.name += tc.function.name;
						if (tc.function?.arguments) existing.args += tc.function.arguments;
						calls.set(tc.index, existing);
					}
				}
			}
		} catch (err) {
			void reader.cancel().catch(() => undefined);
			if (signal?.aborted || (err as Error)?.name === "AbortError") throw new AbortedError();
			throw err;
		}

		const toolCalls: ToolCallRequest[] = [...calls.entries()]
			.sort(([a], [b]) => a - b)
			.map(([index, c]) => ({
				index,
				id: c.id || `call_${index}`,
				type: "function" as const,
				function: { name: c.name, arguments: c.args || "{}" },
			}));

		return {
			content: contentParts.join(""),
			reasoning: reasoningParts.length ? reasoningParts.join("") : undefined,
			toolCalls,
			finishReason,
		};
	}

	async listModels(): Promise<string[]> {
		const res = await fetch(this.endpoint("/models"), { headers: this.headers() });
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

function truncate(s: string, n: number): string {
	return s.length > n ? s.slice(0, n) + "..." : s;
}
