# Element Click Browser — Design Tokens

Single source of truth for every color used across the extension UI
(browser panel toolbar, note editor, toasts, badges, sidebar view and the
injected inspection overlays). **Do not introduce colors outside this list.**

## Palette

| Hex       | Role                                            |
|-----------|-------------------------------------------------|
| `#1E1F1C` | Main dark UI — tabs, title, panels, body bg     |
| `#272822` | Editor / activity bar / toolbar surface         |
| `#34352F` | Inactive tabs, subtle borders                   |
| `#3E3D32` | Hover states, line highlight                    |
| `#414339` | Inputs, status bar, panel borders, active bg    |
| `#75715E` | Focus rings, buttons, active borders, badges    |
| `#F8F8F2` | Main UI text                                    |

Functional exceptions (kept intentionally):

- `#FFFFFF` — selection highlighter inside inspected pages (hover box,
  clicked-element outline, hover label) and the note-editor input border /
  `+` button, per product decision: white stands out on any page.

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
| Capture badge (`#badge`, `.badge-dot`)    | bg `#75715E`, border `#272822`    |
| Bug-flow active button (`#flowBtn.flow-on`) | bg `#414339`, text `#F8F8F2`    |
| Step-count badge (`#flowBadge`)           | bg `#75715E`, text `#F8F8F2`      |
| "Step added" toast (`#flowToast`)         | bg `#75715E`, text `#F8F8F2`      |
| Note editor card (`#noteBox`)             | bg `#272822`, border `#34352F`    |
| Note input (`#noteInput`)                 | bg `#414339`, **border `#FFFFFF`**|
| Add-step button (`#noteAdd`)              | bg `#FFFFFF`, text `#1E1F1C`      |

### Sidebar view (`src/webview/sidebarHtml.ts`)

Themed by overriding VS Code CSS custom properties on `:root`:

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

Bug-flow section extras:

- Recording indicator (`.rec-dot`): blinking `#FFFFFF`
- Step rows use badge tokens for step numbers; delete buttons inherit text color

### Injected inspection overlay (`src/webview/inspectScript.ts`)

| Element                                  | Color                             |
|------------------------------------------|-----------------------------------|
| Hover box border (dashed)                | `rgba(255,255,255,.95)`           |
| Hover box fill                           | `rgba(255,255,255,.10)`           |
| Hover label                              | bg `#FFFFFF`, text `#1E1F1C`      |
| Clicked-element flash (`. __ecb-hl`)     | outline `#FFFFFF`                 |

## Rules for new UI

1. Pick from the table above; never invent hex values.
2. Text is always `#F8F8F2` (or `#1E1F1C` on white/light fills).
3. Muted/placeholder text = `#75715E`.
4. Borders default to `#34352F`; interactive borders/focus = `#75715E`;
   explicit white only where this document lists it.
