# Element Click Browser — Testing & Side Panel Guide

A VS Code extension that opens a webview-based browser where **clicking any element** captures its info (tag, id, class, XPath, CSS selector, HTML) and shows it in a sidebar panel.

---

## 1. Build the Extension

```powershell
npm install        # first time only
npx tsc -p ./      # compile TypeScript -> out/extension.js
```

> Tip: run `npm run watch` during development so every save recompiles automatically.

## 2. Run / Test It

1. Open this workspace folder in VS Code.
2. Press **F5** (or open the Run and Debug panel `Ctrl+Shift+D`, select **Run Element Click Browser**, then press F5).
3. A new window titled **[Extension Development Host]** opens — this is where your extension is loaded.
4. In that new window:
   - Press `Ctrl+Shift+P` to open the Command Palette.
   - Type **"Open Element Click Browser"** and press Enter.
5. A webview tab opens with a demo page (heading, paragraph, button, link, card).

### Test element clicking

- Click any element in the webview → it gets a blue highlight outline.
- A JSON panel at the bottom of the webview shows the captured data.
- In the Extension Development Host:
  - An Output channel ("Element Click Browser") logs full details (`Ctrl+Shift+U` to view).
- Back in your main VS Code window: check `clicked-elements.json` in the project root — every click is saved there automatically.

### Test loading a URL

- Type a URL in the address bar of the webview (e.g. `https://example.com`) and press **Go**.
- The page HTML is fetched and injected; clicks still work on it.
- ⚠️ Only works for sites that allow CORS fetching. Most large sites will block this.

### Debugging tips

- Set breakpoints in `src/extension.ts` (e.g. inside the `onDidReceiveMessage` handler) — they hit when you click elements.
- Use the **Debug Console** in the original window to inspect variables.
- If the command does nothing: make sure you're running it inside the **Extension Development Host** window, not your normal one.

---

## 3. Using the Side Panel (Sidebar View)

The extension adds an Activity Bar icon:

1. Look at the **Activity Bar** (left edge) for the **Element Browser** icon (globe/browser icon).
2. Click it → the side panel opens showing the **Clicked Elements** tree view.
3. Every element you click in the browser appears in the list, e.g. `1. <button> #demoBtn Demo Button`.
   - Item description shows the CSS class name.
   - Hovering shows the element's outerHTML as a tooltip.

### Panel features

| Action | How | Result |
|---|---|---|
| Show details | Click a list item | Full JSON shown in the Output channel |
| Copy XPath | Right-click item → *Copy XPath of Selected Element* | XPath copied to clipboard |
| Copy CSS Selector | Right-click item → *Copy CSS Selector of Selected Element* | Selector copied to clipboard |
| Clear history | Trash icon at top of the panel | Empties the list and `clicked-elements.json` |

---

## 4. Packaging (optional)

```powershell
npm install -g @vscode/vsce
vsce package
```

This creates `element-click-browser-0.0.1.vsix`. Install it via:
Extensions view (`Ctrl+Shift+X`) → `...` menu → **Install from VSIX...**

---

## Project Structure

```
new/
├── .vscode/launch.json     # F5 debug configuration
├── src/extension.ts        # Extension source code
├── out/extension.js        # Compiled output
├── package.json            # Commands, views, menus
├── tsconfig.json           # TypeScript config
├── clicked-elements.json   # Auto-saved click data
└── test-smoke.js           # Node smoke test (mocks vscode API)
```
