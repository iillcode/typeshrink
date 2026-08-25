import * as vscode from 'vscode';
import { getSidebarHtml } from '../webview/sidebarHtml';

/** Sidebar view — browser launcher + static "Design" properties placeholder. */
export class SidebarViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewId = 'elementClickBrowser.sidebarView';
	private view?: vscode.WebviewView;

	constructor() {}

	resolveWebviewView(view: vscode.WebviewView) {
		this.view = view;
		view.webview.options = { enableScripts: true };
		view.webview.html = getSidebarHtml();
		view.webview.onDidReceiveMessage((msg) => {
			if (msg && msg.type === 'start') {
				void vscode.commands.executeCommand('elementClickBrowser.open');
			}
		});
	}

	reveal() {
		if (this.view) {
			void this.view.show?.(true);
		} else {
			void vscode.commands.executeCommand('elementClickBrowser.sidebarView.focus');
		}
	}
}
