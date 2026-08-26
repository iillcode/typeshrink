// Core contracts of the agent harness. Pure Node — no `vscode` import so the
// loop, tools and LLM client are testable headlessly (see scripts/smoke.js).

export type ChatRole = "system" | "user" | "assistant" | "tool";

/** OpenAI chat-completions wire format message. */
export interface ChatMessage {
	role: ChatRole;
	content?: string | null;
	tool_calls?: ToolCallRequest[];
	tool_call_id?: string;
	name?: string;
}

/** A tool call as produced by the model. */
export interface ToolCallRequest {
	index: number;
	id: string;
	type: "function";
	function: { name: string; arguments: string };
}

export interface JsonSchemaProperty {
	type: string;
	description?: string;
	enum?: string[];
	items?: JsonSchemaProperty;
}

export interface ToolParameters {
	type: "object";
	properties: Record<string, JsonSchemaProperty>;
	required?: string[];
}

export interface ToolResult {
	ok: boolean;
	output: string;
}

/** Services the tool handlers / loop need from the host (VS Code or a test). */
export interface HostContext {
	readonly workspaceRoot: string;
	readonly commandTimeoutSec: number;
	signal: AbortSignal;
	postEvent(event: HarnessEvent): void;
	requestApproval(req: ApprovalRequest): Promise<ApprovalDecision>;
	askUser(question: string, options?: string[]): Promise<string | undefined>;
	/** Stream live tool output (e.g. terminal chunks) to the UI. */
	emitToolOutput?(text: string): void;
	/** Structured diagnostics sink (Agent Kit output channel). */
	log?(level: "info" | "warn" | "error", message: string): void;
}

export interface ApprovalRequest {
	id: string;
	tool: string;
	title: string;
	detail: string;
}

export type ApprovalDecision = "approved" | "always" | "denied";

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: ToolParameters;
	requiresApproval: boolean;
	approvalTitle(args: Record<string, unknown>): string;
	approvalDetail(args: Record<string, unknown>): string;
	execute(args: Record<string, unknown>, ctx: HostContext): Promise<ToolResult>;
}

export interface ModelProfile {
	id: string;
	label: string;
	baseUrl: string;
	apiKey: string;
	model: string;
	temperature?: number;
	maxTokens?: number;
	extraHeaders?: Record<string, string>;
}

export interface LlmResponse {
	content: string;
	reasoning?: string;
	toolCalls: ToolCallRequest[];
	finishReason: string | null;
}

export interface StreamHandlers {
	onTextDelta?(delta: string): void;
	onReasoningDelta?(delta: string): void;
}

/** Streaming chat-completions client contract (OpenAI-compatible servers). */
export interface LlmClient {
	chat(
		messages: ChatMessage[],
		tools: { type: "function"; function: { name: string; description: string; parameters: ToolParameters } }[],
		handlers: StreamHandlers,
		signal?: AbortSignal,
		opts?: { /** Skip SSE and wait for one JSON payload (used when streams keep dropping). */
			nonStreaming?: boolean },
	): Promise<LlmResponse>;
	listModels(): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Events streamed from the harness to a UI layer.
// ---------------------------------------------------------------------------

export type HarnessEvent =
	| { type: "status"; phase: "thinking" | "executing" | "done" | "aborted" | "error"; detail?: string }
	| { type: "assistant_delta"; text: string }
	| { type: "reasoning_delta"; text: string }
	| { type: "assistant_message"; text: string; reasoning?: string }
	| { type: "tool_start"; callId: string; name: string; argsSummary: string }
	| { type: "tool_output"; callId: string; text: string }
	| { type: "tool_result"; callId: string; ok: boolean; output: string }
	| { type: "iteration"; current: number; max: number }
	| { type: "usage"; iterations: number }
	/** A failed streaming attempt was discarded; receivers must clear their live buffers. */
	| { type: "stream_reset" };

export function summarizeArgs(args: Record<string, unknown>, maxLen = 160): string {
	try {
		const parts: string[] = [];
		for (const [k, v] of Object.entries(args)) {
			const s = typeof v === "string" ? v : JSON.stringify(v);
			parts.push(`${k}: ${s.length > 80 ? s.slice(0, 77) + "..." : s}`);
		}
		const joined = parts.join(", ");
		return joined.length > maxLen ? joined.slice(0, maxLen - 3) + "..." : joined || "{}";
	} catch {
		return "(unserializable args)";
	}
}

// ---------------------------------------------------------------------------
// Chat-history memory: what a finished/interrupted run should be remembered by
// ---------------------------------------------------------------------------

export interface RunActionRecord {
	name: string;
	argsSummary: string;
	ok?: boolean;
}

/**
 * Build the assistant-side memory entry for a finished run. For interrupted
 * runs this preserves WHAT the agent did (files touched, commands run) and any
 * partial output, so a follow-up like "continue" resumes from real context
 * instead of starting over.
 */
export function summarizeRunForHistory(opts: {
	status: string;
	fallbackSummary: string;
	texts: string[];
	partial: string;
	actions: RunActionRecord[];
	maxLen?: number;
}): string {
	if (opts.status === "completed") {
		return opts.fallbackSummary;
	}
	const parts: string[] = [];
	if (opts.texts.length > 0) {
		const last = opts.texts[opts.texts.length - 1].trim();
		if (last) parts.push(last);
	} else if (opts.partial.trim()) {
		parts.push("(partial response before interruption:) " + opts.partial.trim());
	}
	if (opts.actions.length > 0) {
		const lines = opts.actions.slice(-30).map((a) => {
			const mark = a.ok === undefined ? "" : a.ok ? " [ok]" : a.ok === false ? " [failed]" : "";
			return `- ${a.name}${a.argsSummary ? `(${a.argsSummary})` : ""}${mark}`;
		});
		parts.push("Work done in that request:\n" + lines.join("\n"));
	}
	if (parts.length === 0) return `(The previous request ended without completion: ${opts.status}. ${opts.fallbackSummary})`;

	let body = parts.join("\n");
	const cap = opts.maxLen ?? 6000;
	if (body.length > cap) body = body.slice(0, cap) + "\n... (truncated)";
	return `(The previous request "${opts.status === "aborted" ? "was interrupted" : `ended (${opts.status})`}." Context of that attempt follows — continue from here rather than redoing work.)\n${body}`;
}
