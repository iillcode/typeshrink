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
exports.collectWorkspaceSnapshot = collectWorkspaceSnapshot;
exports.buildSystemPrompt = buildSystemPrompt;
exports.buildTaskMessage = buildTaskMessage;
exports.describeWorkspaceRoot = describeWorkspaceRoot;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const paths_1 = require("../tools/paths");
/** Gather lightweight workspace context for the system prompt. */
async function collectWorkspaceSnapshot(root) {
    const lines = [];
    await (0, paths_1.walk)(root, root, (_abs, rel, isDir) => {
        lines.push((isDir ? rel + "/" : rel));
        if (lines.length >= 120)
            return "stop";
    });
    return {
        os: `${process.platform} (${process.arch})`,
        root,
        tree: lines.length ? lines.join("\n") : "(empty workspace)",
    };
}
function buildSystemPrompt(snapshot) {
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
function buildTaskMessage(task, activeFile, selection) {
    let msg = `Task: ${task}`;
    if (activeFile) {
        msg += `\n\nThe user has this file open in the editor: ${activeFile}`;
        if (selection && selection.trim() !== "") {
            msg += `\nSelected text:\n\`\`\`\n${selection.slice(0, 2000)}\n\`\`\``;
        }
    }
    return msg;
}
async function describeWorkspaceRoot(root) {
    try {
        const entries = await fs.readdir(root);
        return path.basename(root) + " [" + entries.slice(0, 12).join(", ") + (entries.length > 12 ? ", ..." : "") + "]";
    }
    catch {
        return root;
    }
}
//# sourceMappingURL=prompts.js.map