import * as fs from "fs/promises";
import * as path from "path";
import { HostContext, ToolDefinition, ToolResult } from "../harness/types";
import { resolveInsideWorkspace, toRelative, walk } from "./paths";

const READ_MAX_LINES = 2000;

function str(args: Record<string, unknown>, key: string): string {
	const v = args[key];
	if (typeof v !== "string" || v.length === 0) {
		throw new Error(`Missing required string argument "${key}".`);
	}
	return v;
}

function optNum(args: Record<string, unknown>, key: string): number | undefined {
	const v = args[key];
	if (typeof v === "number" && Number.isFinite(v)) return v;
	return undefined;
}

export const readFileTool: ToolDefinition = {
	name: "read_file",
	description:
		"Read a text file from the workspace. Returns content with 1-based line numbers. " +
		"Use startLine/endLine for large files.",
	parameters: {
		type: "object",
		properties: {
			path: { type: "string", description: "Workspace-relative or absolute path inside the workspace." },
			startLine: { type: "number", description: "Optional 1-based first line to read." },
			endLine: { type: "number", description: "Optional 1-based last line to read." },
		},
		required: ["path"],
	},
	requiresApproval: false,
	approvalTitle: () => "",
	approvalDetail: () => "",
	async execute(args, ctx): Promise<ToolResult> {
		const abs = await resolveInsideWorkspace(ctx.workspaceRoot, str(args, "path"));
		const raw = await fs.readFile(abs, "utf8");
		const allLines = raw.split(/\r?\n/);
		const start = Math.max(1, optNum(args, "startLine") ?? 1);
		const end = Math.min(allLines.length, optNum(args, "endLine") ?? start + READ_MAX_LINES - 1);
		const slice = allLines.slice(start - 1, end).map((line, i) => `${start + i}| ${line}`);
		let out =
			`File ${toRelative(ctx.workspaceRoot, abs)} (${allLines.length} lines total):\n` + slice.join("\n");
		if (end < allLines.length) {
			out += `\n... (${allLines.length - end} more lines; use endLine=${allLines.length} to read the rest)`;
		}
		return { ok: true, output: out };
	},
};

export const writeFileTool: ToolDefinition = {
	name: "write_file",
	description:
		"Create or overwrite a file with full content. Parent folders are created automatically " +
		"(e.g. src/components/Button.tsx creates src and components if missing). " +
		"For small changes to existing files prefer edit_file.",
	parameters: {
		type: "object",
		properties: {
			path: { type: "string", description: "Destination file path (workspace-relative recommended)." },
			content: { type: "string", description: "Complete file content to write." },
		},
		required: ["path", "content"],
	},
	requiresApproval: true,
	approvalTitle: (args) => `Create file: ${typeof args.path === "string" ? args.path : "?"}`,
	approvalDetail: (args) =>
		`${String(args.content ?? "").split("\n").length} lines will be written${
			typeof args.path === "string" ? ` to ${args.path}` : ""
		}.`,
	async execute(args, ctx): Promise<ToolResult> {
		const abs = await resolveInsideWorkspace(ctx.workspaceRoot, str(args, "path"));
		const content = str(args, "content");
		let existed = false;
		try {
			existed = (await fs.stat(abs)).isFile();
		} catch {
			existed = false;
		}
		await fs.mkdir(path.dirname(abs), { recursive: true });
		await fs.writeFile(abs, content, "utf8");
		ctx.postEvent({
			type: "status",
			phase: "executing",
			detail: `${existed ? "Updated" : "Created"} ${toRelative(ctx.workspaceRoot, abs)}`,
		});
		return {
			ok: true,
			output: `${existed ? "Overwrote" : "Created"} file ${toRelative(ctx.workspaceRoot, abs)} ` +
				`(${Buffer.byteLength(content)} bytes${existed ? "" : ", parent folders created"}).`,
		};
	},
};

export const editFileTool: ToolDefinition = {
	name: "edit_file",
	description:
		"Replace an exact snippet inside an existing file. oldString must match the file exactly " +
		"(whitespace included) and be unique unless occurrence (1-based) is provided. " +
		"Keep oldString as small as possible while staying unique.",
	parameters: {
		type: "object",
		properties: {
			path: { type: "string", description: "Existing file to modify." },
			oldString: { type: "string", description: "Exact current snippet to replace." },
			newString: { type: "string", description: "Replacement snippet." },
			occurrence: { type: "number", description: "1-based occurrence to replace when oldString appears multiple times." },
		},
		required: ["path", "oldString", "newString"],
	},
	requiresApproval: true,
	approvalTitle: (args) => `Edit file: ${typeof args.path === "string" ? args.path : "?"}`,
	approvalDetail: (args) => `Replace:\n${String(args.oldString ?? "").slice(0, 300)}\nwith:\n${String(args.newString ?? "").slice(0, 300)}`,
	async execute(args, ctx): Promise<ToolResult> {
		const abs = await resolveInsideWorkspace(ctx.workspaceRoot, str(args, "path"));
		const oldString = str(args, "oldString");
		const newString = str(args, "newString");
		const occurrence = optNum(args, "occurrence");

		const raw = await fs.readFile(abs, "utf8");
		const count = countOccurrences(raw, oldString);
		if (count === 0) {
			return { ok: false, output: `oldString not found in ${toRelative(ctx.workspaceRoot, abs)}. Re-read the file and retry with an exact copy.` };
		}
		if (count > 1 && occurrence === undefined) {
			return { ok: false, output: `oldString appears ${count} times in ${toRelative(ctx.workspaceRoot, abs)}. Provide a larger unique snippet or pass occurrence.` };
		}
		const replaced = replaceOccurrence(raw, oldString, newString, occurrence ?? 1);
		if (replaced === null) {
			return { ok: false, output: `Occurrence ${occurrence} not found (file has ${count} match(es)).` };
		}
		await fs.writeFile(abs, replaced, "utf8");
		return { ok: true, output: `Edited ${toRelative(ctx.workspaceRoot, abs)}: replaced ${oldString.split("\n").length} line(s).` };
	},
};

export const listFilesTool: ToolDefinition = {
	name: "list_files",
	description: "List files and folders under a directory of the workspace.",
	parameters: {
		type: "object",
		properties: {
			path: { type: "string", description: "Directory to list. Defaults to workspace root." },
			recursive: { type: "boolean", description: "Descend into subfolders (node_modules/.git skipped). Default false." },
		},
	},
	requiresApproval: false,
	approvalTitle: () => "",
	approvalDetail: () => "",
	async execute(args, ctx): Promise<ToolResult> {
		const rootArg = typeof args.path === "string" && args.path !== "" ? args.path : ".";
		const abs = await resolveInsideWorkspace(ctx.workspaceRoot, rootArg);
		const recursive = args.recursive === true;
		const lines: string[] = [];
		if (!recursive) {
			const entries = await fs.readdir(abs, { withFileTypes: true });
			for (const e of entries.slice(0, 500)) {
				lines.push(e.isDirectory() ? `${e.name}/` : e.name);
			}
		} else {
			await walk(abs, ctx.workspaceRoot, (_abs, rel, isDir) => {
				lines.push(isDir ? rel + "/" : rel);
				if (lines.length >= 800) return "stop";
			});
		}
		return {
			ok: true,
			output: lines.length
				? `Contents of ${toRelative(ctx.workspaceRoot, abs)}${recursive ? " (recursive)" : ""}:\n` + lines.join("\n")
				: `${toRelative(ctx.workspaceRoot, abs)} is empty.`,
		};
	},
};

export const searchFilesTool: ToolDefinition = {
	name: "search_files",
	description:
		"Search file contents with a JavaScript regular expression across the workspace. " +
		"Returns file:line matches. Use this to locate code before editing it.",
	parameters: {
		type: "object",
		properties: {
			pattern: { type: "string", description: "Regular expression (e.g. \"function\\s+handle[A-Z]\")." },
			path: { type: "string", description: "Optional subdirectory scope." },
			caseSensitive: { type: "boolean", description: "Default false." },
		},
		required: ["pattern"],
	},
	requiresApproval: false,
	approvalTitle: () => "",
	approvalDetail: () => "",
	async execute(args, ctx): Promise<ToolResult> {
		let regex: RegExp;
		try {
			regex = new RegExp(str(args, "pattern"), args.caseSensitive === true ? "" : "i");
		} catch (err) {
			return { ok: false, output: `Invalid regular expression: ${(err as Error).message}` };
		}
		const scopeArg = typeof args.path === "string" && args.path !== "" ? args.path : ".";
		const scopeAbs = await resolveInsideWorkspace(ctx.workspaceRoot, scopeArg);

		const matches: string[] = [];
		let scannedFiles = 0;
		await walk(scopeAbs, ctx.workspaceRoot, async (abs, rel) => {
			scannedFiles++;
			const stat = await fs.stat(abs);
			if (stat.size > 512 * 1024) return;
			let content: string;
			try {
				const buf = await fs.readFile(abs);
				content = buf.toString("utf8");
				if (content.includes("\u0000")) return; // binary
			} catch {
				return;
			}
			const lines = content.split(/\r?\n/);
			for (let i = 0; i < lines.length && matches.length < 200; i++) {
				if (regex.test(lines[i])) {
					matches.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
				}
			}
			if (matches.length >= 200) return "stop";
		});

		return {
			ok: true,
			output: matches.length
				? `${matches.length} match(es) across ${scannedFiles} scanned file(s):\n` + matches.join("\n")
				: `No matches for /${str(args, "pattern")}/ in ${scannedFiles} file(s).`,
		};
	},
};

function countOccurrences(haystack: string, needle: string): number {
	let n = 0;
	let i = haystack.indexOf(needle);
	while (i >= 0) {
		n++;
		i = haystack.indexOf(needle, i + needle.length);
	}
	return n;
}

function replaceOccurrence(haystack: string, needle: string, replacement: string, occurrence: number): string | null {
	let idx = -1;
	for (let k = 0; k < occurrence; k++) {
		idx = haystack.indexOf(needle, idx + 1);
		if (idx < 0) return null;
		if (k < occurrence - 1) continue;
	}
	if (idx < 0) return null;
	return haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length);
}

export function getFsTools(): ToolDefinition[] {
	return [readFileTool, writeFileTool, editFileTool, listFilesTool, searchFilesTool];
}
