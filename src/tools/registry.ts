import { ToolDefinition } from "../harness/types";
import { getFsTools } from "./fsTools";
import { getAutomationTools } from "./execTools";
import { getInteractiveTools } from "./interactiveTools";

/** The full tool belt exposed to the model, in OpenAI `tools` format. */
export function buildToolRegistry(): ToolDefinition[] {
	return [...getFsTools(), ...getAutomationTools(), ...getInteractiveTools()];
}

export function toOpenAiTools(tools: ToolDefinition[]): {
	type: "function";
	function: { name: string; description: string; parameters: ToolDefinition["parameters"] };
}[] {
	return tools.map((t) => ({
		type: "function" as const,
		function: { name: t.name, description: t.description, parameters: t.parameters },
	}));
}
