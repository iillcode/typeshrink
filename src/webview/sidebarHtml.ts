// ---- Rich sidebar UI (chat-style list + drill-in detail, Nunito/Lucide design) ----
export function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function getSidebarHtml(): string {
	return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
<!-- Open-source icons: Lucide (MIT) via CDN — https://lucide.dev — also inlined as SVG below for offline/CSP -->
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
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
  html{overflow:hidden;max-width:100%;width:100%;}
  body{margin:0;padding:0;font-family:'Nunito', 'Varela Round', system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif;font-size:13px;
    color:var(--vscode-foreground);background:var(--vscode-sideBar-background);
    display:flex;flex-direction:column;min-height:100vh;height:100vh;
    overflow:hidden;max-width:100%;width:100%;contain:paint;}
  button,input,select,textarea{font-family:'Nunito', system-ui, sans-serif;}
  .icon-svg{width:14px;height:14px;flex:0 0 14px;display:block;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
  .icon-svg.sm{width:12px;height:12px;flex:0 0 12px;}
  .icon-svg.lg{width:16px;height:16px;flex:0 0 16px;}
  /* ---- Header ---- */
  #header{display:flex;align-items:center;gap:6px;padding:10px 12px;border-bottom:1px solid var(--vscode-panel-border);}
  #header h2{margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;flex:1;}
  .icon-btn{background:none;border:none;color:var(--vscode-foreground);opacity:.7;cursor:pointer;
    font-size:14px;padding:3px 6px;border-radius:0;line-height:1;}
  .icon-btn:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground);}
  /* ---- Debug Flows section ---- */
  #bugSection{border-bottom:1px solid var(--vscode-panel-border);overflow:hidden;max-width:100%;contain:paint;}
  #bugHead{display:flex;align-items:center;gap:6px;padding:9px 10px 6px;}
  #bugHead h3{margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;flex:1;display:flex;align-items:center;gap:6px;}
  #bugStats{font-size:11px;opacity:.55;white-space:nowrap;}
  #tabGroup{display:flex;gap:4px;flex:0 0 auto;}
  .tab-btn{font-size:10px;padding:4px 10px;border:1px solid var(--vscode-panel-border);background:transparent;color:var(--vscode-foreground);opacity:.7;cursor:pointer;min-width:52px;text-align:center;
    transition: background .18s ease, border-color .18s ease, opacity .18s ease, transform .12s ease;}
  .tab-btn.active{background:var(--vscode-button-secondaryBackground);opacity:1;border-color:var(--vscode-focusBorder);}
  .tab-btn:hover{opacity:1;background:var(--vscode-list-hoverBackground);}
  .tab-btn:active{transform:scale(.96);}
  #newProjBtn{flex:0 0 auto;}
  .rec-dot{width:8px;height:8px;border-radius:0;background:#FFFFFF;display:none;animation:blink 1.2s ease infinite;flex:0 0 auto;}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}
  /* ---- Micro animations (small, no layout jank) ---- */
  @keyframes tabIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
  @keyframes itemIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
  @keyframes detailEnter{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
  @keyframes detailLeave{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(4px)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  /* Recording bar */
  #recBar{display:none;align-items:center;gap:8px;margin:2px 10px 8px;padding:7px 9px;border-radius:0;
    background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-badge-background);}
  #recInfo{flex:1;font-size:11.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
  /* Projects */
  .proj{margin:0 10px 8px;border:1px solid var(--vscode-panel-border);border-radius:0;
    background:var(--vscode-button-secondaryBackground);overflow:hidden;}
  .proj.active{border-color:var(--vscode-focusBorder);}
  .proj-head{display:flex;align-items:center;gap:7px;padding:7px 9px;cursor:pointer;user-select:none;}
  .proj-head:hover{background:var(--vscode-list-hoverBackground);}
  .proj-name{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    flex:1;min-width:20px;}
  .proj-meta{font-size:10.5px;opacity:.5;white-space:nowrap;flex:0 0 auto;}
  .chip{font-size:9px;font-weight:700;letter-spacing:.5px;padding:1px 5px;border-radius:0;
    background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);flex:0 0 auto;white-space:nowrap;}
  .chev{opacity:.5;font-size:10px;transition:transform .15s;flex:0 0 auto;}
  .proj.open .proj-chev,.path.open .path-chev{transform:rotate(90deg);}
  .row-actions{display:flex;gap:1px;visibility:hidden;flex:0 0 auto;}
  .proj-head:hover .row-actions,.path-head:hover .row-actions{visibility:visible;}
  .act{background:none;border:none;color:var(--vscode-foreground);opacity:.6;cursor:pointer;
    width:24px;height:24px;display:flex;align-items:center;justify-content:center;padding:0;border-radius:0;line-height:1;}
  .act:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground);}
  /* Paths */
  .paths{border-top:1px solid var(--vscode-panel-border);}
  .path-hint{padding:8px 10px;font-size:11px;opacity:.55;line-height:1.45;}
  .path{border-bottom:1px solid var(--vscode-panel-border);}
  .path:last-child{border-bottom:none;}
  .path-head{display:flex;align-items:center;gap:6px;padding:6px 9px;cursor:pointer;user-select:none;}
  .path-head:hover{background:var(--vscode-list-hoverBackground);}
  .kind-chip{font-family:monospace;font-size:9px;font-weight:700;letter-spacing:.5px;padding:1px 5px;
    border-radius:0;flex:0 0 auto;}
  .kind-bug{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);}
  .kind-task{background:transparent;color:var(--vscode-badge-foreground);border:1px dashed var(--vscode-badge-background);}
  .path-title{font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:20px;}
  .path-meta{font-size:10px;opacity:.45;white-space:nowrap;flex:0 0 auto;}
  /* Workflow visualization */
  .viz{background:var(--vscode-textCodeBlock-background);border-top:1px dashed var(--vscode-panel-border);max-height:340px;overflow-x:hidden;overflow-y:auto;padding:8px 6px;}
  .viz svg{display:block;margin:0 auto;height:auto;width:100% !important;max-width:100%;}
  .viz-empty{font-size:11px;opacity:.5;padding:4px;text-align:center;}
  /* ---- Chat task list (new pattern for #projList) ---- */
  #projList.chat-list{display:flex;flex-direction:column;overflow-y:auto;overflow-x:clip;max-height:52vh;min-height:0;max-width:100%;contain:paint;}
  .chat-group-head{font-size:10px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;opacity:.45;padding:10px 10px 4px;display:flex;justify-content:space-between;align-items:center;
    animation:fadeUp .18s ease-out both;}
  .chat-item{display:flex;align-items:center;gap:10px;padding:9px 10px;cursor:pointer;border-bottom:1px solid var(--vscode-panel-border);max-width:100%;
    transition:background .14s ease, transform .14s ease; will-change: transform, opacity;}
  .chat-item:hover{background:var(--vscode-list-hoverBackground);}
  .chat-item.entering{animation:itemIn .22s cubic-bezier(.16,.84,.26,1) both;}
  .chat-item:active{transform:translateX(1px) scale(.99);}
  .chat-avatar{width:26px;height:26px;flex:0 0 26px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:0;flex-shrink:0;}
  .chat-avatar.task{background:transparent;border:1px dashed var(--vscode-badge-background);color:var(--vscode-badge-foreground);}
  .chat-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}
  .chat-title{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;}
  .chat-sub{font-size:10.5px;opacity:.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;}
  .chat-time{font-size:10px;opacity:.45;flex:0 0 auto;white-space:nowrap;}
  .chat-chev{opacity:.45;flex:0 0 auto;line-height:1;display:flex;align-items:center;}
  /* Detail (inside task) */
  #taskDetail{display:none;flex-direction:column;overflow:hidden;overflow-x:clip;flex:1;min-height:0;max-height:58vh;max-width:100%;border-top:1px solid var(--vscode-panel-border);contain:paint;}
  #taskDetail.open{display:flex;}
  #taskDetail.anim-enter{animation:detailEnter .22s cubic-bezier(.16,.84,.26,1) both;}
  #taskDetail.anim-leave{animation:detailLeave .16s ease-in both;}
  #bugSection{position:relative;display:flex;flex-direction:column;max-height:62vh;overflow:hidden;max-width:100%;contain:paint;}
  .detail-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);}
  .back-btn{background:none;border:none;color:var(--vscode-foreground);cursor:pointer;font-size:12px;font-weight:600;padding:4px 8px;border-radius:0;opacity:.8;display:flex;align-items:center;gap:4px;}
  .back-btn:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground);}
  .detail-title{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}
  .detail-title b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;}
  .detail-title span{font-size:10px;opacity:.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .chat-thread{flex:1;overflow-y:auto;overflow-x:clip;max-width:100%;padding:12px 10px;display:flex;flex-direction:column;gap:0;background:var(--vscode-sideBar-background);contain:paint;}
  .bubble{max-width:88%;padding:10px 12px;background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:0;position:relative;}
  .bubble.mine{align-self:flex-end;background:var(--vscode-button-secondaryBackground);border-color:var(--vscode-focusBorder);}
  .bubble-head{display:flex;align-items:center;gap:6px;margin-bottom:5px;opacity:.9;}
  .bubble-num{width:18px;height:18px;border-radius:0;background:var(--vscode-badge-background);color:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex:0 0 18px;}
  .bubble-tag{font-family:monospace;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .bubble-note{font-size:11px;line-height:1.45;opacity:.85;font-style:italic;border-left:2px solid var(--vscode-panel-border);padding-left:7px;margin-top:2px;word-break:break-word;}
  .rect-btn{margin-top:8px;padding:8px 10px;background:#414339;border:1px solid #75715E;border-radius:0;font-family:monospace;font-size:11px;display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;user-select:none;}
  .rect-btn:hover{filter:brightness(1.08);}
  .rect-btn span:last-child{font-family:var(--vscode-font-family);font-size:10px;opacity:.6;}
  .bubble-actions{display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;}
  .bubble-actions .mini{font-size:9px;padding:3px 7px;}
  .flow-list{display:flex;flex-direction:column;gap:0;}
  .flow-row{display:flex;align-items:center;gap:10px;padding:9px 10px;background:transparent;border:1px solid var(--vscode-panel-border);border-radius:0;cursor:default;
    transition: background .14s ease, transform .14s ease; will-change: transform, opacity;}
  .flow-row ~ .flow-row{margin-top:-1px;}
  .flow-row:hover{background:var(--vscode-list-hoverBackground);}
  .flow-row.entering{animation:itemIn .22s cubic-bezier(.16,.84,.26,1) both;}
  .flow-num{width:22px;height:22px;flex:0 0 22px;border-radius:50%;background:#fff;color:#1E1F1C;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;line-height:1;}
  .flow-text{flex:1;min-width:0;font-size:12px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.92;}
  .flow-text small{opacity:.5;font-size:11px;margin-left:6px;font-weight:400;}
  .flow-actions{display:flex;gap:4px;opacity:0;visibility:hidden;transition:opacity .14s;flex:0 0 auto;}
  .flow-row:hover .flow-actions{opacity:1;visibility:visible;}
  .flow-actions button{background:transparent;border:1px solid var(--vscode-panel-border);color:var(--vscode-foreground);width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;border-radius:0;opacity:.75;padding:0;line-height:1;}
  .flow-actions button:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground);}
  .flow-detail{display:none;padding:8px 10px;font-size:11px;line-height:1.5;background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-top:none;margin:-1px 0 0 0;}
  .flow-detail.open{display:block;}
  .flow-detail code{display:block;margin:2px 0;max-width:100%;}
  .flow-connector{text-align:center;opacity:.25;font-size:10px;line-height:1;padding:3px 0;}
  .detail-foot{display:flex;gap:6px;padding:8px 10px;border-top:1px solid var(--vscode-panel-border);background:var(--vscode-textCodeBlock-background);align-items:center;flex-wrap:wrap;}
  #bugEmpty{padding:2px 12px 10px;font-size:11px;opacity:.55;line-height:1.5;}
  /* ---- Empty state — centralized ---- */
  #empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;text-align:center;gap:14px;min-height:0;}
  #empty .big{opacity:.45;display:flex;align-items:center;justify-content:center;}
  #empty .big .icon-svg{width:42px;height:42px;flex:0 0 42px;opacity:.9;}
  #empty p{margin:0;opacity:.65;font-size:12px;line-height:1.5;font-weight:300;}
  #empty p b{font-weight:600;}
  /* ---- Element cards ---- */
  #cards{overflow-y:auto;overflow-x:hidden;max-width:100%;}
  .card{border-bottom:1px solid var(--vscode-panel-border);padding:9px 12px;cursor:pointer;}
  .card:hover{background:var(--vscode-list-hoverBackground);}
  .row{display:flex;align-items:center;gap:7px;}
  .tag-badge{font-family:monospace;font-size:11px;font-weight:600;padding:1px 6px;border-radius:0;
    background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);}
  .snippet{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85;font-size:12px;}
  .detail{display:none;margin-top:8px;border-left:2px solid var(--vscode-focusBorder);padding-left:10px;}
  .card.open .detail{display:block;}
  .kv{margin:3px 0;font-size:11px;}
  .kv b{opacity:.6;font-weight:400;margin-right:5px;}
  code{font-family:var(--vscode-editor-font-family,monospace);font-size:11px;
    background:var(--vscode-textCodeBlock-background);padding:1px 4px;border-radius:0;
    word-break:break-all;display:inline-block;max-width:100%;}
  .actions{display:flex;gap:6px;margin-top:7px;}
  .mini{font-size:10px;padding:2px 8px;border-radius:0;border:1px solid var(--vscode-button-border,transparent);
    background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);
    cursor:pointer;}
  .mini:hover{background:var(--vscode-button-secondaryHoverBackground);}
  .mini.subtle{opacity:.7;}
  #startBtn{font-size:13px;padding:10px 18px;border-radius:0;letter-spacing:.2px;min-height:36px;display:inline-flex;align-items:center;gap:6px;justify-content:center;
    transition: transform .12s ease, filter .14s ease;}
  #startBtn:active{transform:scale(.97);}
  html{color-scheme:var(--vscode-color-scheme, dark);}
  /* ==== Design tab — property editor (klone PropertiesSidebar port, system theme) ==== */
  /* Full-sidebar editor mode: listings hidden, section expands */
  body.design-mode #bugSection{max-height:none !important;height:auto;flex:1 1 auto;min-height:0;border-bottom:none;}
  body.design-mode #empty,body.design-mode #cards,body.design-mode #projList,body.design-mode #taskDetail{display:none !important;}
  body.design-mode #designPanel{flex:1 1 auto;max-height:none;min-height:0;}
  #designPanel{display:none;flex-direction:column;background:transparent;border-top:1px solid var(--vscode-panel-border);max-height:62vh;min-height:120px;overflow:hidden;}
  #designPanel ::selection{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);}
  .dp-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px 7px;flex:0 0 auto;}
  .dp-name{font-size:14px;font-weight:600;color:var(--vscode-foreground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;}
  .dp-btns{display:flex;gap:2px;flex:0 0 auto;}
  .dp-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:8px 0;
    scrollbar-width:none;-ms-overflow-style:none;overscroll-behavior:contain;}
  .dp-scroll::-webkit-scrollbar{width:0;height:0;display:none;}
  .dp-sec{padding:10px 12px;border-bottom:1px solid var(--vscode-panel-border);}
  .dp-sec:last-child{border-bottom:none;}
  .dp-title{font-size:11px;font-weight:600;color:var(--vscode-foreground);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:6px;}
  .dp-title span:first-child{flex:1;min-width:0;}
  .dp-sub{font-size:11px;line-height:1;color:var(--vscode-badge-background);margin-bottom:4px;user-select:none;}
  .dp-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:center;}
  .dp-grid21{display:grid;grid-template-columns:1fr minmax(0,84px);gap:6px;align-items:center;}
  .dp-row{display:flex;align-items:center;gap:2px;min-width:0;}
  .dp-mt{margin-top:6px;}
  .dp-badge{font-size:10px;color:var(--vscode-badge-background);margin-right:4px;user-select:none;}
  .dp-btn{width:24px;height:24px;flex:0 0 24px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--vscode-badge-background);cursor:pointer;border-radius:6px;padding:0;}
  .dp-btn:hover{background:var(--vscode-list-hoverBackground);color:var(--vscode-foreground);}
  .dp-btn.on{color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);}
  .dp-btn.on:hover{background:var(--vscode-button-secondaryHoverBackground);}
  .dp-btn.on.bordered{border:1px solid var(--vscode-focusBorder);}
  .dp-btn svg{display:block;}
  .dp-done{color:var(--vscode-button-secondaryForeground) !important;background:var(--vscode-badge-background) !important;}
  .dp-done:hover{filter:brightness(1.12);}
  /* number field */
  .nf{height:24px;min-width:0;width:100%;display:flex;align-items:center;border-radius:6px;background:var(--vscode-textCodeBlock-background);border:1px solid transparent;font-size:11px;color:var(--vscode-foreground);}
  .nf:hover{background:var(--vscode-list-hoverBackground);}
  .nf:focus-within{border-color:var(--vscode-focusBorder);background:var(--vscode-list-hoverBackground);}
  .nf-pre{flex:0 0 auto;display:flex;align-items:center;padding:0 5px;color:var(--vscode-badge-background);user-select:none;pointer-events:none;}
  .nf input{flex:1;min-width:0;border:none;outline:none;background:transparent;color:var(--vscode-foreground);font:inherit;font-size:11px;padding-right:6px;caret-color:var(--vscode-foreground);min-width:0;}
  .nf input::selection{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);}
  .nf input:disabled{opacity:.4;cursor:not-allowed;}
  .nf-suf{flex:0 0 auto;padding-right:6px;color:var(--vscode-badge-background);user-select:none;}
  /* custom select */
  .sf{height:24px;min-width:0;width:100%;display:flex;align-items:center;justify-content:space-between;gap:4px;padding:0 6px;border-radius:6px;background:var(--vscode-textCodeBlock-background);border:1px solid transparent;color:var(--vscode-foreground);font-size:11px;cursor:pointer;font-family:inherit;}
  .sf:hover{background:var(--vscode-list-hoverBackground);}
  .sf.open,.sf:focus{border-color:var(--vscode-focusBorder);background:var(--vscode-list-hoverBackground);outline:none;}
  .sf-label{flex:1;min-width:0;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .sf-caret{flex:0 0 auto;color:var(--vscode-badge-background);display:flex;transition:transform .15s;}
  .sf.open .sf-caret{transform:rotate(180deg);}
  .sf-menu{position:fixed;z-index:2147483647;background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:6px;padding:2px;box-shadow:0 8px 30px rgba(0,0,0,.5);max-height:224px;overflow-y:auto;overflow-x:hidden;scrollbar-width:none;-ms-overflow-style:none;}
  .sf-menu::-webkit-scrollbar{width:0;height:0;display:none;}
  .sf-opt{position:relative;display:flex;align-items:center;height:24px;width:100%;border:none;background:transparent;color:var(--vscode-foreground);font-size:11px;text-align:left;padding:0 8px 0 24px;cursor:pointer;border-radius:4px;font-family:inherit;}
  .sf-opt:hover{background:var(--vscode-list-hoverBackground);}
  .sf-opt.sel{font-weight:700;color:var(--vscode-foreground);}
  .sf-check{position:absolute;left:6px;color:var(--vscode-foreground);display:flex;}
  /* segmented control */
  .seg{display:flex;width:100%;align-items:center;gap:2px;border-radius:6px;background:var(--vscode-textCodeBlock-background);padding:2px;}
  .seg:hover{background:var(--vscode-list-hoverBackground);}
  .seg button{flex:1;height:20px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--vscode-badge-background);cursor:pointer;border-radius:4px;padding:0;min-width:0;}
  .seg button:hover{color:var(--vscode-foreground);}
  .seg button.sel{background:var(--vscode-button-secondaryBackground);color:var(--vscode-foreground);}
  /* color row */
  .cr{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:start;padding:2px 0;}
  .cr-field{height:24px;min-width:0;display:flex;align-items:center;border-radius:6px;background:var(--vscode-textCodeBlock-background);border:1px solid transparent;overflow:hidden;font-size:11px;}
  .cr-field:hover{background:var(--vscode-list-hoverBackground);}
  .cr-field:focus-within{border-color:var(--vscode-focusBorder);background:var(--vscode-list-hoverBackground);}
  .cr-swatch{width:16px;height:16px;flex:0 0 16px;margin-left:4px;position:relative;border-radius:3px;border:none;cursor:pointer;padding:0;
    background-image:linear-gradient(45deg,var(--vscode-list-hoverBackground) 25%,transparent 25%),linear-gradient(-45deg,var(--vscode-list-hoverBackground) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,var(--vscode-list-hoverBackground) 75%),linear-gradient(-45deg,transparent 75%,var(--vscode-list-hoverBackground) 75%);
    background-size:8px 8px;background-position:0 0,0 4px,4px -4px,-4px 0;background-color:var(--vscode-panel-border);}
  .cr-swatch i{position:absolute;inset:0;display:block;border-radius:2px;}
  .cr-swatch input[type=color]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;border:none;padding:0;}
  .cr-hex{flex:1;min-width:0;border:none;outline:none;background:transparent;color:var(--vscode-foreground);font-family:monospace;font-size:11px;padding:0 4px;min-width:0;}
  .cr-count{flex:0 0 auto;font-family:monospace;font-size:9px;color:var(--vscode-foreground);opacity:.75;background:var(--vscode-button-secondaryBackground);border-radius:4px;padding:0 5px;line-height:14px;}
  .cr-div{width:1px;height:16px;flex:0 0 1px;background:rgba(117,113,94,.45);}
  .cr-op{width:52px;flex:0 0 52px;border:none;border-radius:0;background:transparent !important;}
  .cr-rail{display:flex;gap:2px;flex:0 0 auto;}
  /* empty state */
  .dp-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 16px;text-align:center;gap:10px;}
  .dp-wordmark{font-size:16px;font-weight:800;letter-spacing:.3px;color:var(--vscode-foreground);}
  .dp-empty p{margin:0;font-size:11px;line-height:1.6;color:var(--vscode-badge-background);}
  .dp-hints{margin-top:14px;width:100%;display:flex;flex-direction:column;gap:5px;}
  .dp-kbdrow{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:2px 0;}
  .dp-kbdrow span{font-size:10.5px;color:var(--vscode-badge-background);}
  .kbd{border:1px solid var(--vscode-panel-border);background:var(--vscode-textCodeBlock-background);border-radius:4px;padding:2px 5px;font-family:monospace;font-size:8.5px;color:var(--vscode-badge-background);}

  /* Respect reduced motion */
  @media (prefers-reduced-motion: reduce){
    *, *::before, *::after{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important;}
  }
</style></head>
<body>
<div id="bugSection">
  <div id="bugHead">
    <h3><span class="rec-dot" id="recDot"></span>Debug Flows</h3>
    <span id="bugStats"></span>
      <div id="tabGroup" role="tablist" aria-label="Flow filter">
        <button class="tab-btn active" id="tabTasks" role="tab" aria-selected="true" title="Show task flows">Tasks</button>
        <button class="tab-btn" id="tabDesign" role="tab" aria-selected="false" title="Show design flows">Design</button>
      </div>
    </div>
  <div id="recBar">
    <span class="rec-dot" style="display:inline-block;"></span>
    <span id="recInfo"></span>
    <button class="mini" id="stopRecBtn" title="Finish &amp; save these steps as a path" style="display:inline-flex;align-items:center;gap:4px;"></button>
    <button class="mini subtle" id="cancelRecBtn" title="Discard this recording" style="display:inline-flex;align-items:center;justify-content:center;width:26px;padding:2px 0;"></button>
  </div>
  <div id="projList"></div>
  <div id="taskDetail"></div>
  <div id="designPanel"></div>
</div>
<div id="cards"></div>
<script>
  let vscode; try{ vscode = acquireVsCodeApi(); }catch(e){ vscode = { postMessage:()=>{}, getState:()=>null, setState:()=>{} }; }
  let history = [];
  let bug = null; // BugView from the host
  let openProjects = {}, openPaths = {}; // legacy expanded ids (kept for compat)
  let lastActivePid = null, vizSeq = 0;
  let activeTab = 'tasks';
  let drill = null; // {pid, id} — current chat drill-in or null for list
  let _prevDrillKey = null;
  let _prevTab = activeTab;
  // ---- Design tab (property editor) state ----
  let dsel = null;          // {ecbId, tag, selector, styles}
  let dUndo = [], dRedo = [];
  function drillKey(){ return drill ? drill.pid+'::'+drill.id : null; }
  function triggerListAnim(){
    const list = $('projList');
    if(!list) return;
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    list.classList.remove('anim-in');
    void list.offsetWidth;
    list.classList.add('anim-in');
    const items = list.querySelectorAll('.chat-item');
    items.forEach((el,i)=>{
      el.classList.remove('entering');
      el.style.animationDelay = (Math.min(i, 8) * 28) + 'ms';
      void el.offsetWidth;
      el.classList.add('entering');
    });
    const heads = list.querySelectorAll('.chat-group-head');
    heads.forEach((h,i)=>{ h.style.animationDelay = (i*40)+'ms'; });
    setTimeout(()=>{ items.forEach(el=>{ el.style.animationDelay=''; }); }, 600);
  }
  function triggerDetailRows(){
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const detail = $('taskDetail');
    if(!detail) return;
    const rows = detail.querySelectorAll('.flow-row');
    rows.forEach((el,i)=>{
      el.classList.remove('entering');
      el.style.animationDelay = (i * 36) + 'ms';
      void el.offsetWidth;
      el.classList.add('entering');
    });
    setTimeout(()=>{ rows.forEach(el=> el.style.animationDelay=''); }, 700);
  }
  const $ = id => document.getElementById(id);
  function setActiveTab(tab){
    const was = activeTab;
    activeTab = tab;
    _prevTab = was;
    document.body.classList.toggle('design-mode', tab==='design');
    document.querySelectorAll('.tab-btn').forEach(b=>{
      const on = (b.id==='tabTasks' && tab==='tasks') || (b.id==='tabDesign' && tab==='design');
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    drill = null;
    const dp = $('designPanel');
    if(tab==='design'){
      if(dp) dp.style.display='flex';
      const list = $('projList'); if(list) list.style.display='none';
      const detail = $('taskDetail');
      if(detail){ detail.style.display='none'; detail.classList.remove('open','anim-enter','anim-leave'); detail.innerHTML=''; }
      renderDesign();
      return;
    }
    if(dp) dp.style.display='none';
    // small tab switch nudge — list will animate on next render
    const list = $('projList');
    if(list && !drill){
      list.classList.remove('anim-in');
      void list.offsetWidth;
      // allow renderBug to add anim-in after rebuilding
    }
    if(bug) renderBug();
    else triggerListAnim();
  }

  // Restore expansion state after a webview teardown/recreation.
  (function restore(){
    try{
      const saved = vscode.getState ? vscode.getState() : null;
      if(saved && saved.bugUi){
        openProjects = saved.bugUi.projects || {};
        openPaths = saved.bugUi.paths || {};
        if(saved.bugUi.drill) drill = saved.bugUi.drill;
        if(saved.bugUi.activeTab) activeTab = saved.bugUi.activeTab;
      }
    }catch(e){}
    try{
      document.querySelectorAll('.tab-btn').forEach(b=>{
        const on = (b.id==='tabTasks' && activeTab==='tasks') || (b.id==='tabDesign' && activeTab==='design');
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
      });
    }catch(e){}
  })();
  function saveBugUi(){
    try{ vscode.setState({ bugUi:{ projects: openProjects, paths: openPaths, drill: drill, activeTab: activeTab } }); }catch(e){}
  }

  function timeAgo(ts){
    const d = Date.now() - (Number(ts)||0);
    if(d < 60e3) return 'just now';
    if(d < 3600e3) return Math.floor(d/60e3) + 'm';
    if(d < 86400e3) return Math.floor(d/3600e3) + 'h';
    if(d < 7*86400e3) return Math.floor(d/86400e3) + 'd';
    return new Date(ts).toLocaleDateString();
  }
  // Init empty + start icons (open-source Lucide, rounded via Nunito)
  // ---- Open-source SVG icons (Lucide MIT, inlined) + CDN fallback above ----
  const ICON_PATHS = {
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-up': '<path d="m18 15-6-6-6 6"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
  };
  function svgIcon(name, size){
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.setAttribute('width', String(size||14));
    svg.setAttribute('height', String(size||14));
    svg.setAttribute('fill','none');
    svg.setAttribute('stroke','currentColor');
    svg.setAttribute('stroke-width','2');
    svg.setAttribute('stroke-linecap','round');
    svg.setAttribute('stroke-linejoin','round');
    svg.classList.add('icon-svg');
    if(size<=12) svg.classList.add('sm');
    if(size>=16) svg.classList.add('lg');
    svg.innerHTML = ICON_PATHS[name] || ICON_PATHS.copy;
    return svg;
  }
  function iconBtn(icon, title, fn){
    const b = document.createElement('button');
    b.className = 'act'; b.title = title;
    b.appendChild(svgIcon(icon, 14));
    b.setAttribute('aria-label', title);
    b.onclick = ev => { ev.stopPropagation(); fn(ev); };
    return b;
  }
  // Inject static empty / start icons (rounded Nunito + Lucide CDN + inline fallback)
  (function initStaticIcons(){
    const sr = document.getElementById('stopRecBtn');
    if(sr){
      sr.textContent='';
      sr.appendChild(svgIcon('check', 12));
      sr.appendChild(document.createTextNode(' Finish'));
    }
    const cr = document.getElementById('cancelRecBtn');
    if(cr){
      cr.textContent='';
      cr.appendChild(svgIcon('x', 12));
    }
    try{ if(window.lucide) window.lucide.createIcons(); }catch(e){}
  })();

  // ================= Workflow visualization =================
  // Vertical node graph: numbered cards connected by S-curved arrows.
  function escSvg(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function workflowSvg(steps, W){
    if(!steps || !steps.length) return '<div class="viz-empty">No steps recorded.</div>';
    const padT = 18, nodeH = 46, gap = 26, numR = 9, padL = 28, padR = 8;
    const nodeW = Math.max(120, W - padL - padR);
    const cx = padL + nodeW / 2;
    const H = steps.length * (nodeH + gap) - gap + padT * 2;
    const mid = 'vz' + (++vizSeq);
    let s = '<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">';
    s += '<defs><marker id="'+mid+'" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">' +
         '<path d="M0,0 L6,3.5 L0,7 Z" fill="#75715E"/></marker></defs>';
    steps.forEach((st, i) => {
      const y = padT + i * (nodeH + gap);
      const cy = y + nodeH / 2;
      if(i > 0){
        const py = padT + (i - 1) * (nodeH + gap) + nodeH;
        const my = (py + y) / 2;
        s += '<path d="M '+cx+' '+(py+2)+' C '+(cx+20)+' '+my+', '+(cx-20)+' '+my+', '+cx+' '+(y-5)+'"' +
             ' stroke="#75715E" stroke-width="1.6" fill="none" marker-end="url(#'+mid+')"/>';
      }
      s += '<circle cx="'+(numR+2)+'" cy="'+cy+'" r="'+numR+'" fill="#75715E"/>' +
           '<text x="'+(numR+2)+'" y="'+(cy+3.5)+'" text-anchor="middle" font-size="10" font-weight="700" fill="#F8F8F2">'+(i+1)+'</text>';
      s += '<rect x="'+padL+'" y="'+y+'" rx="0" width="'+nodeW+'" height="'+nodeH+'" fill="#414339" stroke="#75715E" stroke-width="1"/>';
      const label = '<'+st.tag+'>'+ (st.id ? '#'+String(st.id).slice(0,12) : '');
      s += '<text x="'+(padL+12)+'" y="'+(y+19)+'" font-size="11" font-family="monospace" fill="#F8F8F2">'+escSvg(label)+'</text>';
      const note = st.note ? (String(st.note).length > 40 ? String(st.note).slice(0,39)+'…' : st.note) : '(no note)';
      s += '<text x="'+(padL+12)+'" y="'+(y+35)+'" font-size="10" fill="#75715E" font-style="italic">'+escSvg(note)+'</text>';
    });
    return s + '</svg>';
  }

  // ================= Render: projects & paths =================
  function buildPathRow(p, pt){
    const isOpen = !!openPaths[pt.id];
    const wrap = document.createElement('div');
    wrap.className = 'path' + (isOpen ? ' open' : '');

    const head = document.createElement('div'); head.className = 'path-head';
    const chev = document.createElement('span'); chev.className = 'chev path-chev';
    chev.appendChild(svgIcon('chevron-right', 12));
    const kind = document.createElement('span');
    kind.className = 'kind-chip ' + (pt.kind === 'task' ? 'kind-task' : 'kind-bug');
    kind.textContent = pt.kind === 'task' ? 'TASK' : 'BUG';
    kind.title = pt.kind === 'task' ? 'Task flow' : 'Bug reproduction';
    const title = document.createElement('span'); title.className = 'path-title';
    title.textContent = pt.title; title.title = pt.title;
    const meta = document.createElement('span'); meta.className = 'path-meta';
    meta.textContent = pt.steps.length + (pt.steps.length===1?' step':' steps') + ' · ' + timeAgo(pt.createdAt);
    const acts = document.createElement('div'); acts.className = 'row-actions';
    acts.appendChild(iconBtn('copy','Copy report (markdown)', () => vscode.postMessage({type:'copyPath', pid:p.id, id:pt.id})));
    acts.appendChild(iconBtn('download','Save report as .md', () => vscode.postMessage({type:'exportPath', pid:p.id, id:pt.id})));
    acts.appendChild(iconBtn('trash','Delete path', () => vscode.postMessage({type:'deletePath', pid:p.id, id:pt.id})));
    head.appendChild(chev); head.appendChild(kind); head.appendChild(title); head.appendChild(meta); head.appendChild(acts);
    head.onclick = () => { openPaths[pt.id] = !openPaths[pt.id]; saveBugUi(); renderBug(); };
    wrap.appendChild(head);

    if(isOpen){
      const viz = document.createElement('div'); viz.className = 'viz';
      wrap.appendChild(viz);
      // Measure once the row is in the DOM, then draw the diagram at full width.
      requestAnimationFrame(() => { viz.innerHTML = workflowSvg(pt.steps, viz.clientWidth || 250); });
    }
    return wrap;
  }

  function chatGroupLabel(ts){
    const d = Date.now() - (Number(ts)||0);
    if(d < 86400e3) return 'Today';
    if(d < 86400e3*2) return 'Yesterday';
    if(d < 86400e3*7) return 'Last 7 days';
    if(d < 86400e3*30) return 'Last 30 days';
    return 'Older';
  }
  function isValidDrill(){
    if(!drill || !bug || !bug.projects) return false;
    const pr = bug.projects.find(x=> x.id===drill.pid);
    if(!pr) return false;
    return !!pr.paths.find(x=> x.id===drill.id);
  }
  function getAllFiltered(){
    const out = [];
    (bug.projects||[]).forEach(p=>{
      const filtered = p.paths.filter(pt=> activeTab==='tasks' ? pt.kind==='task' : pt.kind!=='task');
      filtered.forEach(pt=> out.push({p, pt}));
    });
    out.sort((a,b)=> (b.pt.createdAt||0)-(a.pt.createdAt||0));
    return out;
  }
  function renderChatList(){
    const list = $('projList');
    const all = getAllFiltered();
    list.innerHTML = '';
    list.className = 'chat-list';
    if(!all.length){
      const hint = document.createElement('div'); hint.className='path-hint';
      hint.style.padding='18px 14px'; hint.style.textAlign='center'; hint.style.lineHeight='1.5';
      hint.textContent = activeTab==='tasks' ? 'No task flows yet — press the record button, choose Task, then Finish.' : 'No design flows yet — press the record button, choose Design, then Finish.';
      list.appendChild(hint);
      return;
    }
    let curGroup = null;
    all.forEach(({p, pt})=>{
      const g = chatGroupLabel(pt.createdAt);
      if(g !== curGroup){
        curGroup = g;
        const head = document.createElement('div'); head.className='chat-group-head';
        const cnt = all.filter(x=> chatGroupLabel(x.pt.createdAt)===g).length;
        head.innerHTML = '<span>'+g+'</span><span>'+cnt+'</span>';
        list.appendChild(head);
      }
      const item = document.createElement('div'); item.className='chat-item';
      const av = document.createElement('div'); av.className='chat-avatar'+(pt.kind==='task'?' task':'');
      av.textContent = pt.steps && pt.steps.length ? (pt.steps.length>9?'9+':String(pt.steps.length)) : '0';
      av.title = (pt.steps?pt.steps.length:0)+' steps';
      const body = document.createElement('div'); body.className='chat-body';
      const title = document.createElement('div'); title.className='chat-title'; title.textContent = pt.title || '(untitled)';
      title.title = pt.title||'';
      const sub = document.createElement('div'); sub.className='chat-sub';
      const firstTags = (pt.steps||[]).slice(0,2).map(s=> '<'+s.tag+'>').join(' \u2192 ');
      const more = pt.steps && pt.steps.length>2 ? ' \u2026' : '';
      sub.textContent = p.name + ' \u00B7 ' + (pt.steps?pt.steps.length:0) + ' steps' + (firstTags ? ' \u00B7 '+firstTags+more : '');
      body.appendChild(title); body.appendChild(sub);
      const time = document.createElement('div'); time.className='chat-time'; time.textContent = timeAgo(pt.createdAt);
      const chev = document.createElement('span'); chev.className='chat-chev'; chev.appendChild(svgIcon('chevron-right', 14));
      item.appendChild(av); item.appendChild(body); item.appendChild(time); item.appendChild(chev);
      item.title = 'Click to open chat';
      item.onclick = ()=>{ drill={pid:p.id, id:pt.id}; saveBugUi(); renderBug(); };
      list.appendChild(item);
    });
    // staggered open
    requestAnimationFrame(()=> triggerListAnim());
  }
  function renderTaskDetail(){
    const detail = $('taskDetail'); detail.innerHTML='';
    if(!drill || !bug) return;
    const pr = bug.projects.find(x=> x.id===drill.pid);
    if(!pr){ drill=null; saveBugUi(); renderBug(); return; }
    const pt = pr.paths.find(x=> x.id===drill.id);
    if(!pt){ drill=null; saveBugUi(); renderBug(); return; }
    const head = document.createElement('div'); head.className='detail-head';
    const back = document.createElement('button'); back.className='back-btn'; back.title='Back to list';
    back.appendChild(svgIcon('chevron-left', 14));
    back.appendChild(document.createTextNode(' Back'));
    back.onclick=()=>{ drill=null; saveBugUi(); renderBug(); };
    const tWrap = document.createElement('div'); tWrap.className='detail-title';
    const b = document.createElement('b'); b.textContent = pt.title || '(untitled)';
    const sp = document.createElement('span'); sp.textContent = pr.name + ' \u00B7 ' + (pt.kind==='task'?'TASK':'DESIGN') + ' \u00B7 ' + timeAgo(pt.createdAt);
    tWrap.appendChild(b); tWrap.appendChild(sp);
    const kind = document.createElement('span'); kind.className='kind-chip '+(pt.kind==='task'?'kind-task':'kind-bug'); kind.textContent = pt.kind==='task'?'TASK':'BUG';
    const acts = document.createElement('div'); acts.className='row-actions'; acts.style.visibility='visible'; acts.style.display='flex'; acts.style.gap='2px';
    acts.appendChild(iconBtn('copy','Copy report (markdown)',()=> vscode.postMessage({type:'copyPath', pid:pr.id, id:pt.id})));
    acts.appendChild(iconBtn('download','Save report as .md',()=> vscode.postMessage({type:'exportPath', pid:pr.id, id:pt.id})));
    acts.appendChild(iconBtn('trash','Delete path',()=> { vscode.postMessage({type:'deletePath', pid:pr.id, id:pt.id}); drill=null; saveBugUi(); }));
    head.appendChild(back); head.appendChild(tWrap); head.appendChild(kind); head.appendChild(acts);
    detail.appendChild(head);
    const thread = document.createElement('div'); thread.className='chat-thread';
    if(!pt.steps || !pt.steps.length){
      const emp = document.createElement('div'); emp.className='viz-empty'; emp.textContent='No steps recorded.';
      thread.appendChild(emp);
    } else {
      pt.steps.forEach((st,i)=>{
        const row = document.createElement('div'); row.className='flow-row';
        const num = document.createElement('span'); num.className='flow-num'; num.textContent=String(i+1);
        const txt = document.createElement('span'); txt.className='flow-text';
        const note = st.note ? String(st.note).trim() : '';
        const tagLabel = '<'+ st.tag + '>' + (st.id ? '#'+String(st.id).slice(0,14) : '');
        if(note){
          txt.textContent = note;
          const sm = document.createElement('small');
          sm.textContent = tagLabel;
          txt.appendChild(sm);
        } else {
          const base = st.text ? String(st.text).slice(0,28) : tagLabel;
          txt.textContent = base || tagLabel;
        }
        txt.title = (note ? note + ' — ' : '') + tagLabel + (st.cssSelector ? ' · ' + st.cssSelector : '');
        const acts = document.createElement('div'); acts.className='flow-actions';
        const copyBtn = document.createElement('button'); copyBtn.title='Copy selector';
        copyBtn.setAttribute('aria-label','Copy');
        copyBtn.appendChild(svgIcon('copy', 12));
        copyBtn.onclick = (ev)=>{ ev.stopPropagation(); vscode.postMessage({type:'copy', value: st.cssSelector || st.xpath || st.outerHTML || tagLabel}); };
        const dropBtn = document.createElement('button'); dropBtn.title='Details';
        dropBtn.setAttribute('aria-label','Details');
        dropBtn.appendChild(svgIcon('chevron-down', 12));
        acts.appendChild(copyBtn); acts.appendChild(dropBtn);
        row.appendChild(num); row.appendChild(txt); row.appendChild(acts);
        const detail = document.createElement('div'); detail.className='flow-detail';
        detail.innerHTML = '<code>CSS: '+esc(st.cssSelector||'\u2014')+'</code><code>XPath: '+esc(st.xpath||'\u2014')+'</code>' + (st.outerHTML ? '<code>HTML: '+esc(String(st.outerHTML).slice(0,140))+'</code>' : '');
        dropBtn.onclick = (ev)=>{ ev.stopPropagation(); detail.classList.toggle('open'); };
        thread.appendChild(row);
        thread.appendChild(detail);
      });
    }
    detail.appendChild(thread);
    const vizWrap = document.createElement('div'); vizWrap.className='viz'; vizWrap.style.display='none'; vizWrap.style.margin='0 10px 6px';
    const foot = document.createElement('div'); foot.className='detail-foot';
    const vizBtn = document.createElement('button'); vizBtn.className='mini'; vizBtn.textContent='Show diagram';
    vizBtn.onclick=()=>{
      const show = vizWrap.style.display==='none';
      vizWrap.style.display = show ? 'block' : 'none';
      vizBtn.textContent = show ? 'Hide diagram' : 'Show diagram';
      if(show) vizWrap.innerHTML = workflowSvg(pt.steps, vizWrap.clientWidth || 280);
    };
    const copyBtn = document.createElement('button'); copyBtn.className='mini'; copyBtn.textContent='Copy report';
    copyBtn.onclick=()=> vscode.postMessage({type:'copyPath', pid:pr.id, id:pt.id});
    const saveBtnEl = document.createElement('button'); saveBtnEl.className='mini'; saveBtnEl.textContent='Save .md';
    saveBtnEl.onclick=()=> vscode.postMessage({type:'exportPath', pid:pr.id, id:pt.id});
    foot.appendChild(vizBtn); foot.appendChild(copyBtn); foot.appendChild(saveBtnEl);
    detail.appendChild(vizWrap);
    detail.appendChild(foot);
    requestAnimationFrame(()=> triggerDetailRows());
  }
  function renderBug(){
    const sec = $('bugSection');
    if(!bug){ sec.style.display = 'none'; return; }
    sec.style.display = ''; // CSS decides (flex column); never pin inline block
    const recDot = $('recDot'); if(recDot) recDot.style.display = bug.recordingActive ? 'inline-block' : 'none';
    let totalPaths = 0;
    bug.projects.forEach(p => { totalPaths += p.paths.length; });
    const statsEl = $('bugStats'); if(statsEl) statsEl.textContent = bug.projects.length
      ? bug.projects.length + (bug.projects.length===1?' project':' projects') + ' \u00B7 ' + totalPaths + (totalPaths===1?' path':' paths')
      : '';
    const rb = $('recBar');
    rb.style.display = bug.recordingActive ? 'flex' : 'none';
    if(bug.recordingActive){
      $('recInfo').textContent = 'REC \u00B7 ' + bug.recordingSteps + ' step' + (bug.recordingSteps===1?'':'s') +
        (bug.recordingProjectName ? ' \u00B7 ' + bug.recordingProjectName : '');
    }
    // Design tab owns the section body — flows stay hidden until Tasks is picked.
    if(activeTab==='design'){
      drill = null;
      sec.style.display = 'flex'; // editor owns the body — keep the column layout
      document.body.classList.add('design-mode');
      const list = $('projList'); if(list) list.style.display='none';
      const detail = $('taskDetail');
      if(detail){ detail.style.display='none'; detail.classList.remove('open','anim-enter','anim-leave'); detail.innerHTML=''; }
      _prevDrillKey = null;
      return;
    }
    const list = $('projList'); const detail = $('taskDetail');
    if(!list || !detail) return;
    if(drill && !isValidDrill()){ drill=null; saveBugUi(); }
    const curKey = drillKey();
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // leaving detail -> animate back
    if(!curKey && _prevDrillKey && !reduce){
      detail.classList.remove('anim-enter');
      detail.classList.add('anim-leave');
      setTimeout(()=>{
        detail.style.display='none';
        detail.classList.remove('open','anim-leave');
        detail.innerHTML='';
        list.style.display='flex';
        renderChatList();
        _prevDrillKey = curKey;
        _prevTab = activeTab;
      }, 150);
      return;
    }
    if(curKey){
      const isEntering = curKey !== _prevDrillKey;
      list.style.display='none';
      detail.style.display='flex';
      detail.classList.add('open');
      renderTaskDetail();
      if(isEntering && !reduce){
        detail.classList.remove('anim-leave');
        detail.classList.remove('anim-enter');
        void detail.offsetWidth;
        detail.classList.add('anim-enter');
        setTimeout(()=> detail.classList.remove('anim-enter'), 260);
      }
    } else {
      detail.style.display='none';
      detail.classList.remove('open','anim-enter','anim-leave');
      detail.innerHTML='';
      list.style.display='flex';
      renderChatList();
    }
    _prevDrillKey = curKey;
    _prevTab = activeTab;
  }

  // ================= Render: captured elements =================
  function render(){
    const countEl = $('count'); if(countEl) countEl.textContent = history.length ? history.length + ' captured' : '';
    const emptyEl = $('empty'); if(emptyEl) emptyEl.style.display = history.length ? 'none' : 'flex';
    const cards = $('cards'); cards.innerHTML = '';
    [...history].reverse().forEach((d) => {
      const card = document.createElement('div'); card.className = 'card';
      const row = document.createElement('div'); row.className = 'row';
      const tag = document.createElement('span'); tag.className = 'tag-badge'; tag.textContent = '<' + (d.tag||'?') + '>';
      const snip = document.createElement('span'); snip.className = 'snippet';
      snip.textContent = d.text ? '"' + d.text.slice(0,40) + '"' : (d.id ? '#'+d.id : d.cssSelector || '');
      snip.title = snip.textContent;
      const chev = document.createElement('span'); chev.className = 'chev'; chev.appendChild(svgIcon('chevron-right', 12));
      row.appendChild(tag); row.appendChild(snip); row.appendChild(chev);
      card.appendChild(row);

      const det = document.createElement('div'); det.className = 'detail';
      det.innerHTML =
        '<div class="kv"><b>URL</b><code>'+esc(d.url||'')+'</code></div>' +
        '<div class="kv"><b>ID</b>' + (d.id ? '<code>'+esc(d.id)+'</code>' : '<i style="opacity:.5">—</i>') + '</div>' +
        '<div class="kv"><b>CLASS</b>' + (d.className ? '<code>'+esc(d.className)+'</code>' : '<i style="opacity:.5">—</i>') + '</div>' +
        '<div class="kv"><b>XPATH</b><code>'+esc(d.xpath||'')+'</code></div>' +
        '<div class="kv"><b>CSS</b><code>'+esc(d.cssSelector||'')+'</code></div>' +
        (d.source ? '<div class="kv"><b>SOURCE</b><code>'+esc(d.source.file+':'+d.source.line)+'</code></div>' : '');
      const actions = document.createElement('div'); actions.className = 'actions';
      actions.innerHTML = '<button class="mini" data-a="context">Copy Full Context</button>' +
        '<button class="mini" data-a="xpath">Copy XPath</button>' +
        '<button class="mini" data-a="css">Copy CSS</button>' +
        '<button class="mini" data-a="html">Copy HTML</button>' +
        '<button class="mini" data-a="details">Details…</button>';
      actions.querySelectorAll('.mini').forEach(btn => {
        btn.onclick = function(ev){
          ev.stopPropagation();
          const a = btn.getAttribute('data-a');
          if(a === 'context') vscode.postMessage({type:'copy', value:d.contextText || d.outerHTML || ''});
          else if(a === 'xpath') vscode.postMessage({type:'copy', value:d.xpath||''});
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
    if(m && m.type === 'designTarget'){
      // finishing a session (cleared) or switching elements commits the
      // accumulated style edits as a Task in the flows store.
      if(dPendingEdits.length && (!m.data || !dsel || dsel.ecbId !== m.data.ecbId)) flushPendingEdits();
      dsel = m.data ? {
        ecbId: m.data.ecbId || null,
        tag: m.data.tag || '',
        selector: m.data.selector || '',
        styles: m.data.styles || {}
      } : null;
      dSelMeta = m.data ? { ecbId: m.data.ecbId || null, tag: m.data.tag, selector: m.data.selector } : null;
      dUndo.length = 0; dRedo.length = 0;
      dIndepCorners = false; dStrokeOpen = false; dBgHidden = false; dTxtHidden = false;
      dEffType = 'drop'; dEffHidden = false;
      if(activeTab==='design') designRerender();
    }
    if(m && m.type === 'bug'){
      bug = m.data || { projects:[], activeProjectId:null, recordingActive:false, recordingSteps:0, recordingProjectName:null };
      if(bug.activeProjectId && (!lastActivePid || lastActivePid !== bug.activeProjectId)){
        openProjects[bug.activeProjectId] = true;
      }
      if(bug.recordingActive && bug.activeProjectId){ openProjects[bug.activeProjectId] = true; }
      lastActivePid = bug.activeProjectId;
      saveBugUi();
      renderBug();
    }
  });
  const clearBtn = $('clearBtn'); if(clearBtn) clearBtn.onclick = () => { try{ vscode.postMessage({type:'clearHistory'});}catch(e){ history=[]; render(); } };
  const startBtn = $('startBtn'); if(startBtn) startBtn.onclick = () => { try{ vscode.postMessage({type:'start'});}catch(e){} };
  const _tabTasks = $('tabTasks'); if(_tabTasks) _tabTasks.onclick = () => setActiveTab('tasks');
  const _tabDesign = $('tabDesign'); if(_tabDesign) _tabDesign.onclick = () => setActiveTab('design');
  const _newProjBtn = $('newProjBtn'); if(_newProjBtn) _newProjBtn.onclick = () => {
    try{ vscode.postMessage({type:'newProject'}); }catch(e){}
    if(!bug || !bug.projects || bug.projects.length===0){
      const demoId = 'demo-'+Date.now();
      const taskId = demoId+'-p-task';
      const designId = demoId+'-p-design';
      bug = {
        projects:[{
          id: demoId,
          name: 'Demo Project',
          paths: [
            { id: taskId, title: 'Checkout task', kind: 'task', createdAt: Date.now(), steps: [
              {tag:'button', id:'startBtn', note:'Tapped Start', cssSelector:'#startBtn', xpath:'//*[@id="startBtn"]', outerHTML:'<button id="startBtn">\u25B6 Start Inspecting</button>'},
              {tag:'div', id:'empty', note:'Confirmed empty state', cssSelector:'div#empty', xpath:'//div[@id="empty"]', outerHTML:'<div id="empty">No elements captured yet.</div>'}
            ]},
            { id: designId, title: 'Landing design', kind: 'bug', createdAt: Date.now()-86400e3, steps: [
              {tag:'header', id:'', note:'Opened header', cssSelector:'header', xpath:'//header', outerHTML:'<header>Demo header</header>'},
              {tag:'section', id:'hero', note:'Checked hero layout', cssSelector:'section#hero', xpath:'//*[@id="hero"]', outerHTML:'<section id="hero">Hero</section>'}
            ]}
          ]
        }],
        activeProjectId: demoId,
        recordingActive:false,
        recordingSteps:0,
        recordingProjectName:'Demo Project'
      };
      openProjects[demoId]=true;
      openPaths[taskId]=true;
      openPaths[designId]=true;
      try{ saveBugUi(); }catch(e){}
      renderBug();
      history = [
        {tag:'button', id:'startBtn', className:'', text:'Start Inspecting', xpath:'//*[@id="startBtn"]', cssSelector:'#startBtn', outerHTML:'<button id="startBtn"> Start Inspecting</button>', url: location.href, timestamp: Date.now()},
        {tag:'div', id:'empty', className:'', text:'No elements captured yet.', xpath:'//div[@id="empty"]', cssSelector:'div#empty', outerHTML:'<div id="empty">...</div>', url: location.href, timestamp: Date.now()}
      ];
      render();
    }
  };
  $('stopRecBtn').onclick = () => { try{ vscode.postMessage({type:'stopRec'});}catch(e){} };
  $('cancelRecBtn').onclick = () => { try{ vscode.postMessage({type:'cancelRec'});}catch(e){} };
  // Seed demo data for standalone file:// preview so Tasks/Design filtering is visible without host
  (function(){
    try{
      if(bug && bug.projects && bug.projects.length) return;
      const isStandalone = location.protocol==='file:' || !location.hostname;
      // allow manual trigger via ?demo=1 as well
      const wantDemo = isStandalone || location.search.includes('demo');
      if(!wantDemo) return;
      const demoId='demo-'+Date.now();
      const taskId=demoId+'-p-task';
      const designId=demoId+'-p-design';
      bug={
        projects:[{id:demoId,name:'Demo Project',paths:[
          {id:taskId,title:'Checkout task',kind:'task',createdAt:Date.now(),steps:[{tag:'button',id:'startBtn',note:'Tapped Start',cssSelector:'#startBtn',xpath:'//*[@id="startBtn"]',outerHTML:'<button id="startBtn"> Start Inspecting</button>'},{tag:'div',id:'empty',note:'Confirmed empty state',cssSelector:'div#empty',xpath:'//div[@id="empty"]',outerHTML:'<div id="empty">...</div>'}]},
          {id:designId,title:'Landing design',kind:'bug',createdAt:Date.now()-86400e3,steps:[{tag:'header',id:'',note:'Opened header',cssSelector:'header',xpath:'//header',outerHTML:'<header>Demo header</header>'},{tag:'section',id:'hero',note:'Checked hero layout',cssSelector:'section#hero',xpath:'//*[@id="hero"]',outerHTML:'<section id="hero">Hero</section>'}]}
        ]}],
        activeProjectId:demoId,recordingActive:false,recordingSteps:0,recordingProjectName:'Demo Project'
      };
      openProjects[demoId]=true; openPaths[taskId]=true; openPaths[designId]=true;
      try{ saveBugUi(); }catch(e){}
      renderBug();
      history=[
        {tag:'button',id:'startBtn',className:'',text:'Start Inspecting',xpath:'//*[@id="startBtn"]',cssSelector:'#startBtn',outerHTML:'<button id="startBtn"> Start Inspecting</button>',url:location.href,timestamp:Date.now()},
        {tag:'div',id:'empty',className:'',text:'No elements captured yet.',xpath:'//div[@id="empty"]',cssSelector:'div#empty',outerHTML:'<div id="empty">...</div>',url:location.href,timestamp:Date.now()}
      ];
      render();
      // keep Tasks active by default for demo
      setActiveTab('tasks');
    }catch(e){}
  })();
  // ================= Design tab: property editor (klone PropertiesSidebar port) =================
  var dIndepCorners=false, dStrokeOpen=false, dBgHidden=false, dTxtHidden=false;
  var dEffType='drop', dEffHidden=false;
  // Style-edit session: edits accumulate here and are committed as a Task when
  // the user finishes editing (deselect via Esc / Done / clicking outside).
  var dPendingEdits=[], dSelMeta=null;
  function flushPendingEdits(){
    if(!dPendingEdits.length||!dSelMeta||!dSelMeta.ecbId){ dPendingEdits.length=0; return; }
    vscode.postMessage({type:'commitEdits', ecbId:dSelMeta.ecbId, edits:dPendingEdits.slice()});
    dPendingEdits.length=0;
  }
  function requestDeselect(){
    if(dPendingEdits.length) flushPendingEdits();
    vscode.postMessage({type:'designDeselect'});
  }
  var FONT_FAMILIES=[
    {value:'Inter',label:'Inter'},
    {value:'Arial, sans-serif',label:'Arial'},
    {value:'Georgia, serif',label:'Georgia'},
    {value:"'Times New Roman', serif",label:'Times New Roman'},
    {value:"'Courier New', monospace",label:'Courier New'},
    {value:'Verdana, sans-serif',label:'Verdana'},
    {value:"'Trebuchet MS', sans-serif",label:'Trebuchet MS'},
    {value:'Impact, sans-serif',label:'Impact'}
  ];
  var FONT_WEIGHTS=[{value:'400',label:'Regular'},{value:'500',label:'Medium'},{value:'600',label:'Semibold'},{value:'700',label:'Bold'}];
  var BLEND_OPTIONS=[
    {value:'normal',label:'Normal'},{value:'multiply',label:'Multiply'},{value:'screen',label:'Screen'},
    {value:'overlay',label:'Overlay'},{value:'darken',label:'Darken'},{value:'lighten',label:'Lighten'},
    {value:'color-dodge',label:'Color Dodge'},{value:'color-burn',label:'Color Burn'},{value:'hard-light',label:'Hard Light'},
    {value:'soft-light',label:'Soft Light'},{value:'difference',label:'Difference'},{value:'exclusion',label:'Exclusion'},
    {value:'hue',label:'Hue'},{value:'saturation',label:'Saturation'},{value:'color',label:'Color'},{value:'luminosity',label:'Luminosity'}
  ];
  var DP_ICONS={
    done:'<path d="M20 6 9 17l-5-5"/>',
    undo:'<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
    redo:'<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 15-6.7L21 13"/>',
    eye:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff:'<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',
    plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus:'<path d="M5 12h14"/>',
    rotateCw:'<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    flipH:'<path d="M18 3l4 4-4 4"/><path d="M6 21l-4-4 4-4"/><path d="M22 7H8"/><path d="M2 17h14"/>',
    flipV:'<path d="m3 6 4 4 4-4"/><path d="m13 18 4-4 4 4"/><line x1="2" y1="12" x2="22" y2="12"/>',
    bold:'<path d="M6 4h8a4 4 0 0 1 0 8H6z"/><path d="M6 12h9a4 4 0 0 1 0 8H6z"/>',
    italic:'<line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>',
    underline:'<path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" y1="20" x2="20" y2="20"/>',
    strike:'<path d="M16 4H9a3 3 0 0 0-.5 5.96"/><path d="M6.5 15A3.5 3.5 0 0 0 10 20h4a3.5 3.5 0 0 0 .5-6.96"/><line x1="4" y1="12" x2="20" y2="12"/>',
    alignLeft:'<line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/>',
    alignCenter:'<line x1="21" y1="6" x2="3" y2="6"/><line x1="17" y1="12" x2="7" y2="12"/><line x1="19" y1="18" x2="5" y2="18"/>',
    alignRight:'<line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="9" y2="12"/><line x1="21" y1="18" x2="7" y2="18"/>',
    alignJustify:'<line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="3" y2="12"/><line x1="21" y1="18" x2="3" y2="18"/>',
    vTop:'<line x1="4" y1="3" x2="20" y2="3"/><rect x="6" y="8" width="12" height="5" rx="1"/><rect x="8" y="16" width="8" height="5" rx="1"/>',
    vMiddle:'<line x1="4" y1="12" x2="20" y2="12"/><rect x="6" y="4" width="12" height="5" rx="1"/><rect x="8" y="15" width="8" height="5" rx="1"/>',
    vBottom:'<line x1="4" y1="21" x2="20" y2="21"/><rect x="6" y="4" width="12" height="5" rx="1"/><rect x="8" y="12" width="8" height="5" rx="1"/>',
    baseline:'<path d="M4 20h16"/><path d="m6 16 6-12 6 12"/>',
    tracking:'<path d="M3 16 7 6l4 10"/><path d="M4.5 13h5"/><path d="m14 16 3-7 3 7"/><path d="M15 13.5h4"/>',
    radius:'<path d="M4 20v-5a9 9 0 0 1 9-9h7"/>',
    blend:'<circle cx="9" cy="9" r="6"/><circle cx="15" cy="15" r="6"/>',
    gridSides:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    hug:'<path d="M8 8l-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="M4 12h16"/>',
    wrapText:'<line x1="3" y1="6" x2="21" y2="6"/><path d="M3 12h13a3 3 0 1 1 0 6h-3"/><path d="m15 15-2 3 2 3"/><line x1="3" y1="18" x2="7" y2="18"/>',
    lock:'<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
  };
  // ---- color utils (ported from klone style-utils.ts) ----
  function isTransparentColor(c){ return !c || c==='transparent' || c==='rgba(0, 0, 0, 0)' || c==='rgba(0,0,0,0)'; }
  function parseRgbToHex(color){
    if(!color||color==='transparent'||color==='rgba(0, 0, 0, 0)') return '#000000';
    if(color.charAt(0)==='#') return color;
    var m=String(color).match(/(\\d+)/g);
    if(m&&m.length>=3){
      var r=parseInt(m[0]).toString(16); if(r.length<2) r='0'+r;
      var g=parseInt(m[1]).toString(16); if(g.length<2) g='0'+g;
      var b=parseInt(m[2]).toString(16); if(b.length<2) b='0'+b;
      return '#'+r+g+b;
    }
    return '#000000';
  }
  function parseColorAlpha(color){
    if(isTransparentColor(color)) return 0;
    if(!color) return 1;
    var m=String(color).match(/rgba?\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+\\s*(?:,\\s*([\\d.]+)\\s*)?\\)/);
    if(m){ return m[1]!==undefined ? Math.min(1,Math.max(0,parseFloat(m[1]))) : 1; }
    var h=String(color).replace('#','');
    if(/^[0-9a-fA-F]{8}$/.test(h)) return Math.min(1,Math.max(0,parseInt(h.slice(6,8),16)/255));
    return 1;
  }
  function withColorAlpha(color,alpha){
    var a=Math.min(1,Math.max(0,alpha));
    if(!color||isTransparentColor(color)||a<=0) return 'transparent';
    if(a>=1) return color;
    var hex=color.charAt(0)==='#'?color:parseRgbToHex(color);
    hex=hex.replace('#','');
    var parts=hex.match(/[0-9a-fA-F]{2}/g)||[];
    var r=parseInt(parts[0]||'0',16), g=parseInt(parts[1]||'0',16), b=parseInt(parts[2]||'0',16);
    return 'rgba('+r+', '+g+', '+b+', '+(Math.round(a*100)/100)+')';
  }
  function gradientFirstColor(bg){
    if(!bg||bg==='none'||bg==='initial') return null;
    var m=String(bg).match(/(#[0-9a-fA-F]{3,8}|rgba?\\([^)]*\\)|hsla?\\([^)]*\\))/);
    return m?m[0]:null;
  }
  function dcmp(t){
    var res={tx:0,ty:0,rot:0,sx:1,sy:1};
    if(!t||t==='none') return res;
    var tr=t.match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/);
    if(tr){ res.tx=parseFloat(tr[1])||0; res.ty=parseFloat(tr[2])||0; }
    var m=t.match(/matrix(?:3d)?\\(([^)]+)\\)/);
    if(m){
      var parts=m[1].split(',').map(function(p){return parseFloat(p);});
      if(parts.length>=6){
        var a,b,c,d;
        if(parts.length===16){ res.tx=parts[12]||res.tx; res.ty=parts[13]||res.ty; a=parts[0]; b=parts[1]; c=parts[4]; d=parts[5]; }
        else { res.tx=parts[4]||res.tx; res.ty=parts[5]||res.ty; a=parts[0]; b=parts[1]; c=parts[2]; d=parts[3]; }
        res.rot=Math.round(Math.atan2(b,a)*180/Math.PI);
        res.sx=Math.sqrt(a*a+b*b)||1; res.sy=Math.sqrt(c*c+d*d)||1;
        if((a*d-b*c)<0) res.sy=-res.sy;
      }
    }
    return res;
  }
  // ---- tiny DOM helpers ----
  function dEl(tag,cls,parent){ var e=document.createElement(tag); if(cls) e.className=cls; if(parent) parent.appendChild(e); return e; }
  function dpSvg(name,size){
    var s=document.createElement('span');
    s.style.cssText='display:flex;align-items:center;justify-content:center;line-height:0;pointer-events:none;';
    s.innerHTML='<svg width="'+(size||14)+'" height="'+(size||14)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+(DP_ICONS[name]||'')+'</svg>';
    return s;
  }
  function dpIconBtn(name,title,fn,accent,bordered){
    var b=dEl('button','dp-btn'+(accent?' on':'')+(accent&&bordered?' bordered':''));
    b.type='button'; b.title=title;
    b.appendChild(dpSvg(name,14));
    b.onclick=function(ev){ ev.stopPropagation(); fn(); };
    return b;
  }
  // ---- fields ----
  function nfField(o){
    var wrap=dEl('div','nf');
    if(o.prefix){ var p=dEl('span','nf-pre',wrap); p.textContent=o.prefix; }
    else if(o.icon){ var pi=dEl('span','nf-pre',wrap); pi.appendChild(dpSvg(o.icon,12)); }
    var input=document.createElement('input'); input.type='text'; input.inputMode='decimal'; input.spellcheck=false;
    input.value=(o.value==null?'':String(o.value));
    wrap.appendChild(input);
    if(o.suffix&&!o.disabled){ var sf=dEl('span','nf-suf',wrap); sf.textContent=o.suffix; }
    if(o.disabled) input.disabled=true;
    var committed=input.value;
    var clamp=function(n){ if(o.min!=null) n=Math.max(o.min,n); if(o.max!=null) n=Math.min(o.max,n); return n; };
    input.addEventListener('focus',function(){ input.select(); });
    input.addEventListener('input',function(){
      var v=input.value;
      if(v===''||v==='-'||/^\\d*\\.?\\d*$/.test(v)){ committed=v||'0'; o.onChange(v||'0'); }
    });
    input.addEventListener('blur',function(){
      var n=parseFloat(input.value); if(isNaN(n)) n=0; n=clamp(n);
      var v=String(n); input.value=v;
      if(v!==committed){ committed=v; o.onChange(v); }
    });
    input.addEventListener('keydown',function(e){
      e.stopPropagation();
      if(e.key==='Enter'){ input.blur(); }
      if(e.key==='ArrowUp'||e.key==='ArrowDown'){
        e.preventDefault();
        var cur=parseFloat(committed); if(isNaN(cur)) cur=0;
        var next=clamp(cur+(e.key==='ArrowUp'?1:-1)*(e.shiftKey?10:1));
        var v=String(next); input.value=v; committed=v; o.onChange(v);
      }
    });
    input.addEventListener('pointerdown',function(e){
      if(input.disabled||e.button!==0) return;
      e.preventDefault();
      var startX=e.clientX, base=parseFloat(committed); if(isNaN(base)) base=0; var moved=false;
      var onMove=function(ev){
        var dx=ev.clientX-startX;
        if(!moved&&Math.abs(dx)<3) return;
        moved=true;
        var stepSize=ev.shiftKey?10:1;
        var next=clamp(base+dx*stepSize);
        var v=String(Math.round(next*10)/10);
        input.value=v; committed=v; o.onChange(v);
      };
      var onUp=function(){ window.removeEventListener('pointermove',onMove); window.removeEventListener('pointerup',onUp); input.focus(); input.select(); };
      window.addEventListener('pointermove',onMove); window.addEventListener('pointerup',onUp);
    });
    return wrap;
  }
  var _menuCleanup=null;
  function closeAllMenus(){ if(_menuCleanup){ _menuCleanup(); } }
  function sfField(o){
    closeAllMenus();
    var btn=dEl('button','sf'); btn.type='button';
    var lab=dEl('span','sf-label',btn);
    var curOpt=null;
    for(var i=0;i<o.options.length;i++){ if(o.options[i].value===o.value){ curOpt=o.options[i]; break; } }
    lab.textContent=curOpt?(curOpt.label):(o.value||'\u2014');
    lab.title=lab.textContent;
    if(o.fontPreview&&o.value) btn.style.fontFamily=o.value;
    var car=dEl('span','sf-caret',btn);
    car.innerHTML='<svg width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    btn.onclick=function(ev){
      ev.stopPropagation();
      if(_menuCleanup){ closeAllMenus(); return; }
      var menu=dEl('div','sf-menu',document.body);
      var r=btn.getBoundingClientRect();
      var estH=Math.min(224,o.options.length*26+4);
      var top=r.bottom+4;
      if(window.innerHeight-r.bottom<estH+8&&r.top>estH+8) top=r.top-estH-4;
      menu.style.left=Math.max(8,Math.min(r.left,window.innerWidth-250))+'px';
      menu.style.top=top+'px';
      menu.style.minWidth=r.width+'px';
      o.options.forEach(function(op){
        var b=dEl('button','sf-opt'+(op.value===o.value?' sel':''),menu);
        b.type='button'; b.setAttribute('role','option');
        if(o.fontPreview) b.style.fontFamily=op.value;
        if(op.value===o.value){ var ck=dEl('span','sf-check',b); ck.appendChild(dpSvg('check',12)); }
        var sp=dEl('span','',b);
        sp.textContent=op.label;
        sp.style.cssText='flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        b.onclick=function(ev2){ ev2.stopPropagation(); closeAllMenus(); o.onChange(op.value); };
      });
      var onDoc=function(e){ if(!menu.contains(e.target)&&!btn.contains(e.target)) closeAllMenus(); };
      var onKey=function(e){ if(e.key==='Escape'){ e.stopPropagation(); closeAllMenus(); } };
      setTimeout(function(){ document.addEventListener('mousedown',onDoc,true); document.addEventListener('keydown',onKey,true); },0);
      btn.classList.add('open');
      _menuCleanup=function(){
        document.removeEventListener('mousedown',onDoc,true);
        document.removeEventListener('keydown',onKey,true);
        if(menu.parentNode) menu.parentNode.removeChild(menu);
        btn.classList.remove('open');
        _menuCleanup=null;
      };
    };
    return btn;
  }
  function segControl(o){
    var wrap=dEl('div','seg');
    o.options.forEach(function(op){
      var b=dEl('button',op.value===o.value?'sel':'',wrap);
      b.type='button'; b.title=op.label; b.appendChild(dpSvg(op.icon,14));
      b.onclick=function(ev){ ev.stopPropagation(); o.onChange(op.value); };
    });
    return wrap;
  }
  function labeled(label,control,parent){
    var w=dEl('div','',parent);
    dEl('div','dp-sub',w).textContent=label;
    w.appendChild(control);
    return w;
  }
  function colorRow(o){
    var row=dEl('div','cr');
    row.setAttribute('data-label',o.label||'');
    var fieldWrap=dEl('div','cr-field');
    var swatch=dEl('button','cr-swatch',fieldWrap);
    swatch.type='button'; swatch.title='Change '+o.label.toLowerCase()+' color';
    var swFill=dEl('i','',swatch);
    if(o.color){ swFill.style.background=o.color; swFill.style.opacity=String(o.opacity==null?1:o.opacity); }
    else swFill.style.border='1px solid rgba(248,248,242,.25)';
    var colorInput=document.createElement('input');
    colorInput.type='color';
    colorInput.value=/^#[0-9a-fA-F]{6}$/.test(o.color||'')?o.color:'#000000';
    colorInput.addEventListener('pointerdown',function(e){ e.stopPropagation(); });
    colorInput.addEventListener('input',function(){ o.onChange(colorInput.value); });
    swatch.appendChild(colorInput);
    var hex=dEl('input','cr-hex',fieldWrap);
    hex.type='text'; hex.maxLength=6; hex.spellcheck=false; hex.placeholder='transparent';
    hex.value=(o.color||'').replace('#','').toUpperCase();
    hex.addEventListener('focus',function(){ hex.select(); });
    hex.addEventListener('input',function(){
      var v=hex.value.replace(/[^0-9a-fA-F]/g,'').toUpperCase();
      hex.value=v;
      if(/^[0-9a-fA-F]{6}$/.test(v)) o.onChange('#'+v);
    });
    hex.addEventListener('blur',function(){
      if(!/^[0-9a-fA-F]{6}$/.test(hex.value)) hex.value=(o.color||'').replace('#','').toUpperCase();
    });
    hex.addEventListener('keydown',function(e){ e.stopPropagation(); if(e.key==='Enter') hex.blur(); });
    if(o.countBadge) dEl('span','cr-count',fieldWrap).textContent=o.countBadge;
    dEl('div','cr-div',fieldWrap);
    var op=nfField({suffix:'%',min:0,max:100,value:Math.round((o.opacity==null?0:o.opacity)*100),onChange:function(v){ o.onOpacity(Math.min(1,Math.max(0,(parseFloat(v)||0)/100))); }});
    op.classList.add('cr-op');
    fieldWrap.appendChild(op);
    row.appendChild(fieldWrap);
    var rail=dEl('div','cr-rail',row);
    if(o.onToggle){
      var eyeBtn=dEl('button','dp-btn'+(o.hidden?' on':''),rail);
      eyeBtn.type='button'; eyeBtn.title=o.hidden?'Show':'Hide';
      eyeBtn.appendChild(dpSvg(o.hidden?'eyeOff':'eye',14));
      eyeBtn.onclick=function(ev){ ev.stopPropagation(); o.hidden=!o.hidden; eyeBtn.classList.toggle('on',o.hidden); eyeBtn.title=o.hidden?'Show':'Hide'; eyeBtn.innerHTML=''; eyeBtn.appendChild(dpSvg(o.hidden?'eyeOff':'eye',14)); o.onToggle(); };
    }
    if(o.onRemove) rail.appendChild(dpIconBtn('minus','Remove',o.onRemove,false));
    return row;
  }
  // ---- apply / undo / redo ----
  function applyD(prop,value,x,y){
    if(!dsel) return;
    var entry={prop:prop,value:value,x:x,y:y,prev:null,prevX:0,prevY:0};
    var t=dcmp(dsel.styles.transform||'');
    if(prop==='transform'){ entry.prevX=t.tx; entry.prevY=t.ty; }
    else {
      if(prop==='rotate') entry.prev=String(t.rot);
      else if(prop==='scaleX') entry.prev=String(t.sx);
      else if(prop==='scaleY') entry.prev=String(t.sy);
      else entry.prev=(prop in dsel.styles)?dsel.styles[prop]:null;
    }
    dUndo.push(entry); if(dUndo.length>80) dUndo.shift();
    dRedo.length=0;
    if(prop!=='transform'&&prop!=='rotate'&&prop!=='scaleX'&&prop!=='scaleY') dsel.styles[prop]=value;
    // track for the Style-Edits task commit (collapse consecutive identical ops)
    var recVal = String(value);
    if(prop==='transform'&&x!==undefined) recVal='translate('+x+'px, '+y+'px)';
    else if(prop==='rotate') recVal=String(value)+'deg';
    else if(prop==='scaleX'||prop==='scaleY') recVal='scale('+value+') on '+(prop==='scaleX'?'X':'Y');
    var lastE=dPendingEdits[dPendingEdits.length-1];
    if(!lastE||lastE.prop!==prop||lastE.value!==recVal) dPendingEdits.push({prop:prop,value:recVal});
    vscode.postMessage({type:'designApply',prop:prop,value:value,x:x,y:y});
  }
  function undoD(){
    var e=dUndo.pop(); if(!e) return;
    dRedo.push(e);
    if(e.prop==='transform') vscode.postMessage({type:'designApply',prop:'transform',value:'',x:e.prevX,y:e.prevY});
    else vscode.postMessage({type:'designApply',prop:e.prop,value:(e.prev==null||e.prev==='')?'initial':String(e.prev)});
  }
  function redoD(){
    var e=dRedo.pop(); if(!e) return;
    dUndo.push(e);
    if(e.prop==='transform') vscode.postMessage({type:'designApply',prop:'transform',value:'',x:e.x,y:e.y});
    else vscode.postMessage({type:'designApply',prop:e.prop,value:e.value});
  }
  // ---- section builders ----
  function dpTitle(sec,text){
    var t=dEl('div','dp-title',sec);
    dEl('span','',t).textContent=text;
    return t;
  }
  function buildPosition(scroll,s){
    var sec=dEl('div','dp-sec',scroll);
    dpTitle(sec,'Position');
    var container=dsel.tag==='html'||dsel.tag==='body';
    var t=dcmp(s.transform||'');
    var fmt=function(n){ return String(Math.round(n*10)/10); };
    var g=dEl('div','dp-grid2',sec);
    g.appendChild(nfField({prefix:'X',disabled:container,value:fmt(t.tx),onChange:function(v){ applyD('transform','',parseFloat(v)||0,t.ty); }}));
    g.appendChild(nfField({prefix:'Y',disabled:container,value:fmt(t.ty),onChange:function(v){ applyD('transform','',t.tx,parseFloat(v)||0); }}));
    var g2=dEl('div','dp-grid2 dp-mt',sec);
    g2.appendChild(nfField({icon:'rotateCw',suffix:'\u00B0',min:-360,max:360,value:t.rot,onChange:function(v){ applyD('rotate',String(parseFloat(v)||0)); }}));
    var flipRow=dEl('div','dp-row',g2);
    flipRow.style.justifyContent='flex-end';
    flipRow.appendChild(dpIconBtn('flipH','Flip horizontal',function(){ applyD('scaleX',String(-dcmp(dsel.styles.transform||'').sx||1)); }));
    flipRow.appendChild(dpIconBtn('flipV','Flip vertical',function(){ applyD('scaleY',String(-dcmp(dsel.styles.transform||'').sy||1)); }));
    flipRow.appendChild(dpIconBtn('rotateCw','Rotate 90\u00B0',function(){
      var cur=dcmp(dsel.styles.transform||'').rot;
      applyD('rotate',String((cur+90)%360));
    }));
  }
  function buildLayout(scroll,s){
    var sec=dEl('div','dp-sec',scroll);
    dpTitle(sec,'Layout');
    var container=dsel.tag==='html'||dsel.tag==='body';
    var isText=['span','p','h1','h2','h3','h4','h5','h6','button','a','label','li'].indexOf(dsel.tag)>=0;
    dEl('div','dp-sub',sec).textContent='Dimensions';
    var g=dEl('div','dp-grid2',sec);
    var px=function(v){ return parseFloat(v)||0; };
    g.appendChild(nfField({prefix:'W',min:1,value:Math.round(px(s.width)),onChange:function(v){ applyD('width',(Math.max(1,px(v)))+'px'); }}));
    g.appendChild(nfField({prefix:'H',min:1,value:Math.round(px(s.height)),onChange:function(v){ applyD('height',(Math.max(1,px(v)))+'px'); }}));
    if(container){
      dEl('div','dp-sub dp-mt',sec).textContent='Constraints';
      var gc=dEl('div','dp-grid2',sec);
      gc.appendChild(nfField({prefix:'Min W',min:0,value:Math.round(px(s.minWidth)),onChange:function(v){ applyD('minWidth',(Math.max(0,px(v)))+'px'); }}));
      gc.appendChild(nfField({prefix:'Min H',min:0,value:Math.round(px(s.minHeight)),onChange:function(v){ applyD('minHeight',(Math.max(0,px(v)))+'px'); }}));
    }
    if(isText){
      dEl('div','dp-sub dp-mt',sec).textContent='Resizing';
      var seg=dEl('div','seg',sec);
      [
        {v:'hug',icon:'hug',title:'Hug contents'},
        {v:'fill',icon:'wrapText',title:'Fill container'},
        {v:'fixed',icon:'lock',title:'Fixed'}
      ].forEach(function(op){
        var b=dEl('button','',seg);
        b.type='button'; b.title=op.title; b.appendChild(dpSvg(op.icon,14));
        b.onclick=function(ev){
          ev.stopPropagation();
          [].forEach.call(seg.children,function(c){ c.classList.remove('sel'); });
          b.classList.add('sel');
          if(op.v==='hug') applyD('width','auto');
          else if(op.v==='fill') applyD('width','100%');
          else applyD('width',(Math.round(px(s.width))||200)+'px');
        };
      });
    }
  }
  function buildAppearance(scroll,s){
    var sec=dEl('div','dp-sec',scroll);
    var hidden=(s.visibility||'visible')==='hidden';
    var title=dpTitle(sec,'Appearance');
    title.appendChild(dpIconBtn(hidden?'eyeOff':'eye',hidden?'Show':'Hide',function(){
      applyD('visibility',hidden?'visible':'hidden');
    },hidden));
    labeled('Blend',sfField({
      value:(s.mixBlendMode||'normal').toLowerCase(),
      options:BLEND_OPTIONS,
      onChange:function(v){ applyD('mixBlendMode',v); }
    }),sec).style.marginBottom='12px';
    var opRow=dEl('div','dp-mt',sec);
    opRow.style.width='50%';
    opRow.appendChild(labeled('Opacity',nfField({
      icon:'blend',suffix:'%',min:0,max:100,
      value:Math.round(parseFloat(s.opacity||'1')*100),
      onChange:function(v){ applyD('opacity',String(Math.min(1,Math.max(0,(parseFloat(v)||0)/100)))); }
    })));
    var radGrid=dEl('div','dp-grid21 dp-mt',sec);
    radGrid.appendChild(labeled('Corner radius',nfField({
      icon:'radius',min:0,
      value:Math.round(parseFloat(s.borderRadius||'0'))||0,
      onChange:function(v){ applyD('borderRadius',(Math.max(0,parseFloat(v)||0))+'px'); }
    })));
    var indepBtn=dEl('div','',radGrid);
    indepBtn.style.cssText='display:flex;height:24px;align-items:center;justify-content:flex-end;';
    indepBtn.appendChild(dpIconBtn('radius','Independent corner radii',function(){
      dIndepCorners=!dIndepCorners;
      renderDesign();
    },dIndepCorners,true));
    if(dIndepCorners){
      var cg=dEl('div','dp-grid2 dp-mt',sec);
      [
        {k:'borderTopLeftRadius',p:'TL'},
        {k:'borderTopRightRadius',p:'TR'},
        {k:'borderBottomLeftRadius',p:'BL'},
        {k:'borderBottomRightRadius',p:'BR'}
      ].forEach(function(side){
        cg.appendChild(nfField({
          prefix:side.p,min:0,
          value:Math.round(parseFloat(s[side.k]||'0'))||0,
          onChange:function(v){ applyD(side.k,(Math.max(0,parseFloat(v)||0))+'px'); }
        }));
      });
    }
  }
  function buildStroke(scroll,s){
    var sec=dEl('div','dp-sec',scroll);
    var SIDES=['Top','Right','Bottom','Left'];
    var widths={};
    SIDES.forEach(function(sd){ widths[sd]=parseFloat(s['border'+sd+'Width']||'0')||0; });
    var maxW=Math.max(widths.Top,widths.Right,widths.Bottom,widths.Left);
    var active=SIDES.filter(function(sd){ return widths[sd]>0; });
    var hasStroke=active.length>0;
    var uniform=hasStroke&&widths.Top===widths.Right&&widths.Bottom===widths.Left&&widths.Top===widths.Bottom;
    if(hasStroke&&!uniform) dStrokeOpen=true;
    var dominant=active[0]||'Top';
    var rawColor=s['border'+dominant+'Color']||s.borderColor;
    var styleVal=s['border'+dominant+'Style']||'none';
    var hidden=hasStroke&&styleVal==='none';
    var color=isTransparentColor(rawColor)?'#000000':parseRgbToHex(rawColor);
    var opacity=isTransparentColor(rawColor)?1:parseColorAlpha(rawColor);
    var title=dpTitle(sec,'Stroke');
    if(hasStroke&&!uniform){
      var badge=dEl('span','dp-badge');
      badge.textContent=active.length+(active.length===1?' side':' sides');
      badge.title=active.join(' + ');
      title.insertBefore(badge,title.firstChild.nextSibling);
    }
    title.appendChild(dpIconBtn('plus','Add stroke',function(){
      applyD('borderWidth','1px');
      applyD('borderStyle','solid');
    }));
    if(hasStroke){
      var cw=dEl('div','dp-mt',sec);
      cw.appendChild(colorRow({
        label:'Color',color:color,opacity:opacity,hidden:hidden,
        onChange:function(c){
          var a=parseColorAlpha(c);
          applyD('borderColor',a<1?withColorAlpha(c,a):c);
        },
        onOpacity:function(a){ applyD('borderColor',withColorAlpha(color,a)); },
        onToggle:function(){ applyD('borderStyle',hidden?'solid':'none'); },
        onRemove:function(){ applyD('borderWidth','0px'); }
      }));
      var g=dEl('div','dp-grid21 dp-mt',sec);
      g.appendChild(labeled('Weight',nfField({
        prefix:'W',min:0,
        value:uniform?Math.round(widths.Top):Math.round(maxW),
        onChange:function(v){ applyD('borderWidth',(Math.max(0,parseFloat(v)||0))+'px'); }
      })));
      var tools=dEl('div','',g);
      tools.style.cssText='display:flex;height:24px;align-items:center;justify-content:flex-end;gap:2px;';
      tools.appendChild(dpIconBtn('gridSides','Independent sides',function(){
        dStrokeOpen=!dStrokeOpen;
        renderDesign();
      },dStrokeOpen,true));
      tools.appendChild(dpIconBtn('minus','Dashed border',function(){
        applyD('borderStyle',styleVal==='dashed'?'solid':'dashed');
      },styleVal==='dashed'));
      if(dStrokeOpen){
        var sg=dEl('div','dp-grid2 dp-mt',sec);
        SIDES.forEach(function(sd){
          sg.appendChild(nfField({
            prefix:sd.charAt(0),min:0,value:Math.round(widths[sd]),
            onChange:function(v){ applyD('border'+sd+'Width',(Math.max(0,parseFloat(v)||0))+'px'); }
          }));
        });
      }
    }
  }
  function buildFill(scroll,s){
    var sec=dEl('div','dp-sec',scroll);
    var visibleBg=gradientFirstColor(s.backgroundImage)||s.backgroundColor;
    var bgColor=isTransparentColor(visibleBg)?'':parseRgbToHex(visibleBg);
    var bgOpacity=parseColorAlpha(visibleBg);
    var txtColor=isTransparentColor(s.color)?'':parseRgbToHex(s.color);
    var txtOpacity=parseColorAlpha(s.color);
    var title=dpTitle(sec,'Fill');
    title.appendChild(dpIconBtn('plus','Add fill',function(){
      if(!bgColor) applyD('backgroundColor','#D4D4D4');
      else if(!txtColor) applyD('color','#000000');
    }));
    if(bgColor){
      var r1=dEl('div','',sec);
      r1.appendChild(colorRow({
        label:'Fill',color:bgColor,opacity:bgOpacity,hidden:dBgHidden,
        onChange:function(c){
          var a=parseColorAlpha(c);
          applyD('backgroundColor',a<1?c:withColorAlpha(c,bgOpacity));
        },
        onOpacity:function(a){ applyD('backgroundColor',withColorAlpha(bgColor,a)); },
        onToggle:function(){ dBgHidden=!dBgHidden; },
        onRemove:function(){ applyD('backgroundColor','transparent'); }
      }));
    }
    if(txtColor){
      var r2=dEl('div','',sec);
      r2.appendChild(colorRow({
        label:'Text',color:txtColor,opacity:txtOpacity,hidden:dTxtHidden,
        onChange:function(c){
          var a=parseColorAlpha(c);
          applyD('color',a<1?c:withColorAlpha(c,txtOpacity));
        },
        onOpacity:function(a){ applyD('color',withColorAlpha(txtColor,a)); },
        onToggle:function(){ dTxtHidden=!dTxtHidden; },
        onRemove:function(){ applyD('color','transparent'); }
      }));
    }
    if(!bgColor&&!txtColor){
      dEl('div','dp-sub',sec).textContent='No fills \u2014 use + to add one.';
    }
  }
  function buildEffects(scroll,s){
    var sec=dEl('div','dp-sec',scroll);
    var shadow=s.boxShadow||'none';
    var parts=shadow.match(/(-?\\d+(\\.\\d+)?)px/g)||[];
    var x=parts[0]?parseFloat(parts[0]):0;
    var y=parts[1]?parseFloat(parts[1]):0;
    var blur=parts[2]?parseFloat(parts[2]):0;
    var spread=parts[3]?parseFloat(parts[3]):0;
    var hasShadow=!!shadow&&shadow!=='none';
    var isBlur=/blur\\(/.test(s.filter||'');
    var type=isBlur?'blur':dEffType;
    var title=dpTitle(sec,'Effects');
    title.appendChild(dpIconBtn('plus','Add effect',function(){
      applyD('boxShadow','0px 2px 4px 0px rgba(0,0,0,0.25)');
    }));
    if(hasShadow||isBlur){
      var headRow=dEl('div','dp-row dp-mt',sec);
      var typeSel=sfField({
        value:type==='blur'?'blur':(type==='inner'?'inner':'drop'),
        options:[{value:'drop',label:'Drop shadow'},{value:'inner',label:'Inner shadow'},{value:'blur',label:'Layer blur'}],
        onChange:function(v){
          dEffType=v;
          if(v==='blur'){ applyD('boxShadow','none'); applyD('filter','blur(4px)'); renderDesign(); }
          else { applyD('filter','none'); applyD('boxShadow',(v==='inner'?'inset ':'')+x+'px '+y+'px '+blur+'px '+spread+'px rgba(0,0,0,0.25)'); renderDesign(); }
        }
      });
      typeSel.style.flex='1'; typeSel.style.minWidth='0';
      headRow.appendChild(typeSel);
      headRow.appendChild(dpIconBtn('trash','Remove',function(){
        dEffType='drop';
        applyD('boxShadow','none');
        applyD('filter','none');
        renderDesign();
      }));
      if(type==='blur'){
        var bg2=dEl('div','dp-grid2 dp-mt',sec);
        bg2.appendChild(nfField({prefix:'B',min:0,value:isBlur?(parseFloat((s.filter.match(/blur\\((\\d+(?:\\.\\d+)?)px\\)/)||[])[1])||4):4,onChange:function(v){
          applyD('filter','blur('+(Math.max(0,parseFloat(v)||0))+'px)');
        }}));
      } else {
        var inner=type==='inner';
        function sh(nx,ny,nb,ns){
          applyD('boxShadow',(inner?'inset ':'')+nx+'px '+ny+'px '+nb+'px '+ns+'px rgba(0,0,0,0.25)');
        }
        var g1=dEl('div','dp-grid2 dp-mt',sec);
        g1.appendChild(nfField({prefix:'X',value:x,onChange:function(v){ sh(parseFloat(v)||0,y,blur,spread); }}));
        g1.appendChild(nfField({prefix:'Y',value:y,onChange:function(v){ sh(x,parseFloat(v)||0,blur,spread); }}));
        var g2=dEl('div','dp-grid2 dp-mt',sec);
        g2.appendChild(nfField({prefix:'B',min:0,value:blur,onChange:function(v){ sh(x,y,Math.max(0,parseFloat(v)||0),spread); }}));
        g2.appendChild(nfField({prefix:'S',value:spread,onChange:function(v){ sh(x,y,blur,parseFloat(v)||0); }}));
      }
    }
  }
  function buildTypography(scroll,s){
    var sec=dEl('div','dp-sec',scroll);
    dpTitle(sec,'Typography');
    var fam=s.fontFamily||'Inter';
    var famOpts=FONT_FAMILIES.slice();
    var known=null;
    for(var i=0;i<FONT_FAMILIES.length;i++){ if(FONT_FAMILIES[i].value===fam){ known=FONT_FAMILIES[i]; break; } }
    if(!known&&fam&&fam!=='none'){
      famOpts.unshift({value:fam,label:String(fam).split(',')[0].replace(/["']/g,'').trim()||'Current'});
    }
    var famRow=dEl('div','dp-row dp-mt',sec);
    famRow.style.marginBottom='12px';
    famRow.appendChild(sfField({
      value:fam,options:famOpts,fontPreview:true,
      onChange:function(v){ applyD('fontFamily',v); }
    }));
    var g1=dEl('div','dp-grid2',sec);
    var weightRaw=s.fontWeight||'400';
    var weightKnown=null;
    for(var j=0;j<FONT_WEIGHTS.length;j++){ if(FONT_WEIGHTS[j].value===weightRaw){ weightKnown=weightRaw; break; } }
    if(!weightKnown){
      var wn=Math.round(parseFloat(weightRaw)||400);
      weightRaw=String(wn);
    }
    g1.appendChild(labeled('Weight',sfField({value:weightRaw,options:FONT_WEIGHTS,onChange:function(v){ applyD('fontWeight',v); }})));
    g1.appendChild(labeled('Size',nfField({min:1,max:1000,value:Math.round(parseFloat(s.fontSize||'14'))||14,onChange:function(v){ applyD('fontSize',(Math.max(1,parseFloat(v)||14))+'px'); }})));
    var g2=dEl('div','dp-grid2 dp-mt',sec);
    g2.appendChild(labeled('Line height',nfField({icon:'baseline',min:0,value:Math.round(parseFloat(s.lineHeight))||0,onChange:function(v){ applyD('lineHeight',String(Math.max(0,parseFloat(v)||0))); }})));
    g2.appendChild(labeled('Letter spacing',nfField({icon:'tracking',value:Math.round(parseFloat(s.letterSpacing))||0,onChange:function(v){ applyD('letterSpacing',(parseFloat(v)||0)+'px'); }})));
    var dirVal=s.direction==='rtl'?'rtl':(s.direction==='ltr'?'ltr':'auto');
    var g3=dEl('div','dp-grid2 dp-mt',sec);
    g3.appendChild(labeled('Direction',sfField({value:dirVal,options:[{value:'auto',label:'Auto'},{value:'ltr',label:'LTR'},{value:'rtl',label:'RTL'}],onChange:function(v){ applyD('direction',v==='auto'?'inherit':v); }})));
    g3.appendChild(labeled('Case',sfField({value:s.textTransform||'none',options:[{value:'none',label:'Original'},{value:'uppercase',label:'Uppercase'},{value:'lowercase',label:'Lowercase'},{value:'capitalize',label:'Title'}],onChange:function(v){ applyD('textTransform',v); }})));
    dEl('div','dp-sub dp-mt',sec).textContent='Alignment';
    sec.appendChild(segControl({
      value:s.textAlign||'left',
      options:[
        {value:'left',label:'Align left',icon:'alignLeft'},
        {value:'center',label:'Align center',icon:'alignCenter'},
        {value:'right',label:'Align right',icon:'alignRight'},
        {value:'justify',label:'Justify',icon:'alignJustify'}
      ],
      onChange:function(v){ applyD('textAlign',v); }
    }));
    dEl('div','dp-sub dp-mt',sec).textContent='Vertical alignment';
    var vaRaw=s.verticalAlign||'top';
    var vaVal=vaRaw==='center'?'middle':vaRaw;
    if(['top','middle','bottom'].indexOf(vaVal)<0) vaVal='top';
    sec.appendChild(segControl({
      value:vaVal,
      options:[
        {value:'top',label:'Align top',icon:'vTop'},
        {value:'middle',label:'Align center',icon:'vMiddle'},
        {value:'bottom',label:'Align bottom',icon:'vBottom'}
      ],
      onChange:function(v){ applyD('verticalAlign',v); }
    }));
    dEl('div','dp-sub dp-mt',sec).textContent='Text formatting';
    var deco=(s.textDecorationLine||'none');
    var bold=(parseInt(weightRaw,10)||400)>=700;
    var italic=s.fontStyle==='italic';
    var under=deco.indexOf('underline')>=0;
    var strike=deco.indexOf('line-through')>=0;
    var fmt=dEl('div','seg',sec);
    [
      {icon:'bold',title:'Bold',on:bold,fn:function(){ applyD('fontWeight',bold?'400':'700'); }},
      {icon:'italic',title:'Italic',on:italic,fn:function(){ applyD('fontStyle',italic?'normal':'italic'); }},
      {icon:'underline',title:'Underline',on:under,fn:function(){ toggleDeco('underline',!under); }},
      {icon:'strike',title:'Strikethrough',on:strike,fn:function(){ toggleDeco('line-through',!strike); }}
    ].forEach(function(op){
      var b=dEl('button',op.on?'sel':'',fmt);
      b.type='button'; b.title=op.title;
      if(op.on) b.style.color='#aef637';
      b.appendChild(dpSvg(op.icon,14));
      b.onclick=function(ev){ ev.stopPropagation(); op.fn(); };
    });
    function toggleDeco(token,on){
      var set={};
      String(deco).split(' ').forEach(function(dd){ if(dd&&dd!=='none') set[dd]=true; });
      if(on) set[token]=true; else delete set[token];
      var keys=Object.keys(set);
      applyD('textDecorationLine',keys.length?keys.join(' '):'none');
    }
    var gt=dEl('div','dp-grid2 dp-mt',sec);
    gt.appendChild(labeled('Truncation',sfField({
      value:s.textOverflow==='ellipsis'?'ellipsis':'none',
      options:[{value:'none',label:'Disabled'},{value:'ellipsis',label:'Ending'}],
      onChange:function(v){
        if(v==='ellipsis'){
          applyD('textOverflow','ellipsis');
          applyD('whiteSpace','nowrap');
          applyD('overflow','hidden');
        } else {
          applyD('textOverflow','clip');
          applyD('whiteSpace','normal');
          applyD('overflow','visible');
        }
      }
    })));
  }
  // ---- main renderer ----
  var _dpDown=false;
  document.addEventListener('pointerdown',function(){ _dpDown=true; },true);
  document.addEventListener('pointerup',function(){ 
    _dpDown=false;
    if(_dpPending){ _dpPending=false; if(activeTab==='design') renderDesign(); }
  },true);
  var _dpPending=false;
  function elementName(tag){
    if(!tag) return 'No selection';
    if(tag==='div') return 'Frame';
    if(tag==='img') return 'Image';
    if(tag==='button') return 'Button';
    if(tag==='h1') return 'Heading';
    if(tag==='span'||tag==='p') return 'Text';
    return tag.charAt(0).toUpperCase()+tag.slice(1);
  }
  function designRerender(){
    if(_dpDown){ _dpPending=true; return; } // don't yank the panel mid-scrub
    var ae=document.activeElement;
    if(ae&&ae.tagName==='INPUT'&&ae.closest&&ae.closest('#designPanel')){
      var once=function(){ ae.removeEventListener('blur',once); if(activeTab==='design') renderDesign(); };
      ae.addEventListener('blur',once);
      return;
    }
    renderDesign();
  }
  function renderDesign(){
    var panel=$('designPanel'); if(!panel) return;
    closeAllMenus();
    var prevScroll=panel.querySelector('.dp-scroll');
    var scrollTop=prevScroll?prevScroll.scrollTop:0;
    panel.innerHTML='';
    if(!dsel||!dsel.styles||(!dsel.ecbId&&!Object.keys(dsel.styles).length)){
      // ---- Merged empty state: one body, one container, no divider ----
      var empty=dEl('div','dp-empty',panel);
      dEl('div','dp-wordmark',empty).textContent='Element Designer';
      var p=dEl('p','',empty);
      p.innerHTML='Click any element in the browser panel to select and edit its styles.<br/>Start inspecting your app, then click any element — its details will appear here.';
      var hints=dEl('div','dp-hints',empty);
      [
        ['Turn ON inspect mode','Chat icon'],
        ['Select an element','Click'],
        ['Finish editing / deselect','Esc or click outside']
      ].forEach(function(hn){
        var r=dEl('div','dp-kbdrow',hints);
        dEl('span','',r).textContent=hn[0];
        dEl('kbd','kbd',r).textContent=hn[1];
      });
      var startBtn=dEl('button','mini',empty);
      startBtn.style.marginTop='6px';
      startBtn.textContent='Start Inspecting';
      startBtn.onclick=function(){ try{ vscode.postMessage({type:'start'}); }catch(e){} };
      return;
    }
    var s=dsel.styles;
    var head=dEl('div','dp-head',panel);
    dEl('div','dp-name',head).textContent=elementName(dsel.tag);
    var btns=dEl('div','dp-btns',head);
    var done=dpIconBtn('done','Done — finish editing this element',requestDeselect);
    done.classList.add('dp-done');
    btns.appendChild(done);
    var ub=dpIconBtn('undo','Undo',undoD); if(!dUndo.length) ub.style.opacity='.35';
    var rb=dpIconBtn('redo','Redo',redoD); if(!dRedo.length) rb.style.opacity='.35';
    btns.appendChild(ub); btns.appendChild(rb);
    var scroll=dEl('div','dp-scroll',panel);
    buildPosition(scroll,s);
    buildLayout(scroll,s);
    buildAppearance(scroll,s);
    buildStroke(scroll,s);
    buildFill(scroll,s);
    buildEffects(scroll,s);
    buildTypography(scroll,s);
    if(scrollTop) scroll.scrollTop=scrollTop;
  }
  // While the user actively edits (click/type/scrub/scroll in the panel) the
  // page-side selection ring is suppressed; each interaction extends the
  // 1.5s window and it returns on its own — klone's selBoxHiddenUntil model.
  ['pointerdown','keydown','wheel','input'].forEach(function(evt){
    document.addEventListener(evt,function(e){
      var t=e.target;
      if(t&&t.closest&&t.closest('#designPanel')&&dsel){
        try{ vscode.postMessage({type:'designActivity'}); }catch(err){}
      }
    },true);
  });
  // Esc ends the current editing session (same as clicking outside in the page)
  document.addEventListener('keydown',function(e){
    if(e.key!=='Escape') return;
    var ae=document.activeElement;
    if(ae&&(ae.tagName==='INPUT'||ae.tagName==='TEXTAREA')) return; // typing
    if(_menuCleanup){ closeAllMenus(); return; }
    if(activeTab==='design'&&dsel) requestDeselect();
  });
  try{ vscode.postMessage({type:'sidebarReady'}); }catch(e){}
</script>
</body></html>
`;
}
