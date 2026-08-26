import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { HostContext, ToolDefinition, ToolResult } from "../harness/types";
import { resolveInsideWorkspace } from "./paths";

const OUTPUT_CAP = 10_000;

function str(args: Record<string, unknown>, key: string): string {
	const v = args[key];
	if (typeof v !== "string" || v.length === 0) {
		throw new Error(`Missing required string argument "${key}".`);
	}
	return v;
}

export interface CommandOutcome {
	ok: boolean;
	exitCode: number | null;
	output: string;
	timedOut: boolean;
}

/**
 * Run a shell command in the workspace, capturing output. Kills the whole
 * process tree on timeout/abort (Windows-aware).
 */
export function runShellCommand(command: string, cwd: string, ctx: HostContext, timeoutSec?: number): Promise<CommandOutcome> {
	const isWin = process.platform === "win32";
	const shell = isWin ? process.env.ComSpec || "cmd.exe" : "/bin/bash";
	const shellArgs = isWin ? ["/d", "/s", "/c", command] : ["-lc", command];

	return new Promise((resolve) => {
		let child;
		try {
			child = spawn(shell, shellArgs, {
				cwd,
				windowsHide: true,
				env: process.env,
				// Pass the command line verbatim so cmd.exe does its own quote
				// parsing — Node's default escaping breaks quoted paths + `&&`.
				windowsVerbatimArguments: isWin,
			});
		} catch (err) {
			resolve({ ok: false, exitCode: null, output: `Failed to spawn: ${(err as Error).message}`, timedOut: false });
			return;
		}

		const chunks: Buffer[] = [];
		let timedOut = false;
		const collect = (d: Buffer) => {
			if (chunks.reduce((n, b) => n + b.length, 0) < OUTPUT_CAP) {
				chunks.push(d);
				try {
					ctx.emitToolOutput?.(d.toString("utf8"));
				} catch {
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
			if (output.length > OUTPUT_CAP) output += "\n... (output truncated)";
			resolve({
				ok: !timedOut && code === 0,
				exitCode: code,
				output,
				timedOut,
			});
		});
	});
}

function killTree(child: ReturnType<typeof spawn>): void {
	if (!child.pid || child.exitCode !== null) return;
	if (process.platform === "win32") {
		spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
	} else {
		child.kill("SIGKILL");
	}
}

function formatOutcome(command: string, outcome: CommandOutcome): string {
	const header = `$ ${command}`;
	if (outcome.timedOut) {
		return `${header}\nCommand timed out and was terminated.\nOutput so far:\n${outcome.output}`;
	}
	const tail = outcome.output.trim() === "" ? "(no output)" : outcome.output;
	return `${header}\nexit code: ${outcome.exitCode ?? "unknown"}\n${tail}`;
}

export const runCommandTool: ToolDefinition = {
	name: "run_command",
	description:
		"Execute a shell command in the workspace (installs deps, runs builds/tests/dev servers, git, scaffolding CLIs...). " +
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
	async execute(args, ctx): Promise<ToolResult> {
		const cwd =
			typeof args.cwd === "string" && args.cwd !== ""
				? await resolveInsideWorkspace(ctx.workspaceRoot, args.cwd)
				: ctx.workspaceRoot;
		const outcome = await runShellCommand(str(args, "command"), cwd, ctx, typeof args.timeoutSec === "number" ? args.timeoutSec : undefined);
		return { ok: outcome.ok, output: formatOutcome(str(args, "command"), outcome) };
	},
};

// ---------------------------------------------------------------------------
// Named automations: .agentkit/automations.json
// ---------------------------------------------------------------------------

export interface AutomationStep {
	command: string;
	cwd?: string;
	continueOnError?: boolean;
	timeoutSec?: number;
}

export interface Automation {
	name: string;
	description?: string;
	steps: AutomationStep[];
}

const AUTOMATIONS_REL = path.join(".agentkit", "automations.json");

async function loadAutomations(root: string): Promise<Automation[]> {
	const abs = path.join(root, AUTOMATIONS_REL);
	const raw = await fs.readFile(abs, "utf8");
	const parsed = JSON.parse(raw) as unknown;
	const list = Array.isArray(parsed) ? parsed : (parsed as { automations?: unknown }).automations;
	if (!Array.isArray(list)) {
		throw new Error(`${AUTOMATIONS_REL} must be an array of automations or { "automations": [...] }.`);
	}
	return (list as Automation[]).filter((a) => a && typeof a.name === "string" && Array.isArray(a.steps));
}

export const runAutomationTool: ToolDefinition = {
	name: "run_automation",
	description:
		"Run a named automation defined in .agentkit/automations.json — sequential shell steps with per-step options. " +
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
	async execute(args, ctx): Promise<ToolResult> {
		let automations: Automation[];
		try {
			automations = await loadAutomations(ctx.workspaceRoot);
		} catch (err) {
			return {
				ok: false,
				output:
					`No usable .agentkit/automations.json found (${(err as Error).message}).\n` +
					`Create one with "Agent Kit: Initialize Workspace Config".`,
			};
		}

		const nameArg = typeof args.name === "string" && args.name !== "" ? args.name : undefined;
		if (!nameArg) {
			return {
				ok: true,
				output:
					"Available automations:\n" +
					automations.map((a) => `- ${a.name}${a.description ? `: ${a.description}` : ""} (${a.steps.length} step(s))`).join("\n"),
			};
		}

		const automation = automations.find((a) => a.name === nameArg);
		if (!automation) {
			return { ok: false, output: `No automation named "${nameArg}". Available: ${automations.map((a) => a.name).join(", ") || "(none)"}.` };
		}

		const log: string[] = [];
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
export function sampleAutomationsJson(): string {
	return JSON.stringify(
		{
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
		},
		null,
		2,
	) + "\n";
}

export function getAutomationTools(): ToolDefinition[] {
	return [runCommandTool, runAutomationTool];
}
