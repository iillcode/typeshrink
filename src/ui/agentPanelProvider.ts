import * as vscode from "vscode";
import * as path from "path";
import { AgentRunner } from "../harness/agentRunner";
import { ApprovalDecision, ChatMessage, HarnessEvent, ModelProfile, RunActionRecord, ToolDefinition, summarizeRunForHistory } from "../harness/types";
import { ModelConfigManager } from "../config/modelProfiles";
import { OpenAiCompatClient } from "../llm/openaiCompat";
import { getWebviewHtml } from "./webviewHtml";
import { COMPLETION_TOOL } from "../tools/interactiveTools";

/** Agent modes: "plan" is read-only research; "build" has the full tool belt. */
export type AgentMode = "plan" | "build";

/** Tools available in PLAN mode — strictly read-only + interaction/completion. */
const PLAN_ALLOWED_TOOLS = new Set(["read_file", "list_files", "search_files", "ask_user", COMPLETION_TOOL]);

/** System-side constraints injected into every plan-mode task. */
const PLAN_TASK_PREFIX = [
	"[AGENT MODE: PLAN]",
	"You are operating in PLAN mode. Hard rules:",
	"- You CANNOT create, modify or delete files, and you CANNOT run commands — those tools are unavailable in this mode.",
	"- Research the workspace with read_file / list_files / search_files as needed.",
	"- Produce a concrete, step-by-step implementation plan (files to create/edit with a summary of changes, commands to run, verification steps).",
	"- Finish by calling " + COMPLETION_TOOL + " with the complete plan.",
].join("\n");

interface TranscriptEntry {
	kind: "user" | "assistant" | "tool" | "notice";
	text?: string;
	reasoning?: string;
	/** Workspace-relative paths attached as context via @-mentions. */
	files?: string[];
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
const CHATS_INDEX_KEY = "agentKit.chats.index";
const MAX_SESSIONS = 50;

interface ChatSessionMeta {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
}

interface SessionBlob {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	transcript: TranscriptEntry[];
	history: ChatMessage[];
}

/**
 * Sidebar webview host: renders chat + settings, forwards harness events,
 * implements approvals/ask-user for the HostContext contract.
 */
export class AgentPanelProvider implements vscode.WebviewViewProvider {
	public static readonly viewId = "agentKit.sidebarView";

	private view?: vscode.WebviewView;
	private readonly runner: AgentRunner;
	/** Read-only runner used while in PLAN mode (write/exec tools removed). */
	private planRunner?: AgentRunner;
	/** Current agent mode — applied to newly started runs. */
	private mode: AgentMode = "build";
	/** Set when a plan-mode run completed: webview offers the switch to Build. */
	private planReady = false;
	private transcript: TranscriptEntry[] = [];
	private busy = false;
	private autoApproveSession: boolean;
	private abortController?: AbortController;
	private pendingApproval?: PendingApproval;
	private settingsVisible = false;
	/** Conversation memory for THIS chat: prior turns sent with every request. */
	private history: ChatMessage[] = [];
	/** Settles when the in-flight run has fully unwound (used for interrupt-and-replace). */
	private currentRun?: Promise<void>;

	// ---- chat sessions (persisted per workspace) ----
	private sessionId = "";
	private sessions: ChatSessionMeta[] = [];
	private loadingSession = false;
	/** Live in-memory copy of every session touched this window (source of truth while running). */
	private memSessions = new Map<string, { transcript: TranscriptEntry[]; history: ChatMessage[] }>();
	/** The chat whose run is currently executing — may differ from the viewed one. */
	private run?: { id: string; transcript: TranscriptEntry[]; history: ChatMessage[] };

	// ---- live capture of the running turn (for continue-context) ----
	private runTexts: string[] = [];
	private runPartial = "";
	private runActions: RunActionRecord[] = [];

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
		private readonly chatStore?: vscode.Memento,
		private readonly logChannel?: vscode.LogOutputChannel,
	) {
		this.autoApproveSession = modelConfig.isAutoApprovedForSession();
		this.runner = new AgentRunner({
			clientFactory: () => this.makeClient(),
			tools,
		});
	}

	private makeClient(): OpenAiCompatClient {
		return new OpenAiCompatClient(this.requireActiveProfile(), (lvl, m) => this.writeLog(lvl, m));
	}

	/** Runner for a mode: PLAN strips write/exec tools so the model can't misuse them. */
	private runnerFor(mode: AgentMode): AgentRunner {
		if (mode !== "plan") return this.runner;
		if (!this.planRunner) {
			this.planRunner = new AgentRunner({
				clientFactory: () => this.makeClient(),
				tools: this.tools.filter((t) => PLAN_ALLOWED_TOOLS.has(t.name)),
			});
		}
		return this.planRunner;
	}

	private writeLog(level: "info" | "warn" | "error", message: string): void {
		if (!this.logChannel) return;
		if (level === "error") this.logChannel.error(message);
		else if (level === "warn") this.logChannel.warn(message);
		else this.logChannel.info(message);
	}

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
		view.webview.html = getWebviewHtml(view.webview, this.extensionUri);
		view.webview.onDidReceiveMessage((msg) => void this.handleWebviewMessage(msg));
		this.restoreLastSession();
		void this.sendWorkspaceFiles(); // preload so the @-picker opens instantly
		this.pushFullState();
	}

	// ------------------------------------------------------------------
	// Chat session persistence
	// ------------------------------------------------------------------

	private loadIndex(): void {
		if (!this.chatStore || this.sessions.length > 0) return;
		this.sessions = this.chatStore.get<ChatSessionMeta[]>(CHATS_INDEX_KEY, []);
		this.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	private restoreLastSession(): void {
		this.loadIndex();
		const target = this.sessions[0];
		if (target) this.loadSessionIntoMemory(target.id);
		else this.startFreshSession();
	}

	private startFreshSession(): void {
		this.sessionId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
		this.transcript = [];
		this.history = [];
		this.memSessions.set(this.sessionId, { transcript: this.transcript, history: this.history });
	}

	private loadSessionIntoMemory(id: string): void {
		if (id === this.sessionId) return;
		// Park the currently-viewed session in memory first.
		if (this.sessionId) {
			this.memSessions.set(this.sessionId, { transcript: this.transcript, history: this.history });
		}
		let entry = this.memSessions.get(id);
		if (!entry) {
			const blob = this.chatStore?.get<SessionBlob | undefined>(`agentKit.chat.${id}`);
			entry = {
				transcript: blob && Array.isArray(blob.transcript) ? blob.transcript : [],
				history: blob && Array.isArray(blob.history) ? blob.history : [],
			};
			this.memSessions.set(id, entry);
		}
		this.sessionId = id;
		this.transcript = entry.transcript;
		this.history = entry.history;
	}

	/** Persist one session's live arrays (defaults to the viewed one). */
	private persistSession(
		id = this.sessionId,
		transcript = this.transcript,
		history = this.history,
		titleHint?: string,
	): void {
		if (!this.chatStore || !id) return;
		const existing = this.chatStore.get<SessionBlob | undefined>(`agentKit.chat.${id}`);
		// Don't create blobs for untouched sessions (panel opened, nothing sent).
		if (!existing && !titleHint && transcript.length === 0 && !(this.busy && id === (this.run?.id ?? id))) return;
		const now = Date.now();
		let meta = this.sessions.find((s) => s.id === id);
		if (!meta) {
			meta = { id, title: "", createdAt: now, updatedAt: now };
			this.sessions.unshift(meta);
		}
		meta.updatedAt = now;
		if (titleHint && !meta.title) meta.title = titleHint;
		const blob: SessionBlob = {
			id,
			title: meta.title,
			createdAt: meta.createdAt,
			updatedAt: now,
			transcript: transcript.slice(-400),
			history: history.slice(-MAX_HISTORY_MESSAGES),
		};
		void this.chatStore.update(`agentKit.chat.${id}`, blob);
		this.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
		if (existing === undefined && this.sessions.length > MAX_SESSIONS) {
			for (const stale of this.sessions.slice(MAX_SESSIONS)) {
				void this.chatStore.update(`agentKit.chat.${stale.id}`, undefined);
			}
			this.sessions = this.sessions.slice(0, MAX_SESSIONS);
		}
		void this.chatStore.update(CHATS_INDEX_KEY, this.sessions);
	}

	/** Legacy single-session save — kept for call sites that mean "the viewed chat". */
	private saveSession(titleHint?: string): void {
		this.persistSession(this.sessionId, this.transcript, this.history, titleHint);
	}

	private requireActiveProfile(): ModelProfile {
		const active = this.modelConfig.getActive();
		if (!active) throw new Error("No model profile configured.");
		return active;
	}

	// ------------------------------------------------------------------
	// Public API used by commands
	// ------------------------------------------------------------------

	public async submitTask(task: string, attachedFiles?: string[]): Promise<void> {
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
		if (this.busy && this.currentRun) {
			if (this.run?.id === this.sessionId) {
				// Sending in the chat that is running: break the task, new message
				// becomes the next request (aborted exchange still recorded).
				this.cancel();
			}
			// A different chat runs in background — queue this request behind it.
			await this.currentRun;
		}
		if (this.busy) return; // safety: previous run never settled
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

		// @-mentioned files: read contents and append as an explicit context block
		// for the model, while the transcript keeps only the original message.
		const files = (attachedFiles ?? []).map((f) => String(f).replace(/\\/g, "/").replace(/^\/+/, "")).filter((f) => f && !f.includes(".."));
		const attachmentContext = await this.buildAttachmentContext(files);
		let effectiveTask = attachmentContext ? `${task}\n\n${attachmentContext}` : task;

		// Mode is captured at submission: a running plan keeps its read-only
		// toolset even if the user flips the switch mid-run.
		const runMode = this.mode;
		this.planReady = false;
		if (runMode === "plan") effectiveTask = `${PLAN_TASK_PREFIX}\n\n${effectiveTask}`;
		const activeRunner = this.runnerFor(runMode);

		const sid = this.sessionId;
		const sTranscript = this.transcript;
		const sHistory = this.history;
		sTranscript.push({ kind: "user", text: task, ...(files.length ? { files } : {}) });
		this.busy = true;
		this.abortController = new AbortController();
		this.run = { id: sid, transcript: sTranscript, history: sHistory };
		this.runTexts = [];
		this.runPartial = "";
		this.runActions = [];
		const title = task.split("\n")[0].trim().slice(0, 48) || "New chat";
		this.writeLog("info", `run started — chat=${sid} mode=${runMode} model="${profile.label}/${profile.model}" endpoint=${profile.baseUrl} history=${sHistory.length} msg(s)`);
		this.pushFullState(title);

		const run = (async () => {
			try {
				const settingAutoApprove = vscode.workspace.getConfiguration("agentKit").get<boolean>("autoApprove", false);
				const bypass = this.autoApproveSession || settingAutoApprove;
				const result = await activeRunner.run(
					{
						postEvent: (e) => this.onHarnessEvent(e),
						requestApproval: bypass
							? () => Promise.resolve("approved" as ApprovalDecision)
							: (req) => this.requestApproval(req),
					askUser: (question, options) => Promise.resolve(this.askUser(question, options)),
					workspaceRoot: this.workspaceRoot(),
					commandTimeoutSec: vscode.workspace.getConfiguration("agentKit").get<number>("commandTimeoutSec", 120),
					signal: this.abortController!.signal,
					log: (lvl, m) => this.writeLog(lvl, m),
				},
				{
					task: effectiveTask,
					activeFile,
					selection,
					maxIterations: vscode.workspace.getConfiguration("agentKit").get<number>("maxIterations", 40),
					history: sHistory.slice(),
				},
				);
				if (result.status !== "completed") {
					sTranscript.push({
						kind: "notice",
						text: result.status === "error" ? `Error: ${result.summary}` : result.summary,
					});
					if (result.status === "error" && this.logChannel) {
						void vscode.window
							.showErrorMessage("Agent Kit request failed.", "Open logs")
							.then((pick) => { if (pick === "Open logs") this.logChannel!.show(); });
					}
				}
				this.writeLog("info", `run finished: status=${result.status}, iterations used, chat=${sid}`);
			this.rememberTurnInto(sHistory, task, result);
			// A finished plan offers the user the one-click switch to Build.
			if (runMode === "plan" && result.status === "completed") {
				this.planReady = true;
			}
			} finally {
				this.busy = false;
				this.abortController = undefined;
				if (this.run?.id === sid) this.run = undefined;
				this.persistSession(sid, sTranscript, sHistory);
				this.pushFullState();
			}
		})();
		this.currentRun = run;
		try {
			await run;
		} finally {
			if (this.currentRun === run) this.currentRun = undefined;
		}
	}

	/**
	 * Append an exchange to a specific chat's model context so follow-up requests
	 * contain the previous conversation. Interrupted runs keep what the agent
	 * actually did (partial output + tool actions) so "continue" resumes.
	 */
	private rememberTurnInto(history: ChatMessage[], task: string, result: { status: string; summary: string }): void {
		const answer = summarizeRunForHistory({
			status: result.status,
			fallbackSummary: result.summary,
			texts: this.runTexts,
			partial: this.runPartial,
			actions: this.runActions,
		});
		history.push(
			{ role: "user", content: task },
			{ role: "assistant", content: answer.slice(0, 8000) },
		);
		if (history.length > MAX_HISTORY_MESSAGES) {
			history.splice(0, history.length - MAX_HISTORY_MESSAGES);
		}
	}

	public cancel(): void {
		this.writeLog("warn", "cancel requested by user — aborting current run");
		this.abortController?.abort();
		if (this.pendingApproval) {
			this.pendingApproval.resolve("denied");
			this.pendingApproval = undefined;
		}
		this.pushFullState();
	}

	public newTask(): void {
		// Background runs keep going — the new chat simply starts alongside.
		if (this.transcript.length > 0 || this.history.length > 0) this.saveSession();
		this.startFreshSession();
		this.settingsVisible = false;
		this.planReady = false;
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
		// Events belong to the running chat, which may not be the viewed one.
		const t = this.run ? this.run.transcript : this.transcript;
		switch (e.type) {
			case "assistant_message":
				t.push({ kind: "assistant", text: e.text, reasoning: e.reasoning });
				this.runTexts.push(e.text);
				this.runPartial = "";
				break;
			case "assistant_delta":
				this.runPartial += e.text;
				break;
			case "stream_reset":
				this.runPartial = ""; // failed attempt was discarded by the retry loop
				break;
			case "tool_start":
				t.push({
					kind: "tool",
					callId: e.callId,
					name: e.name,
					argsSummary: e.argsSummary,
					status: "running",
				});
				this.runActions.push({ name: e.name, argsSummary: e.argsSummary });
				break;
			case "tool_result": {
				const entry = [...t].reverse().find((x) => x.kind === "tool" && x.callId === e.callId);
				if (entry) {
					entry.status = e.output === "(denied)" ? "denied" : e.ok ? "ok" : "error";
					entry.output = e.output;
				}
				const rec = [...this.runActions].reverse().find((a) => a.ok === undefined);
				if (rec) rec.ok = e.ok;
				break;
			}
		}
		void this.view?.webview.postMessage(Object.assign({}, e, { sessionId: this.run?.id ?? this.sessionId }));
	}

	private requestApproval(req: { id: string; tool: string; title: string; detail: string }): Promise<ApprovalDecision> {
		this.writeLog("info", `approval requested: ${req.title}`);
		return new Promise<ApprovalDecision>((resolve) => {
			this.pendingApproval = {
				...req,
				resolve: (d) => {
					this.writeLog("info", `approval decision: ${d} (${req.tool})`);
					resolve(d);
				},
			};
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
		try {
			await this.routeWebviewMessage(msg);
		} catch (err) {
			// A throwing handler must never silently kill webview interactions.
			this.writeLog("error", `webview message "${String(msg.type)}" failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private async routeWebviewMessage(msg: Record<string, unknown>): Promise<void> {
		switch (msg.type) {
			case "ready":
				this.pushFullState();
				void this.sendWorkspaceFiles();
				break;
			case "submit":
				await this.submitTask(
					String(msg.task ?? ""),
					Array.isArray(msg.files) ? msg.files.map((f) => String(f)) : [],
				);
				break;
			case "requestFiles":
				await this.sendWorkspaceFiles();
				break;
			case "setMode": {
				this.mode = String(msg.mode) === "plan" ? "plan" : "build";
				this.planReady = false;
				this.writeLog("info", `agent mode set to ${this.mode}`);
				this.pushFullState();
				break;
			}
			case "continueInBuild": {
				// User approved the plan→build handoff: flip mode and continue
				// automatically — history already contains the plan conversation.
				this.planReady = false;
				this.mode = "build";
				this.writeLog("info", "plan approved — switching to build mode and continuing");
				this.pushFullState();
				void this.submitTask("Implement the plan you created in this chat. Follow it step by step, verifying as you go.", []);
				break;
			}
			case "dismissPlanPrompt":
				this.planReady = false;
				this.pushFullState();
				break;
			case "cancel":
				this.cancel();
				break;
			case "newTask":
				this.newTask();
				break;
			case "openChat": {
				const id = String(msg.id ?? "");
				this.loadIndex();
				let meta = this.sessions.find((s) => s.id === id);
				if (!meta && this.chatStore) {
					// Self-heal: index entry lost (older build / partial write) but the
					// chat blob survived — restore it into the index instead of dying
					// silently, which left the webview stuck on an empty chat.
					const blob = this.chatStore.get<SessionBlob | undefined>(`agentKit.chat.${id}`);
					if (blob && blob.id === id) {
						meta = { id, title: blob.title || "Restored chat", createdAt: blob.createdAt || Date.now(), updatedAt: blob.updatedAt || Date.now() };
						this.sessions.unshift(meta);
						void this.chatStore.update(CHATS_INDEX_KEY, this.sessions);
						this.writeLog("info", `restored orphaned chat "${meta.title}" (${id}) into index`);
					}
				}
				if (!meta) {
					this.writeLog("warn", `openChat: unknown chat id "${id}" — repainting current session`);
					await this.reveal();
					this.pushFullState(); // always answer so the webview is never stranded
					break;
				}
				// Re-opening the active/running chat must ALSO refresh: the webview
				// already left the list view and needs a state push to paint it.
				if (id !== this.sessionId) this.loadSessionIntoMemory(id);
				await this.reveal();
				this.pushFullState();
				break;
			}
			case "deleteChat": {
				const id = String(msg.id ?? "");
				if (id === this.run?.id) {
					void vscode.window.showInformationMessage("Agent Kit: stop the running task before deleting this chat.");
					break;
				}
				this.loadIndex();
				this.sessions = this.sessions.filter((s) => s.id !== id);
				this.memSessions.delete(id);
				if (this.chatStore) void this.chatStore.update(`agentKit.chat.${id}`, undefined);
				void this.chatStore?.update(CHATS_INDEX_KEY, this.sessions);
				if (id === this.sessionId) {
					const next = this.sessions[0];
					if (next) this.loadSessionIntoMemory(next.id);
					else this.startFreshSession();
					this.pushFullState();
				}
				break;
			}
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

	private pushFullState(titleHint?: string): void {
		this.persistSession(this.sessionId, this.transcript, this.history, titleHint);
		this.loadIndex();
		const active = this.modelConfig.getActive();
		const runningId = this.run?.id ?? "";
		const bgBusy = this.busy && runningId !== "" && runningId !== this.sessionId;
		void this.view?.webview.postMessage({
			type: "state",
			state: {
				profiles: this.modelConfig.listProfiles(),
				activeProfileId: active?.id ?? "",
				autoApprove: this.autoApproveSession,
				busy: this.busy && (runningId === "" || runningId === this.sessionId),
				bgBusy,
				runningChatId: runningId,
				settingsVisible: this.settingsVisible,
				transcript: this.transcript,
				pendingApproval: this.pendingApproval
					? { id: this.pendingApproval.id, tool: this.pendingApproval.tool, title: this.pendingApproval.title, detail: this.pendingApproval.detail }
					: null,
				activeLabel: active ? `${active.label} · ${active.model || "(no model set)"}` : "(no model)",
				mode: this.mode,
				planReady: this.planReady,
				chats: this.sessions.slice(0, MAX_SESSIONS).map((s) => ({ id: s.id, title: s.title || "New chat", updatedAt: s.updatedAt })),
				activeChatId: this.sessionId,
			},
		});
	}

	private workspaceRoot(): string {
		const folder = vscode.workspace.workspaceFolders?.[0];
		return folder ? folder.uri.fsPath : this.extensionUri.fsPath;
	}

	// ------------------------------------------------------------------
	// @-mention support: workspace file list + attachment contents
	// ------------------------------------------------------------------

	/** Scan the workspace (heavy dirs excluded) and post the relative-path list. */
	private async sendWorkspaceFiles(): Promise<void> {
		let files: string[] = [];
		const root = vscode.workspace.workspaceFolders?.[0];
		if (root) {
			try {
				const uris = await vscode.workspace.findFiles(
					"**/*",
					"**/{node_modules,.git,dist,out,build,.next,coverage,vendor,__pycache__,.venv}/**",
					4000,
				);
				files = uris
					.map((u) => path.relative(root.uri.fsPath, u.fsPath).split(path.sep).join("/"))
					.filter((p) => p.length > 0 && !p.startsWith(".."))
					.sort();
			} catch (err) {
				this.writeLog("warn", `workspace file scan failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
		void this.view?.webview.postMessage({ type: "fileList", files });
	}

	/**
	 * Read @-mentioned files and render them as a fenced context block appended
	 * to the task. Caps keep runaway prompts bounded; unreadable/binary files are
	 * reported inline instead of failing the whole run.
	 */
	private async buildAttachmentContext(files: string[]): Promise<string> {
		if (!files.length) return "";
		const root = this.workspaceRoot();
		const MAX_FILES = 10;
		const MAX_FILE_CHARS = 40_000;
		const MAX_TOTAL_CHARS = 120_000;
		const parts: string[] = [];
		let total = 0;
		for (const rel of files.slice(0, MAX_FILES)) {
			const uri = vscode.Uri.file(path.join(root, rel));
			try {
				const stat = await vscode.workspace.fs.stat(uri);
				if ((stat.type & vscode.FileType.Directory) !== 0 || stat.size > 1_000_000) {
					parts.push(`File "${rel}": skipped (${stat.size > 1_000_000 ? "too large" : "directory"})`);
					continue;
				}
				let text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
				if (text.includes("\u0000")) {
					parts.push(`File "${rel}": skipped (binary file)`);
					continue;
				}
				if (text.length > MAX_FILE_CHARS) {
					text = text.slice(0, MAX_FILE_CHARS) + "\n… (truncated)";
				}
				total += text.length;
				parts.push(`File "${rel}":\n\`\`\`\n${text}\n\`\`\``);
				if (total >= MAX_TOTAL_CHARS) break;
			} catch {
				parts.push(`File "${rel}": could not be read`);
			}
		}
		return parts.length
			? "--- Attached context (user-referenced files) ---\n" + parts.join("\n\n") + "\n--- End attached context ---"
			: "";
	}

	private async reveal(): Promise<void> {
		try {
			await this.view?.show(true);
		} catch {
			// View not created yet (never focused); state will render on first open.
		}
	}
}
