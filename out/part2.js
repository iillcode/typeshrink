"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// ---- Rich sidebar UI (Kilo Code style) ----
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function getSidebarHtml() {
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body{margin:0;padding:0;font-family:var(--vscode-font-family);font-size:13px;
    color:var(--vscode-foreground);background:var(--vscode-sideBar-background);}
  /* ---- Header ---- */
  #header{display:flex;align-items:center;gap:6px;padding:10px 12px;border-bottom:1px solid var(--vscode-panel-border);}
  #header h2{margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;flex:1;}
  .icon-btn{background:none;border:none;color:var(--vscode-foreground);opacity:.7;cursor:pointer;
    font-size:14px;padding:3px 6px;border-radius:4px;line-height:1;}
  .icon-btn:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground);}
  /* ---- Empty state ---- */
  #empty{display:flex;flex-direction:column;align-items:center;padding:48px 24px;text-align:center;gap:10px;}
  #empty .big{font-size:34px;opacity:.5;}
  #empty p{margin:0;opacity:.65;font-size:12px;line-height:1.5;}
  /* ---- Element cards ---- */
  #cards{overflow-y:auto;}
  .card{border-bottom:1px solid var(--vscode-panel-border);padding:9px 12px;cursor:pointer;}
  .card:hover{background:var(--vscode-list-hoverBackground);}
  .row{display:flex;align-items:center;gap:7px;}
  .tag-badge{font-family:monospace;font-size:11px;font-weight:600;padding:1px 6px;border-radius:3px;
    background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);}
  .snippet{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85;font-size:12px;}
  .chev{opacity:.5;font-size:11px;transition:transform .15s;}
  .card.open .chev{transform:rotate(90deg);}
  .detail{display:none;margin-top:8px;border-left:2px solid var(--vscode-focusBorder);padding-left:10px;}
  .card.open .detail{display:block;}
  .kv{margin:3px 0;font-size:11px;}
  .kv b{opacity:.6;font-weight:400;margin-right:5px;}
  code{font-family:var(--vscode-editor-font-family,monospace);font-size:11px;
    background:var(--vscode-textCodeBlock-background);padding:1px 4px;border-radius:3px;
    word-break:break-all;display:inline-block;max-width:100%;}
  .actions{display:flex;gap:6px;margin-top:7px;}
  .mini{font-size:10px;padding:2px 8px;border-radius:3px;border:1px solid var(--vscode-button-border,transparent);
    background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);
    cursor:pointer;}
  .mini:hover{background:var(--vscode-button-secondaryHoverBackground);}
  html{color-scheme:var(--vscode-color-scheme, dark);}
</style></head>
<body>
<div id="header">
  <h2>Element Browser</h2>
  <span id="count" style="font-size:11px;opacity:.6;"></span>
  <button class="icon-btn" id="clearBtn" title="Clear history">$(clear-all)🗑</button>
</div>
<div id="empty">
  <div class="big">🎯</div>
  <p><b>No elements captured yet.</b><br/>
  Start inspecting your app, then click any element in the browser panel — its details will appear here.</p>
  <button class="mini" id="startBtn">▶ Start Inspecting</button>
</div>
<div id="cards"></div>
<script>
  const vscode = acquireVsCodeApi();
  let history = [];
  const $ = id => document.getElementById(id);

  function render(){
    $('count').textContent = history.length ? history.length + ' captured' : '';
    $('empty').style.display = history.length ? 'none' : 'flex';
    const cards = $('cards'); cards.innerHTML = '';
    [...history].reverse().forEach((d) => {
      const card = document.createElement('div'); card.className = 'card';
      const row = document.createElement('div'); row.className = 'row';
      const tag = document.createElement('span'); tag.className = 'tag-badge'; tag.textContent = '<' + (d.tag||'?') + '>';
      const snip = document.createElement('span'); snip.className = 'snippet';
      snip.textContent = d.text ? '"' + d.text.slice(0,40) + '"' : (d.id ? '#'+d.id : d.cssSelector || '');
      snip.title = snip.textContent;
      const chev = document.createElement('span'); chev.className = 'chev'; chev.textContent = '▶';
      row.appendChild(tag); row.appendChild(snip); row.appendChild(chev);
      card.appendChild(row);

      const det = document.createElement('div'); det.className = 'detail';
      det.innerHTML =
        '<div class="kv"><b>ID</b>' + (d.id ? '<code>'+esc(d.id)+'</code>' : '<i style="opacity:.5">—</i>') + '</div>' +
        '<div class="kv"><b>CLASS</b>' + (d.className ? '<code>'+esc(d.className)+'</code>' : '<i style="opacity:.5">—</i>') + '</div>' +
        '<div class="kv"><b>XPATH</b><code>'+esc(d.xpath||'')+'</code></div>' +
        '<div class="kv"><b>CSS</b><code>'+esc(d.cssSelector||'')+'</code></div>';
      const actions = document.createElement('div'); actions.className = 'actions';
      actions.innerHTML = '<button class="mini" data-a="xpath">Copy XPath</button>' +
        '<button class="mini" data-a="css">Copy CSS</button>' +
        '<button class="mini" data-a="html">Copy HTML</button>' +
        '<button class="mini" data-a="details">Details…</button>';
      actions.querySelectorAll('.mini').forEach(btn => {
        btn.onclick = function(ev){
          ev.stopPropagation();
          const a = btn.getAttribute('data-a');
          if(a === 'xpath') vscode.postMessage({type:'copy', value:d.xpath||''});
          else if(a === 'css') vscode.postMessage({type:'copy', value:d.cssSelector||''});
          else if(a === 'html') vscode.postMessage({type:'copy', value:d.outerHTML||''});
          else vscode.postMessage({type:'showDetails', data:d});
        };
      });
      det.appendChild(actions);
      card.appendChild(det);
      card.onclick = () => card.classList.toggle('open');
      cards.appendChild(card);
    });
  }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  window.addEventListener('message', ev => {
    const m = ev.data;
    if(m && m.type === 'elements'){ history = m.history || []; render(); }
  });
  $('clearBtn').onclick = () => vscode.postMessage({type:'clearHistory'});
  $('startBtn').onclick = () => vscode.postMessage({type:'start'});
  vscode.postMessage({type:'sidebarReady'});
</script>
</body></html>`;
}
// ---- Sidebar Webview View (rich UI like Kilo Code) — class defined inside activate() ----
function activate(context) {
    const outputChannel = vscode.window.createOutputChannel('Element Click Browser');
    let history = [];
    // ---- Sidebar Webview View (rich UI like Kilo Code) ----
    class SidebarViewProvider {
        constructor(ctx) {
            this.ctx = ctx;
        }
        resolveWebviewView(view) {
            this.view = view;
            view.webview.options = { enableScripts: true };
            view.webview.html = getSidebarHtml();
            view.webview.onDidReceiveMessage((msg) => {
                if (msg.type === 'copy') {
                    void vscode.env.clipboard.writeText(msg.value);
                    vscode.window.showInformationMessage('Copied to clipboard');
                }
                else if (msg.type === 'showDetails') {
                    showDetails(msg.data, true);
                }
                else if (msg.type === 'clearHistory') {
                    history = [];
                    saveToFile();
                    treeProvider.refresh();
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
    SidebarViewProvider.viewId = 'elementClickBrowser.sidebarView';
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
        outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] Clicked <${d.tag}> ${d.id ? '#' + d.id : ''}`);
        outputChannel.appendLine(JSON.stringify(d, null, 2));
        if (focus)
            outputChannel.show(true);
    }
    async function copy(value) {
        if (!value)
            return;
        await vscode.env.clipboard.writeText(value);
        vscode.window.showInformationMessage(`Copied: ${value}`);
    }
    function shortUrl(u) {
        try {
            const p = new URL(u);
            return p.host + p.pathname;
        }
        catch {
            return u;
        }
    }
    // ---- Tree data provider for sidebar view ----
    class ElementsTreeProvider {
        constructor() {
            this._onDidChange = new vscode.EventEmitter();
            this.onDidChangeTreeData = this._onDidChange.event;
        }
        refresh() { this._onDidChange.fire(); }
        getTreeItem(item) { return item; }
        getChildren(el) {
            if (!el) {
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
            const label2 = [d.id ? '#' + d.id : '', d.className ? '.' + d.className.trim().split(/\\s+/)[0] : '', d.text ? `"${d.text.slice(0, 24)}"` : '']
                .filter(Boolean).join(' ');
            void label2;
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
    const treeProvider = new ElementsTreeProvider();
    const sidebarProvider = new SidebarViewProvider(context);
    // ---- (CDP inspector removed — now using InjectingProxy + webview) ----
    context.subscriptions.push(outputChannel, vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewId, sidebarProvider, {
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
            const proxy = new InjectingProxy();
            const proxyPort = await proxy.start(targetOrigin);
            outputChannel.appendLine(`Proxy running on http://127.0.0.1:${proxyPort} -> ${targetOrigin}`);
            const panel = vscode.window.createWebviewPanel('elementClickBrowser', `Element Browser — ${urlInput}`, vscode.ViewColumn.One, { enableScripts: true });
            panel.webview.html = getWebviewHtml(proxyPort);
            let ready = false;
            panel.webview.onDidReceiveMessage((msg) => {
                if (msg.type === 'elementClicked') {
                    const d = msg.data;
                    d.timestamp = Date.now();
                    history.push(d);
                    saveToFile();
                    showDetails(d); // logs silently — never steals focus
                    sidebarProvider.postUpdate();
                }
                else if (msg.type === 'showDetails') {
                    showDetails(msg.data);
                }
                else if (msg.type === 'pageInfo') {
                    const u = msg.url || 'No page loaded yet.';
                    vscode.window.showInformationMessage(`Page: ${u} | ${history.length} element(s) captured`, 'Clear history')
                        .then(pick => { if (pick === 'Clear history')
                        vscode.commands.executeCommand('elementClickBrowser.clearHistory'); });
                }
                else if (msg.type === 'ready' && !ready) {
                    ready = true;
                    panel.webview.postMessage({ type: 'load', url: urlInput });
                }
            }, undefined, context.subscriptions);
            panel.onDidDispose(() => proxy.dispose(), undefined, context.subscriptions);
            panel.webview.postMessage({ type: 'load', url: urlInput });
            sidebarProvider.reveal();
            vscode.window.showInformationMessage(`Inspecting ${urlInput} — click any element in the browser panel.`);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to start inspector: ${err.message}`);
        }
    }), vscode.commands.registerCommand('elementClickBrowser.stop', () => {
        vscode.window.showInformationMessage('Close the Element Browser tab to stop inspecting.');
    }), vscode.commands.registerCommand('elementClickBrowser.clearHistory', () => {
        history = [];
        treeProvider.refresh();
        saveToFile();
        sidebarProvider.postUpdate();
        vscode.window.showInformationMessage('Clicked elements history cleared.');
    }), vscode.commands.registerCommand('elementClickBrowser.showDetails', showDetails), vscode.commands.registerCommand('elementClickBrowser.copyXPath', (item) => copy(item.xpath)), vscode.commands.registerCommand('elementClickBrowser.copySelector', (item) => copy(item.cssSelector)));
    context.subscriptions.push({ dispose: () => { } });
}
function deactivate() { }
//# sourceMappingURL=part2.js.map