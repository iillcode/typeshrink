"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildToolRegistry = buildToolRegistry;
exports.toOpenAiTools = toOpenAiTools;
const fsTools_1 = require("./fsTools");
const execTools_1 = require("./execTools");
const interactiveTools_1 = require("./interactiveTools");
/** The full tool belt exposed to the model, in OpenAI `tools` format. */
function buildToolRegistry() {
    return [...(0, fsTools_1.getFsTools)(), ...(0, execTools_1.getAutomationTools)(), ...(0, interactiveTools_1.getInteractiveTools)()];
}
function toOpenAiTools(tools) {
    return tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
}
//# sourceMappingURL=registry.js.map