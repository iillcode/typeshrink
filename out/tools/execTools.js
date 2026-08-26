"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAutomationTool = exports.runCommandTool = void 0;
exports.runShellCommand = runShellCommand;
exports.sampleAutomationsJson = sampleAutomationsJson;
exports.getAutomationTools = getAutomationTools;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const paths_1 = require("./paths");
const OUTPUT_CAP = 10000;
function str(args, key) {
    const v = args[key];
    if (typeof v !== "string" || v.length === 0) {
        throw new Error(`Missing required string argument "${key}".`);
    }
    return v;
}
/**
 * Run a shell command in the workspace, capturing output. Kills the whole
 * process tree on timeout/abort (Windows-aware).
 */
function runShellCommand(command, cwd, ctx, timeoutSec) {
    const isWin = process.platform === "win32";
    const shell = isWin ? process.env.ComSpec || "cmd.exe" : "/bin/bash";
    const shellArgs = isWin ? ["/d", "/s", "/c", command] : ["-lc", command];
    return new Promise((resolve) => {
        let child;
        try {
            child = (0, child_process_1.spawn)(shell, shellArgs, {
                cwd,
                windowsHide: true,
                env: process.env,
                // Pass the command line verbatim so cmd.exe does its own quote
                // parsing — Node's default escaping breaks quoted paths + `&&`.
                windowsVerbatimArguments: isWin,
            });
        }
        catch (err) {
            resolve({ ok: false, exitCode: null, output: `Failed to spawn: ${err.message}`, timedOut: false });
            return;
        }
        const chunks = [];
        let timedOut = false;
        const collect = (d) => {
            if (chunks.reduce((n, b) => n + b.length, 0) < OUTPUT_CAP) {
                chunks.push(d);
                try {
                    ctx.emitToolOutput?.(d.toString("utf8"));
                }
                catch {
                    // UI sink failures must never break command execution
                }
            }
        };
        child.stdout?.on("data", collect);
        child.stderr?.on("data", collect);
        const timeoutMs = (timeoutSec ?? ctx.commandTimeoutSec) * 1000;
        const timer = setTimeout(() => {
            timedOut = true;
            killTree(child);
        }, timeoutMs);
        const onAbort = () => killTree(child);
        ctx.signal.addEventListener("abort", onAbort, { once: true });
        child.on("error", (err) => {
            clearTimeout(timer);
            ctx.signal.removeEventListener("abort", onAbort);
            resolve({ ok: false, exitCode: null, output: `Spawn error: ${err.message}`, timedOut });
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            ctx.signal.removeEventListener("abort", onAbort);
            let output = Buffer.concat(chunks).toString("utf8");
            if (output.length > OUTPUT_CAP)
                output += "\n... (output truncated)";
            resolve({
                ok: !timedOut && code === 0,
                exitCode: code,
                output,
                timedOut,
            });
        });
    });
}
function killTree(child) {
    if (!child.pid || child.exitCode !== null)
        return;
    if (process.platform === "win32") {
        (0, child_process_1.spawn)("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
    }
    else {
        child.kill("SIGKILL");
    }
}
function formatOutcome(command, outcome) {
    const header = `$ ${command}`;
    if (outcome.timedOut) {
        return `${header}\nCommand timed out and was terminated.\nOutput so far:\n${outcome.output}`;
    }
    const tail = outcome.output.trim() === "" ? "(no output)" : outcome.output;
    return `${header}\nexit code: ${outcome.exitCode ?? "unknown"}\n${tail}`;
}
exports.runCommandTool = {
    name: "run_command",
    description: "Execute a shell command in the workspace (installs deps, runs builds/tests/dev servers, git, scaffolding CLIs...). " +
        "Output is captured; the command is killed at the configured timeout. Requires user approval unless auto-approve is on.",
    parameters: {
        type: "object",
        properties: {
            command: { type: "string", description: "The shell command line to run." },
            cwd: { type: "string", description: "Optional subdirectory to run in (default: workspace root)." },
            timeoutSec: { type: "number", description: "Optional per-call timeout override." },
        },
        required: ["command"],
    },
    requiresApproval: true,
    approvalTitle: (args) => `Run command`,
    approvalDetail: (args) => `${typeof args.cwd === "string" && args.cwd !== "" ? `(${args.cwd}) ` : ""}${String(args.command ?? "")}`,
    async execute(args, ctx) {
        const cwd = typeof args.cwd === "string" && args.cwd !== ""
            ? await (0, paths_1.resolveInsideWorkspace)(ctx.workspaceRoot, args.cwd)
            : ctx.workspaceRoot;
        const outcome = await runShellCommand(str(args, "command"), cwd, ctx, typeof args.timeoutSec === "number" ? args.timeoutSec : undefined);
        return { ok: outcome.ok, output: formatOutcome(str(args, "command"), outcome) };
    },
};
const AUTOMATIONS_REL = path.join(".agentkit", "automations.json");
async function loadAutomations(root) {
    const abs = path.join(root, AUTOMATIONS_REL);
    const raw = await fs.readFile(abs, "utf8");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed.automations;
    if (!Array.isArray(list)) {
        throw new Error(`${AUTOMATIONS_REL} must be an array of automations or { "automations": [...] }.`);
    }
    return list.filter((a) => a && typeof a.name === "string" && Array.isArray(a.steps));
}
exports.runAutomationTool = {
    name: "run_automation",
    description: "Run a named automation defined in .agentkit/automations.json — sequential shell steps with per-step options. " +
        "Call without a name to list available automations.",
    parameters: {
        type: "object",
        properties: {
            name: { type: "string", description: "Automation name. Omit to list available automations." },
        },
    },
    requiresApproval: true,
    approvalTitle: (args) => `Run automation: ${typeof args.name === "string" ? args.name : "?"}`,
    approvalDetail: (args) => `Executes every step of "${String(args.name ?? "?")}" from .agentkit/automations.json.`,
    async execute(args, ctx) {
        let automations;
        try {
            automations = await loadAutomations(ctx.workspaceRoot);
        }
        catch (err) {
            return {
                ok: false,
                output: `No usable .agentkit/automations.json found (${err.message}).\n` +
                    `Create one with "Agent Kit: Initialize Workspace Config".`,
            };
        }
        const nameArg = typeof args.name === "string" && args.name !== "" ? args.name : undefined;
        if (!nameArg) {
            return {
                ok: true,
                output: "Available automations:\n" +
                    automations.map((a) => `- ${a.name}${a.description ? `: ${a.description}` : ""} (${a.steps.length} step(s))`).join("\n"),
            };
        }
        const automation = automations.find((a) => a.name === nameArg);
        if (!automation) {
            return { ok: false, output: `No automation named "${nameArg}". Available: ${automations.map((a) => a.name).join(", ") || "(none)"}.` };
        }
        const log = [];
        for (let i = 0; i < automation.steps.length; i++) {
            const step = automation.steps[i];
            log.push(`--- step ${i + 1}/${automation.steps.length} ---`);
            const cwd = step.cwd ? path.resolve(ctx.workspaceRoot, step.cwd) : ctx.workspaceRoot;
            const outcome = await runShellCommand(step.command, cwd, ctx, step.timeoutSec);
            log.push(formatOutcome(step.command, outcome));
            if (!outcome.ok && !step.continueOnError) {
                log.push(`Automation "${nameArg}" failed at step ${i + 1}; remaining steps skipped.`);
                return { ok: false, output: log.join("\n") };
            }
        }
        log.push(`Automation "${nameArg}" completed (${automation.steps.length} step(s)).`);
        return { ok: true, output: log.join("\n") };
    },
};
/** Sample config written by the init command. */
function sampleAutomationsJson() {
    return JSON.stringify({
        automations: [
            {
                name: "setup",
                description: "Install dependencies",
                steps: [{ command: "npm install" }],
            },
            {
                name: "verify",
                description: "Typecheck + test pipeline",
                steps: [
                    { command: "npm run compile", continueOnError: true },
                    { command: "npm test --if-present" },
                ],
            },
        ],
    }, null, 2) + "\n";
}
function getAutomationTools() {
    return [exports.runCommandTool, exports.runAutomationTool];
}
//# sourceMappingURL=execTools.js.map