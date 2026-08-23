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
const exportBugReport_1 = require("./capture/exportBugReport");
const providers_1 = require("./sidebar/providers");
function activate(context) {
    const outputChannel = vscode.window.createOutputChannel('Element Click Browser');
    let history = [];
    const sessions = new session_1.SessionStore(context.globalStorageUri.fsPath, (m) => outputChannel.appendLine(m));
    // ---- Debug-flow projects & paths (shared between panel and sidebar) ----
    let bugProjects = loadBugFlows();
    let activeProjectId = null;
    let recordingSteps = null; // non-null ⇒ a recording is in progress
    let activePanel;
    let lastTargetUrl = '';
    // Last element clicked in the browser — the Design tab edits its styles.
    let designTarget = null;
    // Data of the most recent finished editing session (kept so late commitEdits
    // messages can still resolve their element after designTarget was cleared).
    let styleSessionData = null;
    /** Commit accumulated Design-tab style edits as a compact, AI-oriented Task
     *  under the "Style Edits" group. Re-editing the same element updates its
     *  existing task instead of duplicating it. */
    function commitStyleEdits(ecbId, edits) {
        const base = (ecbId && designTarget && designTarget.ecbId === ecbId) ? designTarget :
            (ecbId && styleSessionData && styleSessionData.ecbId === ecbId) ? styleSessionData :
                (styleSessionData || designTarget);
        if (!base)
            return;
        // collapse repeated props to their final value, keep first-appearance order,
        // and drop any empty-valued entries (noise guard)
        const order = [];
        const byProp = new Map();
        for (const e of edits || []) {
            if (!e || !e.prop)
                continue;
            const val = String(e.value ?? '').trim();
            if (!val)
                continue;
            if (!order.includes(e.prop))
                order.push(e.prop);
            byProp.set(e.prop, val);
        }
        if (!order.length)
            return;
        let proj = bugProjects.find((p) => p.name === 'Style Edits');
        if (!proj) {
            proj = { id: uid(), name: 'Style Edits', createdAt: Date.now(), paths: [] };
            bugProjects.unshift(proj);
            if (!activeProjectId)
                activeProjectId = proj.id;
        }
        let path = proj.paths.find((t) => t.steps[0] && t.steps[0].element.ecbId === base.ecbId);
        if (!path) {
            path = { id: uid(), title: '', kind: 'task', createdAt: Date.now(), steps: [], source: 'design', edits: [] };
            proj.paths.unshift(path);
        }
        // merge edits (later sessions win per property)
        const mergedOrder = order.slice();
        const mergedBy = new Map(byProp);
        for (const prev of path.edits || []) {
            if (!mergedBy.has(prev.prop)) {
                mergedOrder.push(prev.prop);
            }
            else if (!mergedOrder.includes(prev.prop)) {
                mergedOrder.unshift(prev.prop);
            }
            // note: new values already in byProp win; untouched old props persist below
            if (!mergedBy.has(prev.prop))
                mergedBy.set(prev.prop, prev.value);
        }
        const finalEdits = mergedOrder.map((prop) => ({ prop, value: mergedBy.get(prop) }));
        // ONE lean step — identity + markup only; the heavy CSS dumps are noise
        // for this report format and are stripped.
        const slim = {
            tag: base.tag, id: base.id, className: base.className, text: String(base.text || '').slice(0, 120),
            xpath: base.xpath, cssSelector: base.cssSelector,
            outerHTML: String(base.outerHTML || '').slice(0, 600),
            rect: base.rect, url: base.url, timestamp: Date.now(),
            ecbId: base.ecbId, source: base.source ?? null
        };
        path.edits = finalEdits;
        path.source = 'design';
        path.steps = [{ element: slim, note: '' }];
        path.title = '<' + base.tag + '>' + (base.id ? ' #' + base.id : '') + ' \u00B7 ' + finalEdits.length + ' edit' + (finalEdits.length === 1 ? '' : 's');
        saveBugFlows();
        outputChannel.appendLine('[style-edits] committed "' + path.title + '" under "' + proj.name + '"');
        notifyFlowState();
    }
    function uid() {
        return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    }
    function activeProject() {
        return bugProjects.find((p) => p.id === activeProjectId) ?? null;
    }
    function notifyFlowState() {
        activePanel?.webview.postMessage({
            type: 'flowState',
            active: !!recordingSteps,
            count: recordingSteps ? recordingSteps.length : 0
        });
        sidebarProvider.postUpdate();
    }
    // ---- Persistence (workspace-root bug-flows.json) ----
    function bugFile() {
        const ws = vscode.workspace.workspaceFolders?.[0];
        return ws ? path.join(ws.uri.fsPath, 'bug-flows.json') : null;
    }
    function loadBugFlows() {
        const file = bugFile();
        if (!file || !fs.existsSync(file))
            return [];
        try {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (!Array.isArray(raw))
                return [];
            return raw.map((p) => ({
                id: String(p?.id || uid()),
                name: String(p?.name || 'Untitled project'),
                createdAt: Number(p?.createdAt) || Date.now(),
                paths: Array.isArray(p?.paths) ? p.paths.map((t) => ({
                    id: String(t?.id || uid()),
                    title: String(t?.title || 'Untitled'),
                    kind: t?.kind === 'task' ? 'task' : 'bug',
                    createdAt: Number(t?.createdAt) || Date.now(),
                    steps: Array.isArray(t?.steps) ? t.steps : []
                })) : []
            }));
        }
        catch (e) {
            outputChannel.appendLine('[bug-flow] failed to read bug-flows.json: ' + e.message);
            return [];
        }
    }
    function saveBugFlows() {
        const file = bugFile();
        if (!file)
            return;
        try {
            fs.writeFileSync(file, JSON.stringify(bugProjects, null, 2));
        }
        catch (e) {
            outputChannel.appendLine('[bug-flow] failed to write bug-flows.json: ' + e.message);
        }
    }
    /** Lightweight snapshot for the sidebar webview (full data stays host-side). */
    function bugView() {
        return {
            projects: bugProjects.map((p) => ({
                id: p.id,
                name: p.name,
                createdAt: p.createdAt,
                paths: p.paths.map((t) => ({
                    id: t.id,
                    title: t.title,
                    kind: t.kind,
                    createdAt: t.createdAt,
                    steps: t.steps.map((s) => ({ tag: s.element.tag, id: s.element.id, note: s.note }))
                }))
            })),
            activeProjectId,
            recordingActive: !!recordingSteps,
            recordingSteps: recordingSteps ? recordingSteps.length : 0,
            recordingProjectName: activeProject()?.name ?? null
        };
    }
    function findPath(projectId, pathId) {
        const proj = bugProjects.find((p) => p.id === projectId);
        const pt = proj?.paths.find((t) => t.id === pathId);
        return proj && pt ? { proj, pt } : null;
    }
    async function promptNewProject() {
        const name = ((await vscode.window.showInputBox({
            prompt: 'Name this debug project — it groups your recorded paths',
            placeHolder: 'e.g. Checkout page v2',
            ignoreFocusOut: true
        })) || '').trim();
        if (!name)
            return null;
        const proj = { id: uid(), name, createdAt: Date.now(), paths: [] };
        bugProjects.unshift(proj);
        activeProjectId = proj.id;
        saveBugFlows();
        outputChannel.appendLine('[bug-flow] project created: "' + name + '"');
        notifyFlowState();
        return proj;
    }
    /** Begin a recording session inside the active project (creating one on demand). */
    async function startRecording() {
        if (!activeProject()) {
            const created = await promptNewProject();
            if (!created)
                return false; // user cancelled naming — don't record into nowhere
        }
        recordingSteps = [];
        outputChannel.appendLine('[bug-flow] recording started → "' + activeProject().name + '"');
        notifyFlowState();
        return true;
    }
    /** Stop the current recording and store its steps as a new path. */
    async function finishAndSavePath() {
        const steps = recordingSteps ?? [];
        recordingSteps = null;
        if (!steps.length) {
            outputChannel.appendLine('[bug-flow] stopped — no steps recorded');
            notifyFlowState();
            return;
        }
        const count = steps.length;
        const title = ((await vscode.window.showInputBox({
            prompt: 'Describe what happened — becomes the path title (' + count + ' step' + (count === 1 ? '' : 's') + ')',
            placeHolder: 'e.g. Color editor does not apply changes',
            ignoreFocusOut: true
        })) || '').trim();
        const kindPick = await vscode.window.showQuickPick(['🐞 Bug', '📌 Task'], {
            placeHolder: 'What kind of flow is this?',
            ignoreFocusOut: true
        });
        const kind = kindPick === '📌 Task' ? 'task' : 'bug';
        let proj = activeProject();
        if (!proj) {
            proj = { id: uid(), name: 'My project', createdAt: Date.now(), paths: [] };
            bugProjects.unshift(proj);
            activeProjectId = proj.id;
        }
        const finalTitle = title || (kind === 'task' ? 'Task ' : 'Bug ') + (proj.paths.length + 1);
        proj.paths.unshift({ id: uid(), title: finalTitle, kind, createdAt: Date.now(), steps });
        saveBugFlows();
        outputChannel.appendLine('[bug-flow] saved "' + finalTitle + '" (' + count + ' steps, ' + kind + ') → "' + proj.name + '"');
        notifyFlowState();
        vscode.window.showInformationMessage('Saved "' + finalTitle + '" (' + count + ' steps) to "' + proj.name + '". Use the sidebar to copy or export it.');
    }
    // ---- Sidebar-driven management actions ----
    function selectProject(id) {
        if (!bugProjects.some((p) => p.id === id))
            return;
        activeProjectId = id;
        notifyFlowState();
    }
    async function renameProject(id) {
        const proj = bugProjects.find((p) => p.id === id);
        if (!proj)
            return;
        const name = ((await vscode.window.showInputBox({
            prompt: 'Rename project',
            value: proj.name,
            ignoreFocusOut: true
        })) || '').trim();
        if (!name || name === proj.name)
            return;
        proj.name = name;
        saveBugFlows();
        outputChannel.appendLine('[bug-flow] project renamed → "' + name + '"');
        notifyFlowState();
    }
    async function deleteProject(id) {
        const proj = bugProjects.find((p) => p.id === id);
        if (!proj)
            return;
        const pick = await vscode.window.showWarningMessage('Delete project "' + proj.name + '" and its ' + proj.paths.length + ' path' + (proj.paths.length === 1 ? '' : 's') + '?', { modal: true }, 'Delete');
        if (pick !== 'Delete')
            return;
        bugProjects = bugProjects.filter((p) => p.id !== id);
        if (activeProjectId === id)
            activeProjectId = bugProjects[0]?.id ?? null;
        saveBugFlows();
        outputChannel.appendLine('[bug-flow] project deleted: "' + proj.name + '"');
        notifyFlowState();
    }
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
    async function deletePath(projectId, pathId) {
        const found = findPath(projectId, pathId);
        if (!found)
            return;
        const pick = await vscode.window.showWarningMessage('Delete "' + found.pt.title + '" (' + found.pt.steps.length + ' steps)?', { modal: true }, 'Delete');
        if (pick !== 'Delete')
            return;
        found.proj.paths = found.proj.paths.filter((t) => t.id !== pathId);
        saveBugFlows();
        outputChannel.appendLine('[bug-flow] path deleted: "' + found.pt.title + '"');
        notifyFlowState();
    }
    function copyPath(projectId, pathId) {
        const found = findPath(projectId, pathId);
        if (!found)
            return;
        void vscode.env.clipboard.writeText((0, exportBugReport_1.pathReport)(found.pt));
        vscode.window.showInformationMessage('Copied "' + found.pt.title + '" (' + found.pt.steps.length + ' steps) to clipboard.');
    }
    function copyProject(projectId) {
        const proj = bugProjects.find((p) => p.id === projectId);
        if (!proj)
            return;
        void vscode.env.clipboard.writeText((0, exportBugReport_1.composeProjectReport)(proj));
        vscode.window.showInformationMessage('Copied all ' + proj.paths.length + ' path' + (proj.paths.length === 1 ? '' : 's') + ' of "' + proj.name + '" to clipboard.');
    }
    async function exportPath(projectId, pathId) {
        const found = findPath(projectId, pathId);
        if (!found)
            return;
        const report = (0, exportBugReport_1.pathReport)(found.pt);
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) {
            await vscode.env.clipboard.writeText(report);
            vscode.window.showWarningMessage('No workspace folder open — copied to clipboard instead.');
            return;
        }
        const slug = found.pt.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'flow';
        const file = path.join(ws.uri.fsPath, slug + '-report.md');
        fs.writeFileSync(file, report);
        try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
            await vscode.window.showTextDocument(doc, { preview: true });
        }
        catch { /* opening is best-effort */ }
        vscode.window.showInformationMessage('Report saved to ' + file);
    }
    function stopRecording() {
        if (recordingSteps)
            void finishAndSavePath();
    }
    function cancelRecording() {
        if (!recordingSteps)
            return;
        const n = recordingSteps.length;
        recordingSteps = null;
        outputChannel.appendLine('[bug-flow] recording cancelled — ' + n + ' step(s) discarded');
        notifyFlowState();
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
        getDesignTarget: () => designTarget,
        onApplyStyle: (prop, value, x, y) => {
            if (!activePanel || !designTarget)
                return;
            activePanel.webview.postMessage({
                type: 'ecbApplyStyle', prop, value, x, y,
                ecbId: designTarget.ecbId ?? null,
                selector: designTarget.cssSelector
            });
        },
        onRefreshStyles: () => {
            if (activePanel)
                activePanel.webview.postMessage({ type: 'ecbGetStyles' });
        },
        onDesignDeselect: () => {
            if (activePanel)
                activePanel.webview.postMessage({ type: 'ecbDeselect' });
        },
        onDesignActivity: () => {
            if (activePanel)
                activePanel.webview.postMessage({ type: 'ecbEditActive' });
        },
        onCommitStyleEdits: (ecbId, edits) => commitStyleEdits(ecbId, edits),
        bug: {
            view: () => bugView(),
            newProject: () => { void promptNewProject(); },
            selectProject,
            renameProject,
            deleteProject,
            deletePath,
            copyPath,
            copyProject,
            exportPath,
            stopRecording,
            cancelRecording
        }
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
            const panel = vscode.window.createWebviewPanel('elementClickBrowser', 'Element Browser — ' + urlInput, vscode.ViewColumn.One, 
            // retainContextWhenHidden: without it VS Code tears down the
            // page iframe when the tab is hidden (e.g. switching to a
            // second browser tab), wiping the URL bar and app state.
            { enableScripts: true, retainContextWhenHidden: true });
            panel.webview.html = (0, panelHtml_1.getWebviewHtml)(proxyPort);
            activePanel = panel;
            lastTargetUrl = urlInput;
            panel.webview.onDidReceiveMessage(async (msg) => {
                if (msg.type === 'elementClicked') {
                    const d = msg.data;
                    d.timestamp = Date.now();
                    try {
                        d.contextText = (0, buildContextText_1.buildContextText)(d);
                    }
                    catch { /* keep raw */ }
                    // switching to a different element ends the previous editing session
                    if (designTarget && designTarget.ecbId && designTarget.ecbId !== d.ecbId) {
                        styleSessionData = designTarget;
                    }
                    // Clicked elements are Design-tab edit targets only — they are
                    // NOT listed in captured-element history, tree view or disk.
                    designTarget = d;
                    showDetails(d); // silent output-channel log for debugging
                    sidebarProvider.postUpdate();
                    return;
                }
                if (msg.type === 'designCleared') {
                    // user clicked outside / same element / Esc — editing session over
                    styleSessionData = designTarget;
                    designTarget = null;
                    sidebarProvider.postUpdate();
                    return;
                }
                if (msg.type === 'designStyles') {
                    // Fresh computed snapshot from the page after an edit —
                    // merge into the design target and refresh the sidebar.
                    const s = msg.data;
                    if (s && designTarget) {
                        designTarget.ecbId = s.ecbId ?? designTarget.ecbId;
                        designTarget.styles = s.styles ?? designTarget.styles;
                    }
                    sidebarProvider.postUpdate();
                    return;
                }
                if (msg.type === 'toggleFlow') {
                    if (!recordingSteps)
                        void startRecording();
                    else
                        void finishAndSavePath();
                    return;
                }
                if (msg.type === 'stepSaved') {
                    const d = msg.data;
                    if (!d || typeof d !== 'object' || !recordingSteps)
                        return;
                    d.timestamp = Date.now();
                    try {
                        d.contextText = (0, buildContextText_1.buildContextText)(d);
                    }
                    catch { /* keep raw */ }
                    recordingSteps.push({ element: d, note: String(msg.note || '') });
                    outputChannel.appendLine('[bug-flow] Step ' + recordingSteps.length + ': <' + d.tag + '>' + (d.id ? ' #' + d.id : '')
                        + (d.className ? ' .' + d.className.split(/\s+/).slice(0, 2).join('.') : '')
                        + (msg.note ? ' — "' + msg.note + '"' : ''));
                    activePanel?.webview.postMessage({ type: 'flowCount', count: recordingSteps.length });
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
                else if (msg.type === 'ready') {
                    // The webview posts this on every (re)creation — e.g.
                    // after its content was torn down while hidden — so
                    // ALWAYS answer with the launch URL + flow state.
                    panel.webview.postMessage({ type: 'load', url: urlInput, target: urlInput });
                    panel.webview.postMessage({
                        type: 'flowState',
                        active: !!recordingSteps,
                        count: recordingSteps ? recordingSteps.length : 0
                    });
                }
            }, undefined, context.subscriptions);
            panel.onDidDispose(() => {
                proxy.dispose();
                if (activePanel === panel)
                    activePanel = undefined;
            }, undefined, context.subscriptions);
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