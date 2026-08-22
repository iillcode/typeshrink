import * as vscode from 'vscode';
import { ElementData } from '../types';
import { getSidebarHtml } from '../webview/sidebarHtml';

function shortUrl(u: string): string {
	try { const p = new URL(u); return p.host + p.pathname; } catch { return u; }
}

/** Dependencies the sidebar needs from the host extension. */
export interface SidebarDeps {
	getHistory: () => ElementData[];
	saveToFile(): void;
	/** Clears history in the host (array + persistence + tree refresh). */
	onClearHistory(): void;
	onShowDetails(d: ElementData, focus?: boolean): void;
	onOpenBrowser(): void;
}

/** Sidebar "Captured Elements" view — element cards with copy actions. */
export class SidebarViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewId = 'elementClickBrowser.sidebarView';
	private view?: vscode.WebviewView;

	constructor(private readonly deps: SidebarDeps) {}

	resolveWebviewView(view: vscode.WebviewView) {
		this.view = view;
		view.webview.options = { enableScripts: true };
		view.webview.html = getSidebarHtml();
		view.webview.onDidReceiveMessage((msg) => {
			if (msg.type === 'copy') {
				void vscode.env.clipboard.writeText(msg.value);
				vscode.window.showInformationMessage('Copied to clipboard');
			} else if (msg.type === 'showDetails') {
				this.deps.onShowDetails(msg.data as ElementData, true);
			} else if (msg.type === 'clearHistory') {
				this.deps.onClearHistory();
				this.postUpdate();
				vscode.window.showInformationMessage('Clicked elements history cleared.');
			} else if (msg.type === 'start') {
				vscode.commands.executeCommand('elementClickBrowser.open');
			} else if (msg.type === 'sidebarReady') {
				this.postUpdate();
			}
		});
		this.postUpdate();
	}

	postUpdate() {
		const history = this.deps.getHistory();
		this.view?.webview.postMessage({ type: 'elements', history, count: history.length });
	}

	reveal() {
		if (this.view) {
			void this.view.show?.(true);
		} else {
			void vscode.commands.executeCommand('elementClickBrowser.sidebarView.focus');
		}
	}
}

/** Flat list of captured elements shown under the sidebar view. */
export class ElementsTreeProvider implements vscode.TreeDataProvider<ElementItem> {
	private _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChange.event;

	constructor(private readonly getHistory: () => ElementData[]) {}

	refresh() { this._onDidChange.fire(); }
	getTreeItem(item: ElementItem) { return item; }
	getChildren(el?: ElementItem): ElementItem[] {
		if (!el) {
			const history = this.getHistory();
			if (history.length === 0) {
				return [new ElementItem({
					tag: 'No elements yet', id: '', className: '', text: 'Click elements in the browser panel',
					xpath: '', cssSelector: '', outerHTML: '', timestamp: 0
				}, 0, true)];
			}
			return history.map((d, i) => new ElementItem(d, i));
		}
		return [];
	}
}

export class ElementItem extends vscode.TreeItem {
	xpath = '';
	cssSelector = '';
	constructor(d: ElementData, index: number, placeholder = false) {
		const label = placeholder
			? d.tag
			: `${index + 1}. <${d.tag}> ${[d.id ? '#' + d.id : '', d.className ? '.' + d.className.trim().split(/\\s+/)[0] : '', d.text ? `"${d.text.slice(0, 24)}"` : ''].filter(Boolean).join(' ')}`.slice(0, 70);
		super(label, vscode.TreeItemCollapsibleState.None);
		if (placeholder) {
			this.tooltip = d.text;
			return;
		}
		this.description = shortUrl(d.url ?? '');
		const md = new vscode.MarkdownString();
		md.appendMarkdown([
			`**<${d.tag}>** ${d.id ? '`#' + d.id + '`' : ''} ${d.className ? '`.' + d.className.split(' ').join('`.`') + '`' : ''}`,
			'',
			d.text ? `📝 ${d.text.slice(0, 80)}\n` : '',
			'---',
			`- **XPath:** \`${d.xpath}\``,
			`- **CSS:** \`${d.cssSelector}\``,
			'',
			'```html',
			d.outerHTML.slice(0, 200),
			'```'
		].join('\n'));
		md.supportHtml = true;
		this.tooltip = md;
		this.iconPath = new vscode.ThemeIcon('symbol-tag');
		this.contextValue = 'clickedElement';
		this.xpath = d.xpath;
		this.cssSelector = d.cssSelector;
		this.command = {
			command: 'elementClickBrowser.showDetails',
			title: 'Show Details',
			arguments: [d]
		};
	}
}
