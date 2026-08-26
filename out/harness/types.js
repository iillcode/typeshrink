"use strict";
// Core contracts of the agent harness. Pure Node — no `vscode` import so the
// loop, tools and LLM client are testable headlessly (see scripts/smoke.js).
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeArgs = summarizeArgs;
exports.summarizeRunForHistory = summarizeRunForHistory;
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
/**
 * Build the assistant-side memory entry for a finished run. For interrupted
 * runs this preserves WHAT the agent did (files touched, commands run) and any
 * partial output, so a follow-up like "continue" resumes from real context
 * instead of starting over.
 */
function summarizeRunForHistory(opts) {
    if (opts.status === "completed") {
        return opts.fallbackSummary;
    }
    const parts = [];
    if (opts.texts.length > 0) {
        const last = opts.texts[opts.texts.length - 1].trim();
        if (last)
            parts.push(last);
    }
    else if (opts.partial.trim()) {
        parts.push("(partial response before interruption:) " + opts.partial.trim());
    }
    if (opts.actions.length > 0) {
        const lines = opts.actions.slice(-30).map((a) => {
            const mark = a.ok === undefined ? "" : a.ok ? " [ok]" : a.ok === false ? " [failed]" : "";
            return `- ${a.name}${a.argsSummary ? `(${a.argsSummary})` : ""}${mark}`;
        });
        parts.push("Work done in that request:\n" + lines.join("\n"));
    }
    if (parts.length === 0)
        return `(The previous request ended without completion: ${opts.status}. ${opts.fallbackSummary})`;
    let body = parts.join("\n");
    const cap = opts.maxLen ?? 6000;
    if (body.length > cap)
        body = body.slice(0, cap) + "\n... (truncated)";
    return `(The previous request "${opts.status === "aborted" ? "was interrupted" : `ended (${opts.status})`}." Context of that attempt follows — continue from here rather than redoing work.)\n${body}`;
}
//# sourceMappingURL=types.js.map