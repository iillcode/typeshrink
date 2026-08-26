import * as fs from "fs/promises";
import * as path from "path";
import { walk } from "../tools/paths";

export interface WorkspaceSnapshot {
	os: string;
	root: string;
	tree: string;
	activeFile?: string;
	selection?: string;
}

/** Gather lightweight workspace context for the system prompt. */
export async function collectWorkspaceSnapshot(root: string): Promise<WorkspaceSnapshot> {
	const lines: string[] = [];
	await walk(root, root, (_abs, rel, isDir) => {
		lines.push((isDir ? rel + "/" : rel));
		if (lines.length >= 120) return "stop";
	});
	return {
		os: `${process.platform} (${process.arch})`,
		root,
		tree: lines.length ? lines.join("\n") : "(empty workspace)",
	};
}

export function buildSystemPrompt(snapshot: WorkspaceSnapshot): string {
	return `You are Agent Kit, an expert autonomous software engineer working inside a VS Code extension.

# Environment
- OS: ${snapshot.os}
- Date: ${new Date().toISOString().slice(0, 10)}
- Workspace root: ${snapshot.root}

# Workspace layout (top entries)
${snapshot.tree}

# How you work
You complete the user's task by calling tools, one step at a time:
1. UNDERSTAND: read relevant files (read_file, list_files, search_files) before changing anything.
2. PLAN: for non-trivial tasks, state a short plan in text first.
3. ACT: create files with write_file — it auto-creates parent folders. Prefer edit_file for small changes to existing files. Use run_command for builds/tests/scaffolding, and run_automation for named pipelines defined in .agentkit/automations.json.
4. VERIFY: run compile/test commands after code changes when possible; fix what breaks.
5. FINISH: always end with attempt_completion containing a concise summary of changes.

# Rules
- Call tools with valid JSON arguments. Never invent tool names.
- All file paths must stay inside the workspace.
- write_file replaces the whole file: include complete content, never placeholders like "...".
- edit_file oldString must be copied exactly from the file (including indentation) and be unique.
- Do not re-read a file right after writing it; trust successful tool results.
- If requirements are ambiguous or you must choose between meaningfully different approaches, use ask_user once instead of guessing.
- Keep responses between tool calls short; the user sees your commentary as progress updates.`;
}

export function buildTaskMessage(task: string, activeFile?: string, selection?: string): string {
	let msg = `Task: ${task}`;
	if (activeFile) {
		msg += `\n\nThe user has this file open in the editor: ${activeFile}`;
		if (selection && selection.trim() !== "") {
			msg += `\nSelected text:\n\`\`\`\n${selection.slice(0, 2000)}\n\`\`\``;
		}
	}
	return msg;
}

export async function describeWorkspaceRoot(root: string): Promise<string> {
	try {
		const entries = await fs.readdir(root);
		return path.basename(root) + " [" + entries.slice(0, 12).join(", ") + (entries.length > 12 ? ", ..." : "") + "]";
	} catch {
		return root;
	}
}
