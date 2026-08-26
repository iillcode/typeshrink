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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const injectingProxy_1 = require("./proxy/injectingProxy");
const session_1 = require("./session");
const panelHtml_1 = require("./webview/panelHtml");
const providers_1 = require("./sidebar/providers");
const modelProfiles_1 = require("./config/modelProfiles");
const registry_1 = require("./tools/registry");
const execTools_1 = require("./tools/execTools");
const agentPanelProvider_1 = require("./ui/agentPanelProvider");
function activate(context) {
    const outputChannel = vscode.window.createOutputChannel('Element Browser');
    const sessions = new session_1.SessionStore(context.globalStorageUri.fsPath, (m) => outputChannel.appendLine(m));
    // ---- Browser-tab loader: spinner in the tab title + window progress ----
    let activePanel;
    let loadSpinner;
    let loadResolve;
    let loadBaseTitle = 'Element Browser';
    function stopTabLoader() {
        if (loadSpinner) {
            clearInterval(loadSpinner);
            loadSpinner = undefined;
        }
        if (activePanel) {
            try {
                activePanel.title = loadBaseTitle;
            }
            catch { /* disposed */ }
        }
        if (loadResolve) {
            const r = loadResolve;
            loadResolve = undefined;
            r();
        }
    }
    function startTabLoader() {
        if (loadResolve || !activePanel)
            return; // already loading
        loadBaseTitle = activePanel.title.replace(/^[^\s]+\s+/, '') || 'Element Browser';
        const p = new Promise((res) => { loadResolve = res; });
        void vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Loading page\u2026' }, () => p);
        const frames = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];
        let fi = 0;
        loadSpinner = setInterval(() => {
            if (!activePanel)
                return;
            try {
                activePanel.title = frames[fi++ % frames.length] + ' ' + loadBaseTitle;
            }
            catch { /* disposed */ }
        }, 120);
    }
    // ---- Sidebar (launcher + static Design properties view) ----
    const sidebarProvider = new providers_1.SidebarViewProvider();
    context.subscriptions.push(outputChannel, vscode.window.registerWebviewViewProvider(providers_1.SidebarViewProvider.viewId, sidebarProvider, {
        webviewOptions: { retainContextWhenHidden: true }
    }), vscode.commands.registerCommand('elementClickBrowser.open', async () => {
        const urlInput = await vscode.window.showInputBox({
            prompt: 'Enter the URL of your app (e.g. http://localhost:3000)',
            value: 'http://localhost:3000',
            ignoreFocusOut: true
        });
        if (!urlInput)
            return;
        let targetOrigin;
        try {
            targetOrigin = new URL(urlInput).origin;
        }
        catch {
            vscode.window.showErrorMessage('Invalid URL.');
            return;
        }
        try {
            const jar = sessions.getJar(targetOrigin);
            const proxy = new injectingProxy_1.InjectingProxy(jar);
            proxy.onJarChanged = () => sessions.persistJars();
            const proxyPort = await proxy.start(targetOrigin, sessions.candidatesFor(targetOrigin));
            sessions.rememberPort(targetOrigin, proxyPort);
            outputChannel.appendLine('Proxy running on http://127.0.0.1:' + proxyPort + ' -> ' + targetOrigin + ' (jar: ' + jar.size + ' cookies)');
            const panel = vscode.window.createWebviewPanel('elementClickBrowser', 'Element Browser — ' + urlInput, vscode.ViewColumn.One, 
            // retainContextWhenHidden: without it VS Code tears down the
            // page iframe when the tab is hidden (e.g. switching to a
            // second browser tab), wiping the URL bar and app state.
            { enableScripts: true, retainContextWhenHidden: true });
            panel.webview.html = (0, panelHtml_1.getWebviewHtml)(proxyPort);
            activePanel = panel;
            panel.webview.onDidReceiveMessage(async (msg) => {
                if (msg.type === 'pageLoadState') {
                    // Browser-tab loader: run until the page FULLY loads.
                    if (msg.loading)
                        startTabLoader();
                    else
                        stopTabLoader();
                    return;
                }
                if (msg.type === 'cookieSync') {
                    // Page JS wrote cookies (document.cookie) — mirror them into
                    // the jar so client-side auth survives webview partitioning.
                    try {
                        if (typeof msg.cookie === 'string') {
                            const changed = jar.importDocumentCookie(msg.cookie, new URL(targetOrigin));
                            if (changed)
                                sessions.persistJars();
                        }
                    }
                    catch { /* ignore malformed mirrors */ }
                    return;
                }
                if (msg.type === 'openExternal' || msg.type === 'openCurrent') {
                    let externalUrl;
                    if (msg.type === 'openExternal' && msg.url) {
                        externalUrl = String(msg.url);
                    }
                    else if (msg.type === 'openCurrent') {
                        // Map the proxied URL back to the real target origin.
                        try {
                            const u = new URL(String(msg.url || ''));
                            externalUrl = targetOrigin + u.pathname + u.search + u.hash;
                        }
                        catch {
                            externalUrl = urlInput;
                        }
                    }
                    if (externalUrl && externalUrl.startsWith('http://') || externalUrl && externalUrl.startsWith('https://')) {
                        await vscode.env.openExternal(vscode.Uri.parse(externalUrl));
                        vscode.window.showInformationMessage('Opened in your system browser. Complete the login there, then press Reload in the panel.');
                    }
                    return;
                }
                if (msg.type === 'pageInfo') {
                    vscode.window.showInformationMessage('Page: ' + (msg.url || 'No page loaded yet.'));
                }
                else if (msg.type === 'ready') {
                    // The webview posts this on every (re)creation — e.g.
                    // after its content was torn down while hidden — so
                    // ALWAYS answer with the launch URL.
                    panel.webview.postMessage({ type: 'load', url: urlInput, target: urlInput });
                }
            }, undefined, context.subscriptions);
            panel.onDidDispose(() => {
                proxy.dispose();
                stopTabLoader();
                if (activePanel === panel)
                    activePanel = undefined;
            }, undefined, context.subscriptions);
            panel.webview.postMessage({ type: 'load', url: urlInput });
            sidebarProvider.reveal();
            vscode.window.showInformationMessage('Browser opened for ' + urlInput + '.');
        }
        catch (err) {
            vscode.window.showErrorMessage('Failed to open browser: ' + err.message);
        }
    }), vscode.commands.registerCommand('elementClickBrowser.stop', () => {
        vscode.window.showInformationMessage('Close the Element Browser tab to stop the preview.');
    }), vscode.commands.registerCommand('elementClickBrowser.clearSession', async () => {
        const originInput = await vscode.window.showInputBox({
            prompt: 'Clear the saved login session for which origin? (leave empty to clear ALL)',
            value: 'http://localhost:3000',
            ignoreFocusOut: true
        });
        if (originInput === undefined)
            return;
        if (originInput.trim() === '') {
            sessions.clearAllSessions();
            vscode.window.showInformationMessage('All saved proxy sessions cleared. Reload the Element Browser to log in fresh.');
            return;
        }
        try {
            const origin = new URL(originInput.trim()).origin;
            sessions.dropJar(origin);
            vscode.window.showInformationMessage('Saved session for ' + origin + ' cleared.');
        }
        catch {
            vscode.window.showErrorMessage('Invalid URL.');
        }
    }));
    // =====================================================================
    // Agent Kit — AI coding harness (agent loop, tools, automations)
    // =====================================================================
    const modelConfig = new modelProfiles_1.ModelConfigManager(context.globalState);
    const agentProvider = new agentPanelProvider_1.AgentPanelProvider(context.extensionUri, modelConfig, (0, registry_1.buildToolRegistry)(), context.workspaceState);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(agentPanelProvider_1.AgentPanelProvider.viewId, agentProvider, {
        webviewOptions: { retainContextWhenHidden: true }
    }), 
    // Status bar: active model profile; click focuses the Agent panel.
    (() => {
        const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
        statusItem.command = 'agentKit.openPanel';
        const refreshStatus = () => {
            const active = modelConfig.getActive();
            statusItem.text = `$(hubot) ${active ? active.label : 'no model'}`;
            statusItem.tooltip = new vscode.MarkdownString(active
                ? `**Agent Kit** — ${active.label}\n\n${active.baseUrl}\n\nmodel: \`${active.model || '(not set)'}\`\n\nClick to open the Agent panel.`
                : '**Agent Kit** — no model configured. Click to set one up.');
            statusItem.show();
        };
        agentProvider.onModelChanged = refreshStatus;
        refreshStatus();
        return statusItem;
    })(), vscode.commands.registerCommand('agentKit.openPanel', async () => {
        await vscode.commands.executeCommand('agentKit.sidebarView.focus');
    }), vscode.commands.registerCommand('agentKit.newTask', async () => {
        const task = await vscode.window.showInputBox({
            prompt: 'Agent Kit: describe the task for the agent',
            placeHolder: 'e.g. Scaffold an Express API in src/ with tests'
        });
        await vscode.commands.executeCommand('agentKit.sidebarView.focus');
        if (task && task.trim() !== '') {
            await agentProvider.submitTask(task);
        }
    }), vscode.commands.registerCommand('agentKit.selectProfile', async () => {
        const profiles = modelConfig.listProfiles();
        const active = modelConfig.getActive();
        const pick = await vscode.window.showQuickPick(profiles.map((p) => ({
            label: p.id === active?.id ? `$(check) ${p.label}` : p.label,
            description: `${p.baseUrl} · ${p.model || '(no model)'}`,
            id: p.id
        })), { placeHolder: 'Switch the active model profile' });
        if (pick) {
            await modelConfig.setActive(pick.id);
            agentProvider.refreshStatusBar();
            void vscode.window.showInformationMessage(`Agent Kit: active model is now "${profiles.find((p) => p.id === pick.id)?.label}".`);
        }
    }), vscode.commands.registerCommand('agentKit.initWorkspaceConfig', async () => {
        const root = vscode.workspace.workspaceFolders?.[0];
        if (!root) {
            void vscode.window.showErrorMessage('Agent Kit: open a workspace folder first.');
            return;
        }
        const dir = path.join(root.uri.fsPath, '.agentkit');
        const file = path.join(dir, 'automations.json');
        try {
            await fs.access(file);
            void vscode.window.showInformationMessage('Agent Kit: .agentkit/automations.json already exists.');
            return;
        }
        catch {
            // not present yet — create it below
        }
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(file, (0, execTools_1.sampleAutomationsJson)(), 'utf8');
        const doc = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(doc);
        void vscode.window.showInformationMessage('Agent Kit: created .agentkit/automations.json with example automations.');
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map