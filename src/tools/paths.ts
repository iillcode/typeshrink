import * as path from "path";
import * as fs from "fs/promises";

const IS_WIN = process.platform === "win32";

function samePath(a: string, b: string): boolean {
	return IS_WIN ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function isInside(resolved: string, base: string): boolean {
	if (samePath(resolved, base)) return true;
	const rel = path.relative(IS_WIN ? base.toLowerCase() : base, IS_WIN ? resolved.toLowerCase() : resolved);
	if (rel === "" || path.isAbsolute(rel)) return false;
	return !rel.split(path.sep)[0].startsWith("..");
}

/**
 * Resolve a user/model-supplied path against the workspace root and refuse
 * anything that escapes it (symlinks are resolved first). Case-insensitive on
 * Windows: fs.realpath canonicalizes drive-letter/segment casing, which may
 * differ from how VS Code reported the folder (c:\ vs C:\) even though the
 * path is the same file.
 */
export async function resolveInsideWorkspace(root: string, input: string): Promise<string> {
	const rawRoot = path.resolve(root);
	// Canonical root (fixes casing, 8.3 short names, subst/symlinked folders).
	const realRoot = await fs.realpath(rawRoot).catch(() => rawRoot);

	const candidate = path.isAbsolute(input) ? path.resolve(input) : path.resolve(rawRoot, input);
	let resolved: string;
	try {
		resolved = path.resolve(await fs.realpath(path.dirname(candidate)), path.basename(candidate));
	} catch {
		resolved = candidate; // parent dirs don't exist yet (write_file creates them)
	}

	if (!isInside(resolved, realRoot) && !isInside(resolved, rawRoot)) {
		throw new Error(
			`Path "${input}" resolves outside the workspace root (${rawRoot}). Refusing.` +
				(resolved.toLowerCase() !== rawRoot.toLowerCase()
				? ` [resolved: ${resolved}]` : ""),
		);
	}
	return resolved;
}

export function toRelative(root: string, abs: string): string {
	return path.relative(path.resolve(root), abs).split(path.sep).join("/") || ".";
}

const IGNORED_DIRS = new Set(["node_modules", ".git", ".svn", "dist", "out", "build", ".next", ".cache", ".vscode-test"]);

/** Recursively collect files/dirs under `dir`, capped, skipping heavy folders. */
export async function walk(
	dir: string,
	root: string,
	visit: (absPath: string, relPath: string, isDir: boolean) => void | "stop" | Promise<void | "stop">,
	opts: { maxEntries?: number } = {},
): Promise<number> {
	const max = opts.maxEntries ?? 2000;
	let count = 0;
	const queue: string[] = [dir];
	while (queue.length > 0) {
		const current = queue.shift()!;
		let entries;
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (++count > max) return count;
			const abs = path.join(current, entry.name);
			const rel = toRelative(root, abs);
			if (entry.isDirectory()) {
				if (IGNORED_DIRS.has(entry.name)) continue;
				if ((await visit(abs, rel, true)) === "stop") return count;
				queue.push(abs);
			} else if (entry.isFile()) {
				if ((await visit(abs, rel, false)) === "stop") return count;
			}
		}
	}
	return count;
}
