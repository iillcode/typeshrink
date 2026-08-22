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
exports.ElementItem = exports.ElementsTreeProvider = exports.SidebarViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const sidebarHtml_1 = require("../webview/sidebarHtml");
function shortUrl(u) {
    try {
        const p = new URL(u);
        return p.host + p.pathname;
    }
    catch {
        return u;
    }
}
/** Sidebar "Captured Elements" view — element cards with copy actions. */
class SidebarViewProvider {
    constructor(deps) {
        this.deps = deps;
    }
    resolveWebviewView(view) {
        this.view = view;
        view.webview.options = { enableScripts: true };
        view.webview.html = (0, sidebarHtml_1.getSidebarHtml)();
        view.webview.onDidReceiveMessage((msg) => {
            if (msg.type === 'copy') {
                void vscode.env.clipboard.writeText(msg.value);
                vscode.window.showInformationMessage('Copied to clipboard');
            }
            else if (msg.type === 'showDetails') {
                this.deps.onShowDetails(msg.data, true);
            }
            else if (msg.type === 'clearHistory') {
                this.deps.onClearHistory();
                this.postUpdate();
                vscode.window.showInformationMessage('Clicked elements history cleared.');
            }
            else if (msg.type === 'start') {
                vscode.commands.executeCommand('elementClickBrowser.open');
            }
            else if (msg.type === 'sidebarReady') {
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
        }
        else {
            void vscode.commands.executeCommand('elementClickBrowser.sidebarView.focus');
        }
    }
}
exports.SidebarViewProvider = SidebarViewProvider;
SidebarViewProvider.viewId = 'elementClickBrowser.sidebarView';
/** Flat list of captured elements shown under the sidebar view. */
class ElementsTreeProvider {
    constructor(getHistory) {
        this.getHistory = getHistory;
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChange.event;
    }
    refresh() { this._onDidChange.fire(); }
    getTreeItem(item) { return item; }
    getChildren(el) {
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
exports.ElementsTreeProvider = ElementsTreeProvider;
class ElementItem extends vscode.TreeItem {
    constructor(d, index, placeholder = false) {
        const label = placeholder
            ? d.tag
            : `${index + 1}. <${d.tag}> ${[d.id ? '#' + d.id : '', d.className ? '.' + d.className.trim().split(/\\s+/)[0] : '', d.text ? `"${d.text.slice(0, 24)}"` : ''].filter(Boolean).join(' ')}`.slice(0, 70);
        super(label, vscode.TreeItemCollapsibleState.None);
        this.xpath = '';
        this.cssSelector = '';
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
exports.ElementItem = ElementItem;
//# sourceMappingURL=providers.js.map