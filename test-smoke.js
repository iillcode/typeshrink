// Smoke test: mock the 'vscode' module and verify the extension activates and registers commands.
const Module = require('module');
const origResolve = Module._resolveFilename;

const calls = [];
const disposables = [];

Module._resolveFilename = function (request, ...args) {
  if (request === 'vscode') return 'mock-vscode';
  return origResolve.call(this, request, ...args);
};

require.cache['mock-vscode'] = {
  id: 'mock-vscode',
  filename: 'mock-vscode',
  loaded: true,
  exports: {
    window: {
      createWebviewPanel: () => ({
        webview: { onDidReceiveMessage() {}, set html(v) { calls.push(['html', v.length]); }, get html() { return ''; } },
        dispose() {},
      }),
      createOutputChannel: () => ({ appendLine() {}, show() {} }),
      registerTreeDataProvider() {},
      registerWebviewViewProvider() {},
      showInformationMessage() {},
    },
    commands: {
      registerCommand: (name, fn) => { calls.push(['command', name]); return { name, fn }; },
      executeCommand() {},
    },
    workspace: { workspaceFolders: [{ uri: { fsPath: '.' } }] },
    env: { clipboard: { writeText() {} } },
    TreeItem: class {},
    TreeDataProvider: class {},
    ThemeIcon: class { constructor(icon) { this.icon = icon; } },
    MarkdownString: class { appendMarkdown() {} },
    WebviewViewProvider: class {},
    EventEmitter: class { fire() {} event = {}; },
    ViewColumn: { One: 1 },
    TreeItemCollapsibleState: { None: 0 },
  },
};

const m = require('./out/extension.js');
console.log('module loaded OK. exports:', Object.keys(m).join(', '));

if (typeof m.activate !== 'function') throw new Error('activate is not a function');

m.activate({ subscriptions: disposables });
console.log('activate ran OK.');
console.log('registered items:', JSON.stringify(calls, null, 2));

const expected = [
  'elementClickBrowser.open',
  'elementClickBrowser.clearHistory',
  'elementClickBrowser.showDetails',
  'elementClickBrowser.copyXPath',
  'elementClickBrowser.copySelector',
];
const registeredCmds = calls.filter(c => c[0] === 'command').map(c => c[1]);
for (const cmd of expected) {
  if (!registeredCmds.includes(cmd)) throw new Error('MISSING command: ' + cmd);
}
console.log('All', expected.length, 'commands registered ✔');
console.log('webview html set:', calls.some(c => c[0] === undefined), '| html length entries:', calls.filter(c => c[0] === 'html').length);
