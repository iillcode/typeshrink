"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSidebarHtml = getSidebarHtml;
// ---- Sidebar: browser launcher + static "Design" properties placeholder.
// Themed with the extension palette (see DESIGN.md).
function getSidebarHtml() {
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  /* ---- Extension palette (see DESIGN.md) ---- */
  :root{
    --vscode-sideBar-background:#1E1F1C;
    --vscode-foreground:#F8F8F2;
    --vscode-panel-border:#34352F;
    --vscode-list-hoverBackground:#3E3D32;
    --vscode-toolbar-hoverBackground:#3E3D32;
    --vscode-badge-background:#75715E;
    --vscode-badge-foreground:#F8F8F2;
    --vscode-button-secondaryBackground:#414339;
    --vscode-button-secondaryForeground:#F8F8F2;
    --vscode-button-secondaryHoverBackground:#75715E;
    --vscode-focusBorder:#75715E;
    --vscode-textCodeBlock-background:#272822;
  }
  *,*::before,*::after{box-sizing:border-box;}
  html{overflow:hidden;max-width:100%;width:100%;color-scheme:var(--vscode-color-scheme, dark);}
  body{margin:0;padding:0;font-family:'Nunito', system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif;font-size:13px;
    color:var(--vscode-foreground);background:var(--vscode-sideBar-background);
    display:flex;flex-direction:column;min-height:100vh;height:100vh;
    overflow:hidden;max-width:100%;width:100%;contain:paint;}
  /* ---- Launcher ---- */
  #launcher{padding:10px 12px;border-bottom:1px solid var(--vscode-panel-border);}
  #launchBtn{width:100%;font-size:12.5px;font-weight:700;padding:9px 12px;border-radius:6px;
    border:1px solid var(--vscode-focusBorder);cursor:pointer;letter-spacing:.2px;
    background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);
    display:inline-flex;align-items:center;justify-content:center;gap:7px;
    transition:filter .14s ease, transform .12s ease;}
  #launchBtn:hover{background:var(--vscode-button-secondaryHoverBackground);}
  #launchBtn:active{transform:scale(.98);}
  #launchBtn svg{width:15px;height:15px;display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
  /* ---- Panel chrome ---- */
  #designPanel{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;background:transparent;}
  .dp-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px 7px;border-bottom:1px solid var(--vscode-panel-border);flex:0 0 auto;}
  .dp-name{font-size:14px;font-weight:600;color:var(--vscode-foreground);}
  /* ---- Empty state ---- */
  .dp-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 16px;text-align:center;gap:10px;}
  .dp-wordmark{font-size:16px;font-weight:800;letter-spacing:.3px;color:var(--vscode-foreground);}
  .dp-empty p{margin:0;font-size:11px;line-height:1.6;color:var(--vscode-badge-background);}
</style></head>
<body>
<div id="launcher">
  <button id="launchBtn" title="Open the app URL in the browser panel" aria-label="Launch browser">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
    Launch Browser
  </button>
</div>
<div id="designPanel">
  <div class="dp-head">
    <span class="dp-name">Design</span>
  </div>
  <div class="dp-empty">
    <div class="dp-wordmark">Element Designer</div>
    <p>Element selection is currently disabled.<br/>The properties panel will appear here once editing is available.</p>
  </div>
</div>
<script>
  let vscode; try{ vscode = acquireVsCodeApi(); }catch(e){ vscode = { postMessage:function(){} }; }
  document.getElementById('launchBtn').onclick = function(){ try{ vscode.postMessage({ type:'start' }); }catch(e){} };
</script>
</body></html>
`;
}
//# sourceMappingURL=sidebarHtml.js.map