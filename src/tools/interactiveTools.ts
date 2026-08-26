import { HostContext, ToolDefinition, ToolResult } from "../harness/types";

export const COMPLETION_TOOL = "attempt_completion";

export const askUserTool: ToolDefinition = {
	name: "ask_user",
	description:
		"Ask the human a clarifying question when requirements are ambiguous or you must choose between approaches. " +
		"Provide options when possible; otherwise a free-text answer is collected.",
	parameters: {
		type: "object",
		properties: {
			question: { type: "string", description: "The question for the user." },
			options: {
				type: "string",
				description: 'Optional comma-separated choices, e.g. "TypeScript, JavaScript".',
			},
		},
		required: ["question"],
	},
	requiresApproval: false,
	approvalTitle: () => "",
	approvalDetail: () => "",
	async execute(args, ctx): Promise<ToolResult> {
		const question = typeof args.question === "string" ? args.question : "(empty question)";
		const options =
			typeof args.options === "string" && args.options.trim() !== ""
				? args.options.split(",").map((o) => o.trim()).filter((o) => o !== "")
				: undefined;
		const answer = await ctx.askUser(question, options);
		if (answer === undefined || answer === "") {
			return { ok: true, output: "User did not provide an answer. Proceed with your best judgment and say so." };
		}
		return { ok: true, output: `User answered: ${answer}` };
	},
};

export const attemptCompletionTool: ToolDefinition = {
	name: COMPLETION_TOOL,
	description:
		"Signal that the task is fully complete. Provide a concise summary of what was built/changed. " +
		"You MUST call this tool exactly once at the end of every task.",
	parameters: {
		type: "object",
		properties: {
			result: { type: "string", description: "Final summary of the completed work." },
		},
		required: ["result"],
	},
	requiresApproval: false,
	approvalTitle: () => "",
	approvalDetail: () => "",
	async execute(args, _ctx): Promise<ToolResult> {
		const result = typeof args.result === "string" && args.result.trim() !== "" ? args.result : "(no summary provided)";
		return { ok: true, output: result };
	},
};

export function getInteractiveTools(): ToolDefinition[] {
	return [askUserTool, attemptCompletionTool];
}
