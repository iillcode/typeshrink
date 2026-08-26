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
exports.resolveInsideWorkspace = resolveInsideWorkspace;
exports.toRelative = toRelative;
exports.walk = walk;
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const IS_WIN = process.platform === "win32";
function samePath(a, b) {
    return IS_WIN ? a.toLowerCase() === b.toLowerCase() : a === b;
}
function isInside(resolved, base) {
    if (samePath(resolved, base))
        return true;
    const rel = path.relative(IS_WIN ? base.toLowerCase() : base, IS_WIN ? resolved.toLowerCase() : resolved);
    if (rel === "" || path.isAbsolute(rel))
        return false;
    return !rel.split(path.sep)[0].startsWith("..");
}
/**
 * Resolve a user/model-supplied path against the workspace root and refuse
 * anything that escapes it (symlinks are resolved first). Case-insensitive on
 * Windows: fs.realpath canonicalizes drive-letter/segment casing, which may
 * differ from how VS Code reported the folder (c:\ vs C:\) even though the
 * path is the same file.
 */
async function resolveInsideWorkspace(root, input) {
    const rawRoot = path.resolve(root);
    // Canonical root (fixes casing, 8.3 short names, subst/symlinked folders).
    const realRoot = await fs.realpath(rawRoot).catch(() => rawRoot);
    const candidate = path.isAbsolute(input) ? path.resolve(input) : path.resolve(rawRoot, input);
    let resolved;
    try {
        resolved = path.resolve(await fs.realpath(path.dirname(candidate)), path.basename(candidate));
    }
    catch {
        resolved = candidate; // parent dirs don't exist yet (write_file creates them)
    }
    if (!isInside(resolved, realRoot) && !isInside(resolved, rawRoot)) {
        throw new Error(`Path "${input}" resolves outside the workspace root (${rawRoot}). Refusing.` +
            (resolved.toLowerCase() !== rawRoot.toLowerCase()
                ? ` [resolved: ${resolved}]` : ""));
    }
    return resolved;
}
function toRelative(root, abs) {
    return path.relative(path.resolve(root), abs).split(path.sep).join("/") || ".";
}
const IGNORED_DIRS = new Set(["node_modules", ".git", ".svn", "dist", "out", "build", ".next", ".cache", ".vscode-test"]);
/** Recursively collect files/dirs under `dir`, capped, skipping heavy folders. */
async function walk(dir, root, visit, opts = {}) {
    const max = opts.maxEntries ?? 2000;
    let count = 0;
    const queue = [dir];
    while (queue.length > 0) {
        const current = queue.shift();
        let entries;
        try {
            entries = await fs.readdir(current, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (++count > max)
                return count;
            const abs = path.join(current, entry.name);
            const rel = toRelative(root, abs);
            if (entry.isDirectory()) {
                if (IGNORED_DIRS.has(entry.name))
                    continue;
                if ((await visit(abs, rel, true)) === "stop")
                    return count;
                queue.push(abs);
            }
            else if (entry.isFile()) {
                if ((await visit(abs, rel, false)) === "stop")
                    return count;
            }
        }
    }
    return count;
}
//# sourceMappingURL=paths.js.map