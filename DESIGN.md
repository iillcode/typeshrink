# Element Browser — Design Tokens

Single source of truth for every color used across the extension UI
(browser panel toolbar, sidebar launcher and the Design placeholder).
**Do not introduce colors outside this list.**

## Palette

| Hex       | Role                                            |
|-----------|-------------------------------------------------|
| `#1E1F1C` | Main dark UI — body bg, panel background        |
| `#272822` | Toolbar surface                                 |
| `#34352F` | Subtle borders                                  |
| `#3E3D32` | Hover states                                    |
| `#414339` | Inputs, secondary buttons, active bg            |
| `#75715E` | Focus rings, placeholder / muted text           |
| `#F8F8F2` | Main UI text                                    |

## Where each token is applied

### Browser panel (`src/webview/panelHtml.ts`)

| Element                                   | Token(s)                          |
|-------------------------------------------|-----------------------------------|
| Body & content background                 | `#1E1F1C`                         |
| Toolbar surface                           | `#272822`                         |
| Nav/tool button text                      | `#F8F8F2`                         |
| Button hover / active                     | `#3E3D32` / `#414339`             |
| URL bar input                             | bg `#414339`, text `#F8F8F2`      |
| URL bar focus border                      | `#75715E`                         |
| Placeholder / muted text                  | `#75715E`                         |
| Line loader track / sweep                 | `#34352F` / `#F8F8F2`             |

### Sidebar (`src/webview/sidebarHtml.ts`)

Launcher button + static Design placeholder, themed by overriding VS Code
CSS custom properties on `:root`:

```
--vscode-sideBar-background            → #1E1F1C
--vscode-foreground                    → #F8F8F2
--vscode-panel-border                  → #34352F
--vscode-list-hoverBackground          → #3E3D32
--vscode-toolbar-hoverBackground       → #3E3D32
--vscode-badge-background              → #75715E
--vscode-badge-foreground              → #F8F8F2
--vscode-button-secondaryBackground    → #414339
--vscode-button-secondaryForeground    → #F8F8F2
--vscode-button-secondaryHoverBackground → #75715E
--vscode-focusBorder                   → #75715E
--vscode-textCodeBlock-background      → #272822
```

## Rules for new UI

1. Pick from the table above; never invent hex values.
2. Text is always `#F8F8F2`.
3. Muted/placeholder text = `#75715E`.
4. Borders default to `#34352F`; interactive borders/focus = `#75715E`.
