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
exports.AgentPanelProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const agentRunner_1 = require("../harness/agentRunner");
const openaiCompat_1 = require("../llm/openaiCompat");
const webviewHtml_1 = require("./webviewHtml");
/** Max conversation-turn messages kept in model context (user+assistant). */
const MAX_HISTORY_MESSAGES = 30;
/**
 * Sidebar webview host: renders chat + settings, forwards harness events,
 * implements approvals/ask-user for the HostContext contract.
 */
class AgentPanelProvider {
    /** Re-render the status bar entry (call after external model changes). */
    refreshStatusBar() {
        this.onModelChanged?.();
    }
    constructor(extensionUri, modelConfig, tools) {
        this.extensionUri = extensionUri;
        this.modelConfig = modelConfig;
        this.tools = tools;
        this.transcript = [];
        this.busy = false;
        this.settingsVisible = false;
        /** Conversation memory for THIS chat: prior turns sent with every request. */
        this.history = [];
        this.autoApproveSession = modelConfig.isAutoApprovedForSession();
        this.runner = new agentRunner_1.AgentRunner({
            clientFactory: () => new openaiCompat_1.OpenAiCompatClient(this.requireActiveProfile()),
            tools,
        });
    }
    resolveWebviewView(view) {
        this.view = view;
        view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
        view.webview.html = (0, webviewHtml_1.getWebviewHtml)(view.webview, this.extensionUri);
        view.webview.onDidReceiveMessage((msg) => void this.handleWebviewMessage(msg));
        this.pushFullState();
    }
    requireActiveProfile() {
        const active = this.modelConfig.getActive();
        if (!active)
            throw new Error("No model profile configured.");
        return active;
    }
    // ------------------------------------------------------------------
    // Public API used by commands
    // ------------------------------------------------------------------
    async submitTask(task) {
        if (task.trim() === "")
            return;
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            const pick = await vscode.window.showErrorMessage("Agent Kit: open a file or folder first — the agent works inside your workspace.", "Open Folder...");
            if (pick === "Open Folder...") {
                void vscode.commands.executeCommand("vscode.openFolder");
            }
            return;
        }
        if (this.busy) {
            void vscode.window.showInformationMessage("Agent Kit: a task is already running. Stop it first.");
            return;
        }
        const profile = this.modelConfig.getActive();
        if (!profile || !profile.model || !profile.baseUrl) {
            this.settingsVisible = true;
            this.pushFullState();
            await this.reveal();
            void vscode.window.showErrorMessage("Agent Kit: pick a model first — open Settings in the Agent Kit panel.");
            return;
        }
        const editor = vscode.window.activeTextEditor;
        const activeFile = editor && vscode.workspace.getWorkspaceFolder(editor.document.uri)
            ? path.relative(this.workspaceRoot(), editor.document.uri.fsPath)
            : undefined;
        const selection = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : undefined;
        this.transcript.push({ kind: "user", text: task });
        this.busy = true;
        this.abortController = new AbortController();
        this.pushFullState();
        try {
            const settingAutoApprove = vscode.workspace.getConfiguration("agentKit").get("autoApprove", false);
            const bypass = this.autoApproveSession || settingAutoApprove;
            const result = await this.runner.run({
                postEvent: (e) => this.onHarnessEvent(e),
                requestApproval: bypass
                    ? () => Promise.resolve("approved")
                    : (req) => this.requestApproval(req),
                askUser: (question, options) => Promise.resolve(this.askUser(question, options)),
                workspaceRoot: this.workspaceRoot(),
                commandTimeoutSec: vscode.workspace.getConfiguration("agentKit").get("commandTimeoutSec", 120),
                signal: this.abortController.signal,
            }, {
                task,
                activeFile,
                selection,
                maxIterations: vscode.workspace.getConfiguration("agentKit").get("maxIterations", 40),
                history: this.history.slice(),
            });
            if (result.status !== "completed") {
                this.transcript.push({
                    kind: "notice",
                    text: result.status === "error" ? `Error: ${result.summary}` : result.summary,
                });
            }
            this.rememberTurn(task, result);
        }
        finally {
            this.busy = false;
            this.abortController = undefined;
            this.pushFullState();
        }
    }
    /**
     * Append this exchange to the chat's model context so follow-up requests
     * contain the previous conversation. Kept to a bounded window.
     */
    rememberTurn(task, result) {
        const answer = result.status === "completed"
            ? result.summary
            : `(The previous request ended without completion: ${result.status}. ${result.summary})`;
        this.history.push({ role: "user", content: task }, { role: "assistant", content: answer.slice(0, 8000) });
        if (this.history.length > MAX_HISTORY_MESSAGES) {
            this.history = this.history.slice(-MAX_HISTORY_MESSAGES);
        }
    }
    cancel() {
        this.abortController?.abort();
        if (this.pendingApproval) {
            this.pendingApproval.resolve("denied");
            this.pendingApproval = undefined;
        }
        this.pushFullState();
    }
    newTask() {
        if (this.busy)
            this.cancel();
        this.transcript = [];
        this.history = []; // fresh chat -> fresh model context
        this.settingsVisible = false;
        this.runner.resetSessionApprovals();
        this.pushFullState();
    }
    openSettings() {
        this.settingsVisible = true;
        this.pushFullState();
        void this.reveal();
    }
    // ------------------------------------------------------------------
    // Harness event plumbing
    // ------------------------------------------------------------------
    onHarnessEvent(e) {
        switch (e.type) {
            case "assistant_message":
                this.transcript.push({ kind: "assistant", text: e.text, reasoning: e.reasoning });
                break;
            case "tool_start":
                this.transcript.push({
                    kind: "tool",
                    callId: e.callId,
                    name: e.name,
                    argsSummary: e.argsSummary,
                    status: "running",
                });
                break;
            case "tool_result": {
                const entry = [...this.transcript].reverse().find((t) => t.kind === "tool" && t.callId === e.callId);
                if (entry) {
                    entry.status = e.output === "(denied)" ? "denied" : e.ok ? "ok" : "error";
                    entry.output = e.output;
                }
                break;
            }
        }
        void this.view?.webview.postMessage(e);
    }
    requestApproval(req) {
        return new Promise((resolve) => {
            this.pendingApproval = { ...req, resolve };
            this.pushFullState();
            void this.reveal();
        });
    }
    askUser(question, options) {
        void this.reveal();
        if (options && options.length > 0) {
            return vscode.window.showQuickPick(options, { placeHolder: question, ignoreFocusOut: true });
        }
        return vscode.window.showInputBox({ prompt: question, ignoreFocusOut: true });
    }
    // ------------------------------------------------------------------
    // Webview message handling
    // ------------------------------------------------------------------
    async handleWebviewMessage(msg) {
        switch (msg.type) {
            case "ready":
                this.pushFullState();
                break;
            case "submit":
                await this.submitTask(String(msg.task ?? ""));
                break;
            case "cancel":
                this.cancel();
                break;
            case "newTask":
                this.newTask();
                break;
            case "approval": {
                const decision = msg.decision;
                if (this.pendingApproval && this.pendingApproval.id === msg.id) {
                    this.pendingApproval.resolve(decision);
                    this.pendingApproval = undefined;
                    this.pushFullState();
                }
                else if (msg.id === "legacy") {
                    // stale approval card; nothing to do
                }
                break;
            }
            case "autoApprove":
                this.autoApproveSession = msg.value === true;
                await this.modelConfig.setSessionAutoApprove(this.autoApproveSession);
                this.pushFullState();
                break;
            case "openSettings":
                this.openSettings();
                break;
            case "closeSettings":
                this.settingsVisible = false;
                this.pushFullState();
                break;
            case "saveProfile": {
                await this.saveProfile((msg.profile ?? {}), msg.makeActive === true);
                break;
            }
            case "deleteProfile":
                await this.modelConfig.deleteProfile(String(msg.id));
                this.onModelChanged?.();
                this.pushFullState();
                break;
            case "setActiveProfile":
                await this.modelConfig.setActive(String(msg.id));
                this.settingsVisible = false;
                this.onModelChanged?.();
                this.pushFullState();
                break;
            case "fetchModels": {
                const p = (msg.profile ?? {});
                try {
                    const client = new openaiCompat_1.OpenAiCompatClient({
                        id: "probe",
                        label: "probe",
                        baseUrl: String(p.baseUrl ?? "").replace(/\/+$/, ""),
                        apiKey: String(p.apiKey ?? ""),
                        model: "",
                    });
                    const models = await client.listModels();
                    await this.view?.webview.postMessage({ type: "modelsResult", baseUrl: p.baseUrl, models });
                }
                catch (err) {
                    await this.view?.webview.postMessage({
                        type: "modelsResult",
                        baseUrl: p.baseUrl,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
                break;
            }
        }
    }
    async saveProfile(p, makeActive) {
        if (!p.baseUrl) {
            void vscode.window.showErrorMessage("Agent Kit: base URL is required.");
            return;
        }
        const existing = this.modelConfig.listProfiles().find((x) => x.id === p.id);
        const label = p.label || existing?.label || AgentPanelProvider.deriveLabel(String(p.baseUrl));
        const profile = {
            id: p.id ?? Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
            label,
            baseUrl: String(p.baseUrl).replace(/\/+$/, ""),
            apiKey: String(p.apiKey ?? ""),
            model: String(p.model ?? ""),
            temperature: typeof p.temperature === "number" && Number.isFinite(p.temperature) ? p.temperature : undefined,
            maxTokens: typeof p.maxTokens === "number" && p.maxTokens > 0 ? Math.floor(p.maxTokens) : undefined,
        };
        await this.modelConfig.upsertProfile(profile);
        if (makeActive || !existing) {
            await this.modelConfig.setActive(profile.id);
        }
        this.onModelChanged?.();
        this.settingsVisible = false;
        this.pushFullState();
    }
    static deriveLabel(baseUrl) {
        try {
            return new URL(baseUrl).hostname;
        }
        catch {
            return "Custom endpoint";
        }
    }
    pushFullState() {
        const active = this.modelConfig.getActive();
        void this.view?.webview.postMessage({
            type: "state",
            state: {
                profiles: this.modelConfig.listProfiles(),
                activeProfileId: active?.id ?? "",
                autoApprove: this.autoApproveSession,
                busy: this.busy,
                settingsVisible: this.settingsVisible,
                transcript: this.transcript,
                pendingApproval: this.pendingApproval
                    ? { id: this.pendingApproval.id, tool: this.pendingApproval.tool, title: this.pendingApproval.title, detail: this.pendingApproval.detail }
                    : null,
                activeLabel: active ? `${active.label} · ${active.model || "(no model set)"}` : "(no model)",
            },
        });
    }
    workspaceRoot() {
        const folder = vscode.workspace.workspaceFolders?.[0];
        return folder ? folder.uri.fsPath : this.extensionUri.fsPath;
    }
    async reveal() {
        try {
            await this.view?.show(true);
        }
        catch {
            // View not created yet (never focused); state will render on first open.
        }
    }
}
exports.AgentPanelProvider = AgentPanelProvider;
AgentPanelProvider.viewId = "agentKit.sidebarView";
//# sourceMappingURL=agentPanelProvider.js.map