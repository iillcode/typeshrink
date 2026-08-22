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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const injectingProxy_1 = require("./proxy/injectingProxy");
const session_1 = require("./session");
const panelHtml_1 = require("./webview/panelHtml");
const buildContextText_1 = require("./capture/buildContextText");
const providers_1 = require("./sidebar/providers");
function activate(context) {
    const outputChannel = vscode.window.createOutputChannel('Element Click Browser');
    let history = [];
    const sessions = new session_1.SessionStore(context.globalStorageUri.fsPath, (m) => outputChannel.appendLine(m));
    // ---- Helpers ----
    function saveToFile() {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws)
            return;
        try {
            fs.writeFileSync(path.join(ws.uri.fsPath, 'clicked-elements.json'), JSON.stringify(history, null, 2));
        }
        catch (e) {
            outputChannel.appendLine('saveToFile failed: ' + e.message);
        }
    }
    function showDetails(d, focus = false) {
        outputChannel.appendLine('[' + new Date().toLocaleTimeString() + '] Clicked <' + d.tag + '>' + (d.id ? ' #' + d.id : ''));
        outputChannel.appendLine(d.contextText ?? JSON.stringify(d, null, 2));
        if (focus)
            outputChannel.show(true);
    }
    async function copy(value) {
        if (!value)
            return;
        await vscode.env.clipboard.writeText(value);
        vscode.window.showInformationMessage('Copied: ' + value);
    }
    function clearAllHistory() {
        history = [];
        treeProvider.refresh();
        saveToFile();
        sidebarProvider.postUpdate();
        vscode.window.showInformationMessage('Clicked elements history cleared.');
    }
    // ---- Sidebar ----
    const treeProvider = new providers_1.ElementsTreeProvider(() => history);
    const sidebarProvider = new providers_1.SidebarViewProvider({
        getHistory: () => history,
        saveToFile,
        onClearHistory: clearAllHistory,
        onShowDetails: showDetails,
        onOpenBrowser: () => { void vscode.commands.executeCommand('elementClickBrowser.open'); },
    });
    context.subscriptions.push(outputChannel, vscode.window.registerWebviewViewProvider(providers_1.SidebarViewProvider.viewId, sidebarProvider, {
        webviewOptions: { retainContextWhenHidden: true }
    }), vscode.window.registerTreeDataProvider('elementClickBrowser.elementsView', treeProvider), vscode.commands.registerCommand('elementClickBrowser.open', async () => {
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
            const panel = vscode.window.createWebviewPanel('elementClickBrowser', 'Element Browser — ' + urlInput, vscode.ViewColumn.One, { enableScripts: true });
            panel.webview.html = (0, panelHtml_1.getWebviewHtml)(proxyPort);
            let ready = false;
            panel.webview.onDidReceiveMessage(async (msg) => {
                if (msg.type === 'elementClicked') {
                    const d = msg.data;
                    d.timestamp = Date.now();
                    try {
                        d.contextText = (0, buildContextText_1.buildContextText)(d);
                    }
                    catch { /* keep raw */ }
                    history.push(d);
                    saveToFile();
                    showDetails(d); // logs silently — never steals focus
                    sidebarProvider.postUpdate();
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
                        vscode.window.showInformationMessage('Opened in your system browser. Complete the login there, then press Reload in the panel. If the app redirects back to the panel address, the session is captured automatically.');
                    }
                    return;
                }
                if (msg.type === 'showDetails') {
                    showDetails(msg.data);
                }
                else if (msg.type === 'pageInfo') {
                    const u = msg.url || 'No page loaded yet.';
                    vscode.window.showInformationMessage('Page: ' + u + ' | ' + history.length + ' element(s) captured', 'Clear history')
                        .then(pick => { if (pick === 'Clear history')
                        clearAllHistory(); });
                }
                else if (msg.type === 'ready' && !ready) {
                    ready = true;
                    panel.webview.postMessage({ type: 'load', url: urlInput, target: urlInput });
                }
            }, undefined, context.subscriptions);
            panel.onDidDispose(() => proxy.dispose(), undefined, context.subscriptions);
            panel.webview.postMessage({ type: 'load', url: urlInput });
            sidebarProvider.reveal();
            vscode.window.showInformationMessage('Inspecting ' + urlInput + ' — click any element in the browser panel.');
        }
        catch (err) {
            vscode.window.showErrorMessage('Failed to start inspector: ' + err.message);
        }
    }), vscode.commands.registerCommand('elementClickBrowser.stop', () => {
        vscode.window.showInformationMessage('Close the Element Browser tab to stop inspecting.');
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
    }), vscode.commands.registerCommand('elementClickBrowser.clearHistory', clearAllHistory), vscode.commands.registerCommand('elementClickBrowser.showDetails', showDetails), vscode.commands.registerCommand('elementClickBrowser.copyXPath', (item) => copy(item.xpath)), vscode.commands.registerCommand('elementClickBrowser.copySelector', (item) => copy(item.cssSelector)));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map