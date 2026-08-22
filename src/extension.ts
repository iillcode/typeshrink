import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ElementData } from './types';
import { InjectingProxy } from './proxy/injectingProxy';
import { SessionStore } from './session';
import { getWebviewHtml } from './webview/panelHtml';
import { buildContextText } from './capture/buildContextText';
import { SidebarViewProvider, ElementsTreeProvider, ElementItem } from './sidebar/providers';

export function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel('Element Click Browser');
	let history: ElementData[] = [];
	const sessions = new SessionStore(context.globalStorageUri.fsPath, (m) => outputChannel.appendLine(m));

	// ---- Helpers ----
	function saveToFile() {
		const ws = vscode.workspace.workspaceFolders?.[0];
		if (!ws) return;
		try {
			fs.writeFileSync(path.join(ws.uri.fsPath, 'clicked-elements.json'), JSON.stringify(history, null, 2));
		} catch (e: any) {
			outputChannel.appendLine('saveToFile failed: ' + e.message);
		}
	}

	function showDetails(d: ElementData, focus = false) {
		outputChannel.appendLine('[' + new Date().toLocaleTimeString() + '] Clicked <' + d.tag + '>' + (d.id ? ' #' + d.id : ''));
		outputChannel.appendLine(d.contextText ?? JSON.stringify(d, null, 2));
		if (focus) outputChannel.show(true);
	}

	async function copy(value?: string) {
		if (!value) return;
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
	const treeProvider = new ElementsTreeProvider(() => history);
	const sidebarProvider = new SidebarViewProvider({
		getHistory: () => history,
		saveToFile,
		onClearHistory: clearAllHistory,
		onShowDetails: showDetails,
		onOpenBrowser: () => { void vscode.commands.executeCommand('elementClickBrowser.open'); },
	});

	context.subscriptions.push(
		outputChannel,
		vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewId, sidebarProvider, {
			webviewOptions: { retainContextWhenHidden: true }
		}),

		vscode.window.registerTreeDataProvider('elementClickBrowser.elementsView', treeProvider),

		vscode.commands.registerCommand('elementClickBrowser.open', async () => {
			const urlInput = await vscode.window.showInputBox({
				prompt: 'Enter the URL of your app (e.g. http://localhost:3000)',
				value: 'http://localhost:3000',
				ignoreFocusOut: true
			});
			if (!urlInput) return;

			let targetOrigin: string;
			try { targetOrigin = new URL(urlInput).origin; } catch {
				vscode.window.showErrorMessage('Invalid URL.');
				return;
			}

			try {
				const jar = sessions.getJar(targetOrigin);
				const proxy = new InjectingProxy(jar);
				proxy.onJarChanged = () => sessions.persistJars();
				const proxyPort = await proxy.start(targetOrigin, sessions.candidatesFor(targetOrigin));
				sessions.rememberPort(targetOrigin, proxyPort);
				outputChannel.appendLine('Proxy running on http://127.0.0.1:' + proxyPort + ' -> ' + targetOrigin + ' (jar: ' + jar.size + ' cookies)');

				const panel = vscode.window.createWebviewPanel(
					'elementClickBrowser',
					'Element Browser — ' + urlInput,
					vscode.ViewColumn.One,
					{ enableScripts: true }
				);
				panel.webview.html = getWebviewHtml(proxyPort);

				let ready = false;
				panel.webview.onDidReceiveMessage(
					async (msg) => {
						if (msg.type === 'elementClicked') {
							const d = msg.data as ElementData;
							d.timestamp = Date.now();
							try { d.contextText = buildContextText(d); } catch { /* keep raw */ }
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
									if (changed) sessions.persistJars();
								}
							} catch { /* ignore malformed mirrors */ }
							return;
						}
						if (msg.type === 'openExternal' || msg.type === 'openCurrent') {
							let externalUrl: string | undefined;
							if (msg.type === 'openExternal' && msg.url) {
								externalUrl = String(msg.url);
							} else if (msg.type === 'openCurrent') {
								// Map the proxied URL back to the real target origin.
								try {
									const u = new URL(String(msg.url || ''));
									externalUrl = targetOrigin + u.pathname + u.search + u.hash;
								} catch {
									externalUrl = urlInput;
								}
							}
							if (externalUrl && externalUrl.startsWith('http://') || externalUrl && externalUrl.startsWith('https://')) {
								await vscode.env.openExternal(vscode.Uri.parse(externalUrl));
								vscode.window.showInformationMessage(
									'Opened in your system browser. Complete the login there, then press Reload in the panel. If the app redirects back to the panel address, the session is captured automatically.'
								);
							}
							return;
						}
						if (msg.type === 'showDetails') {
							showDetails(msg.data as ElementData);
						} else if (msg.type === 'pageInfo') {
							const u = msg.url || 'No page loaded yet.';
							vscode.window.showInformationMessage('Page: ' + u + ' | ' + history.length + ' element(s) captured', 'Clear history')
								.then(pick => { if (pick === 'Clear history') clearAllHistory(); });
						} else if (msg.type === 'ready' && !ready) {
							ready = true;
							panel.webview.postMessage({ type: 'load', url: urlInput, target: urlInput });
						}
					},
					undefined,
					context.subscriptions
				);
				panel.onDidDispose(() => proxy.dispose(), undefined, context.subscriptions);

				panel.webview.postMessage({ type: 'load', url: urlInput });
				sidebarProvider.reveal();
				vscode.window.showInformationMessage('Inspecting ' + urlInput + ' — click any element in the browser panel.');
			} catch (err: any) {
				vscode.window.showErrorMessage('Failed to start inspector: ' + err.message);
			}
		}),

		vscode.commands.registerCommand('elementClickBrowser.stop', () => {
			vscode.window.showInformationMessage('Close the Element Browser tab to stop inspecting.');
		}),

		vscode.commands.registerCommand('elementClickBrowser.clearSession', async () => {
			const originInput = await vscode.window.showInputBox({
				prompt: 'Clear the saved login session for which origin? (leave empty to clear ALL)',
				value: 'http://localhost:3000',
				ignoreFocusOut: true
			});
			if (originInput === undefined) return;
			if (originInput.trim() === '') {
				sessions.clearAllSessions();
				vscode.window.showInformationMessage('All saved proxy sessions cleared. Reload the Element Browser to log in fresh.');
				return;
			}
			try {
				const origin = new URL(originInput.trim()).origin;
				sessions.dropJar(origin);
				vscode.window.showInformationMessage('Saved session for ' + origin + ' cleared.');
			} catch {
				vscode.window.showErrorMessage('Invalid URL.');
			}
		}),

		vscode.commands.registerCommand('elementClickBrowser.clearHistory', clearAllHistory),

		vscode.commands.registerCommand('elementClickBrowser.showDetails', showDetails),

		vscode.commands.registerCommand('elementClickBrowser.copyXPath', (item: ElementItem) => copy(item.xpath)),

		vscode.commands.registerCommand('elementClickBrowser.copySelector', (item: ElementItem) => copy(item.cssSelector))
	);
}

export function deactivate() {}
