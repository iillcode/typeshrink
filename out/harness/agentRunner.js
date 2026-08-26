"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRunner = void 0;
const types_1 = require("./types");
const prompts_1 = require("./prompts");
const registry_1 = require("../tools/registry");
const interactiveTools_1 = require("../tools/interactiveTools");
const openaiCompat_1 = require("../llm/openaiCompat");
/**
 * The agent loop (harness core):
 *   user task -> LLM -> tool calls -> execute (with approvals) -> feed results
 *   back -> repeat until attempt_completion / abort / max iterations.
 *
 * Pure Node + injected dependencies so it runs headlessly in tests.
 */
class AgentRunner {
    constructor(deps) {
        this.deps = deps;
        this.sessionApproved = new Set();
    }
    resetSessionApprovals() {
        this.sessionApproved.clear();
    }
    async run(ctx, opts) {
        const toolsByName = new Map(this.deps.tools.map((t) => [t.name, t]));
        const openAiTools = (0, registry_1.toOpenAiTools)(this.deps.tools);
        const snapshot = await (0, prompts_1.collectWorkspaceSnapshot)(ctx.workspaceRoot);
        const messages = [
            { role: "system", content: (0, prompts_1.buildSystemPrompt)(snapshot) },
            ...(opts.history ?? []),
            { role: "user", content: (0, prompts_1.buildTaskMessage)(opts.task, opts.activeFile, opts.selection) },
        ];
        const client = this.deps.clientFactory();
        let iterations = 0;
        try {
            while (iterations < opts.maxIterations) {
                if (ctx.signal.aborted) {
                    return this.finish(ctx, iterations, "aborted", "Task aborted by user.");
                }
                iterations++;
                ctx.postEvent({ type: "iteration", current: iterations, max: opts.maxIterations });
                ctx.postEvent({ type: "status", phase: "thinking" });
                ctx.log?.("info", `iteration ${iterations}/${opts.maxIterations} — requesting completion`);
                const response = await this.chatWithRetry(ctx, client, messages, openAiTools);
                if (ctx.signal.aborted) {
                    return this.finish(ctx, iterations, "aborted", "Task aborted by user.");
                }
                if (response.toolCalls.length === 0) {
                    messages.push({ role: "assistant", content: response.content || "(empty response)" });
                    if (response.finishReason === "stop" && response.content.trim() !== "" && this.looksLikeFinalAnswer(response.content)) {
                        return this.finish(ctx, iterations, "completed", response.content);
                    }
                    messages.push({
                        role: "user",
                        content: "Continue working on the task using the provided tools. When everything is done, call the " +
                            interactiveTools_1.COMPLETION_TOOL +
                            " tool with a result summary.",
                    });
                    continue;
                }
                // Reasoning-only turns: don't emit an invisible empty message entry.
                if (response.content.trim() !== "" || response.reasoning) {
                    ctx.postEvent({
                        type: "assistant_message",
                        text: response.content,
                        reasoning: response.reasoning,
                    });
                }
                messages.push({
                    role: "assistant",
                    content: response.content || null,
                    tool_calls: response.toolCalls,
                });
                for (const call of response.toolCalls) {
                    if (ctx.signal.aborted) {
                        return this.finish(ctx, iterations, "aborted", "Task aborted by user.");
                    }
                    const outcome = await this.executeCall(call, toolsByName, ctx);
                    messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: outcome });
                    if (call.function.name === interactiveTools_1.COMPLETION_TOOL) {
                        const summary = extractResultText(outcome);
                        // The completion tool's result IS the final answer — post it as a
                        // visible assistant message, otherwise the chat shows only the
                        // tool steps and the user never sees the response.
                        ctx.postEvent({ type: "assistant_message", text: summary });
                        return this.finish(ctx, iterations, "completed", summary);
                    }
                }
            }
            return this.finish(ctx, iterations, "max_iterations", `Stopped after ${opts.maxIterations} iterations. Ask the agent to continue if more work is needed.`);
        }
        catch (err) {
            if (err instanceof openaiCompat_1.AbortedError || ctx.signal.aborted || err?.name === "AbortError") {
                return this.finish(ctx, iterations, "aborted", "Task aborted by user.");
            }
            const message = err instanceof Error ? err.message : String(err);
            ctx.postEvent({ type: "status", phase: "error", detail: message });
            return { status: "error", summary: message };
        }
        finally {
            ctx.postEvent({ type: "usage", iterations });
        }
    }
    looksLikeFinalAnswer(content) {
        // Heuristic: a bare text answer with no completion call is only accepted when it is short —
        // otherwise the model probably forgot the completion tool and we nudge it instead.
        return content.trim().length < 400;
    }
    /**
     * Stream a completion, retrying transient connection drops (undici "terminated",
     * ECONNRESET, socket hang up...). Long generations — e.g. models writing large
     * files chunk by chunk — are the most likely to be cut mid-stream.
     */
    async chatWithRetry(ctx, client, messages, openAiTools) {
        const MAX_ATTEMPTS = 5;
        for (let attempt = 1;; attempt++) {
            // Streams that keep dying mid-generation get retried as a single
            // non-streaming request — gateways that reset long SSE connections
            // usually accept a plain request/response for the same payload.
            const nonStreaming = attempt >= 3;
            if (nonStreaming)
                ctx.log?.("warn", "falling back to non-streaming request for this completion");
            try {
                return await client.chat(messages, openAiTools, {
                    onTextDelta: (d) => ctx.postEvent({ type: "assistant_delta", text: d }),
                    onReasoningDelta: (d) => ctx.postEvent({ type: "reasoning_delta", text: d }),
                }, ctx.signal, { nonStreaming });
            }
            catch (err) {
                if (err instanceof openaiCompat_1.AbortedError || ctx.signal.aborted)
                    throw err;
                if (!AgentRunner.isTransient(err) || attempt >= MAX_ATTEMPTS) {
                    ctx.log?.("error", `Completion failed after ${attempt} attempt(s): ${err instanceof Error ? err.message : String(err)}`);
                    throw err;
                }
                ctx.log?.("warn", `Transient stream drop (attempt ${attempt}/${MAX_ATTEMPTS}): ${err instanceof Error ? err.message : String(err)}`);
                ctx.postEvent({ type: "stream_reset" });
                ctx.postEvent({
                    type: "status",
                    phase: "executing",
                    detail: `connection lost during generation — resuming attempt ${attempt + 1}/${MAX_ATTEMPTS}`,
                });
                await new Promise((r) => setTimeout(r, Math.min(800 * attempt, 4000)));
                if (ctx.signal.aborted)
                    throw err;
            }
        }
    }
    static isTransient(err) {
        if (!(err instanceof Error))
            return false;
        const haystack = [
            err.message ?? "",
            String(err.cause?.code ?? ""),
            String(err.cause?.message ?? ""),
            String(err.code ?? ""),
        ].join(" ").toLowerCase();
        return /terminated|econnreset|socket hang up|epipe|fetch failed|network|premature close|other side closed|connection (closed|reset)|aborted connection/.test(haystack);
    }
    async executeCall(call, toolsByName, ctx) {
        const tool = toolsByName.get(call.function.name);
        ctx.postEvent({ type: "status", phase: "executing", detail: call.function.name });
        if (!tool) {
            const msg = `Unknown tool "${call.function.name}". Available tools: ${[...toolsByName.keys()].join(", ")}.`;
            ctx.postEvent({ type: "tool_result", callId: call.id, ok: false, output: msg });
            return msg;
        }
        let args;
        try {
            args = JSON.parse(call.function.arguments || "{}");
        }
        catch (err) {
            const msg = `Invalid JSON arguments for ${tool.name}: ${err.message}`;
            ctx.postEvent({ type: "tool_result", callId: call.id, ok: false, output: msg });
            return msg;
        }
        ctx.postEvent({ type: "tool_start", callId: call.id, name: tool.name, argsSummary: (0, types_1.summarizeArgs)(args) });
        // Per-call context: tag streamed output chunks with this call's id so the
        // UI can route them to the right activity card.
        const callCtx = Object.assign({}, ctx, {
            emitToolOutput: (text) => ctx.postEvent({ type: "tool_output", callId: call.id, text }),
        });
        if (tool.requiresApproval && !this.sessionApproved.has(tool.name)) {
            const decision = await ctx.requestApproval({
                id: call.id,
                tool: tool.name,
                title: tool.approvalTitle(args),
                detail: tool.approvalDetail(args),
            });
            if (decision === "denied") {
                ctx.postEvent({ type: "tool_result", callId: call.id, ok: false, output: "(denied)" });
                return "User declined this action. Adjust your approach or explain why it is needed.";
            }
            if (decision === "always") {
                this.sessionApproved.add(tool.name);
            }
        }
        try {
            const result = await tool.execute(args, callCtx);
            const output = truncate(result.output, 8000);
            ctx.postEvent({ type: "tool_result", callId: call.id, ok: result.ok, output: truncate(result.output, 1200) });
            return output;
        }
        catch (err) {
            const msg = `Tool ${tool.name} failed: ${err instanceof Error ? err.message : String(err)}`;
            ctx.log?.("error", msg);
            ctx.postEvent({ type: "tool_result", callId: call.id, ok: false, output: truncate(msg, 1200) });
            return msg;
        }
    }
    finish(ctx, iterations, status, summary) {
        ctx.postEvent({
            type: "status",
            phase: status === "completed" ? "done" : status === "max_iterations" ? "aborted" : status,
            detail: summary,
        });
        void iterations;
        return { status, summary };
    }
}
exports.AgentRunner = AgentRunner;
function extractResultText(toolOutput) {
    return toolOutput;
}
function truncate(s, n) {
    if (s.length <= n)
        return s;
    return s.slice(0, n) + `\n... (${s.length - n} chars truncated)`;
}
//# sourceMappingURL=agentRunner.js.map