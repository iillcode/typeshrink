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
	| { type: "usage"; iterations: number };

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
