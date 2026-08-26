"use strict";
// Core contracts of the agent harness. Pure Node — no `vscode` import so the
// loop, tools and LLM client are testable headlessly (see scripts/smoke.js).
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeArgs = summarizeArgs;
function summarizeArgs(args, maxLen = 160) {
    try {
        const parts = [];
        for (const [k, v] of Object.entries(args)) {
            const s = typeof v === "string" ? v : JSON.stringify(v);
            parts.push(`${k}: ${s.length > 80 ? s.slice(0, 77) + "..." : s}`);
        }
        const joined = parts.join(", ");
        return joined.length > maxLen ? joined.slice(0, maxLen - 3) + "..." : joined || "{}";
    }
    catch {
        return "(unserializable args)";
    }
}
//# sourceMappingURL=types.js.map