import * as vscode from "vscode";
import * as path from "path";
import { AgentRunner } from "../harness/agentRunner";
import { ApprovalDecision, ChatMessage, HarnessEvent, ModelProfile, ToolDefinition } from "../harness/types";
import { ModelConfigManager } from "../config/modelProfiles";
import { OpenAiCompatClient } from "../llm/openaiCompat";
import { getWebviewHtml } from "./webviewHtml";

interface TranscriptEntry {
	kind: "user" | "assistant" | "tool" | "notice";
	text?: string;
	reasoning?: string;
	callId?: string;
	name?: string;
	argsSummary?: string;
	status?: "running" | "ok" | "error" | "denied";
	output?: string;
}

interface PendingApproval {
	id: string;
	tool: string;
	title: string;
	detail: string;
	resolve: (d: ApprovalDecision) => void;
}

/** Max conversation-turn messages kept in model context (user+assistant). */
const MAX_HISTORY_MESSAGES = 30;

/**
 * Sidebar webview host: renders chat + settings, forwards harness events,
 * implements approvals/ask-user for the HostContext contract.
 */
export class AgentPanelProvider implements vscode.WebviewViewProvider {
	public static readonly viewId = "agentKit.sidebarView";

	private view?: vscode.WebviewView;
	private readonly runner: AgentRunner;
	private transcript: TranscriptEntry[] = [];
	private busy = false;
	private autoApproveSession: boolean;
	private abortController?: AbortController;
	private pendingApproval?: PendingApproval;
	private settingsVisible = false;
	/** Conversation memory for THIS chat: prior turns sent with every request. */
	private history: ChatMessage[] = [];

	/** Wired by extension.ts to refresh the status bar entry. */
	public onModelChanged?: () => void;

	/** Re-render the status bar entry (call after external model changes). */
	public refreshStatusBar(): void {
		this.onModelChanged?.();
	}

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly modelConfig: ModelConfigManager,
		private readonly tools: ToolDefinition[],
	) {
		this.autoApproveSession = modelConfig.isAutoApprovedForSession();
		this.runner = new AgentRunner({
			clientFactory: () => new OpenAiCompatClient(this.requireActiveProfile()),
			tools,
		});
	}

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
		view.webview.html = getWebviewHtml(view.webview, this.extensionUri);
		view.webview.onDidReceiveMessage((msg) => void this.handleWebviewMessage(msg));
		this.pushFullState();
	}

	private requireActiveProfile(): ModelProfile {
		const active = this.modelConfig.getActive();
		if (!active) throw new Error("No model profile configured.");
		return active;
	}

	// ------------------------------------------------------------------
	// Public API used by commands
	// ------------------------------------------------------------------

	public async submitTask(task: string): Promise<void> {
		if (task.trim() === "") return;
		if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
			const pick = await vscode.window.showErrorMessage(
				"Agent Kit: open a file or folder first — the agent works inside your workspace.",
				"Open Folder...",
			);
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
			const settingAutoApprove = vscode.workspace.getConfiguration("agentKit").get<boolean>("autoApprove", false);
			const bypass = this.autoApproveSession || settingAutoApprove;
			const result = await this.runner.run(
				{
					postEvent: (e) => this.onHarnessEvent(e),
					requestApproval: bypass
						? () => Promise.resolve("approved" as ApprovalDecision)
						: (req) => this.requestApproval(req),
					askUser: (question, options) => Promise.resolve(this.askUser(question, options)),
					workspaceRoot: this.workspaceRoot(),
					commandTimeoutSec: vscode.workspace.getConfiguration("agentKit").get<number>("commandTimeoutSec", 120),
					signal: this.abortController.signal,
				},
				{
					task,
					activeFile,
					selection,
					maxIterations: vscode.workspace.getConfiguration("agentKit").get<number>("maxIterations", 40),
					history: this.history.slice(),
				},
			);
			if (result.status !== "completed") {
				this.transcript.push({
					kind: "notice",
					text: result.status === "error" ? `Error: ${result.summary}` : result.summary,
				});
			}
			this.rememberTurn(task, result);
		} finally {
			this.busy = false;
			this.abortController = undefined;
			this.pushFullState();
		}
	}

	/**
	 * Append this exchange to the chat's model context so follow-up requests
	 * contain the previous conversation. Kept to a bounded window.
	 */
	private rememberTurn(task: string, result: { status: string; summary: string }): void {
		const answer = result.status === "completed"
			? result.summary
			: `(The previous request ended without completion: ${result.status}. ${result.summary})`;
		this.history.push(
			{ role: "user", content: task },
			{ role: "assistant", content: answer.slice(0, 8000) },
		);
		if (this.history.length > MAX_HISTORY_MESSAGES) {
			this.history = this.history.slice(-MAX_HISTORY_MESSAGES);
		}
	}

	public cancel(): void {
		this.abortController?.abort();
		if (this.pendingApproval) {
			this.pendingApproval.resolve("denied");
			this.pendingApproval = undefined;
		}
		this.pushFullState();
	}

	public newTask(): void {
		if (this.busy) this.cancel();
		this.transcript = [];
		this.history = []; // fresh chat -> fresh model context
		this.settingsVisible = false;
		this.runner.resetSessionApprovals();
		this.pushFullState();
	}

	public openSettings(): void {
		this.settingsVisible = true;
		this.pushFullState();
		void this.reveal();
	}

	// ------------------------------------------------------------------
	// Harness event plumbing
	// ------------------------------------------------------------------

	private onHarnessEvent(e: HarnessEvent): void {
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

	private requestApproval(req: { id: string; tool: string; title: string; detail: string }): Promise<ApprovalDecision> {
		return new Promise<ApprovalDecision>((resolve) => {
			this.pendingApproval = { ...req, resolve };
			this.pushFullState();
			void this.reveal();
		});
	}

	private askUser(question: string, options?: string[]): Thenable<string | undefined> {
		void this.reveal();
		if (options && options.length > 0) {
			return vscode.window.showQuickPick(options, { placeHolder: question, ignoreFocusOut: true });
		}
		return vscode.window.showInputBox({ prompt: question, ignoreFocusOut: true });
	}

	// ------------------------------------------------------------------
	// Webview message handling
	// ------------------------------------------------------------------

	private async handleWebviewMessage(msg: Record<string, unknown>): Promise<void> {
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
				const decision = msg.decision as ApprovalDecision;
				if (this.pendingApproval && this.pendingApproval.id === msg.id) {
					this.pendingApproval.resolve(decision);
					this.pendingApproval = undefined;
					this.pushFullState();
				} else if (msg.id === "legacy") {
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
				await this.saveProfile((msg.profile ?? {}) as Partial<ModelProfile>, msg.makeActive === true);
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
				const p = (msg.profile ?? {}) as Partial<ModelProfile>;
				try {
					const client = new OpenAiCompatClient({
						id: "probe",
						label: "probe",
						baseUrl: String(p.baseUrl ?? "").replace(/\/+$/, ""),
						apiKey: String(p.apiKey ?? ""),
						model: "",
					});
					const models = await client.listModels();
					await this.view?.webview.postMessage({ type: "modelsResult", baseUrl: p.baseUrl, models });
				} catch (err) {
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

	private async saveProfile(p: Partial<ModelProfile>, makeActive: boolean): Promise<void> {
		if (!p.baseUrl) {
			void vscode.window.showErrorMessage("Agent Kit: base URL is required.");
			return;
		}
		const existing = this.modelConfig.listProfiles().find((x) => x.id === p.id);
		const label = p.label || existing?.label || AgentPanelProvider.deriveLabel(String(p.baseUrl));
		const profile: ModelProfile = {
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

	private static deriveLabel(baseUrl: string): string {
		try {
			return new URL(baseUrl).hostname;
		} catch {
			return "Custom endpoint";
		}
	}

	private pushFullState(): void {
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

	private workspaceRoot(): string {
		const folder = vscode.workspace.workspaceFolders?.[0];
		return folder ? folder.uri.fsPath : this.extensionUri.fsPath;
	}

	private async reveal(): Promise<void> {
		try {
			await this.view?.show(true);
		} catch {
			// View not created yet (never focused); state will render on first open.
		}
	}
}
