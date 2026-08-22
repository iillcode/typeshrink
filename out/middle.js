"use strict";
function getWebviewHtml(proxyPort) {
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;height:100%;overflow:hidden;display:flex;flex-direction:column;background:#12130e;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;}
  /* ============ TOP TOOLBAR — new olive design ============ */
  .toolbar{
    display:flex;align-items:center;
    height:42px;flex:0 0 42px;
    padding:0 10px;
    background:#262821;
    gap:2px;
    user-select:none;
  }
  .nav-btn{
    width:32px;height:32px;flex:0 0 32px;
    border:none;background:transparent;color:#cdcec8;
    display:flex;align-items:center;justify-content:center;
    border-radius:6px;cursor:pointer;
  }
  .nav-btn:hover{background:rgba(255,255,255,0.07)}
  .nav-btn:active{background:rgba(255,255,255,0.10)}
  .nav-btn:disabled{opacity:.38;pointer-events:none}
  .nav-btn svg{width:20px;height:20px;display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  /* URL bar — olive #4a4d41 */
  .urlbar{
    flex:1;min-width:120px;
    margin:0 8px;
    height:28px;
    background:#4a4d41;
    border-radius:7px;
    display:flex;align-items:center;
    padding:0 6px 0 10px;
    border:1px solid transparent;
    transition:border-color .15s,background .15s;
  }
  .urlbar:focus-within{
    background:#3e4136;
    border-color:#7a9b6a;
  }
  #url{
    flex:1;min-width:0;width:100%;
    background:transparent;border:none;outline:none;
    color:#f2f2ee;
    font-size:13px;letter-spacing:.2px;
    font-family:inherit;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  }
  #url::placeholder{color:#a8a9a3}
  #url::selection{background:#7a9b6a;color:#12130e}
  .copy-btn{
    margin-left:auto;
    display:flex;align-items:center;justify-content:center;
    color:#e9e9e4;background:transparent;border:none;
    cursor:pointer;padding:4px;border-radius:5px;flex:0 0 auto;
  }
  .copy-btn:hover{background:rgba(255,255,255,0.08)}
  .copy-btn:active{background:rgba(255,255,255,0.13)}
  .copy-btn svg{width:15px;height:15px;display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  /* Right tools */
  .tools{display:flex;align-items:center;gap:2px;color:#cdcec8;flex:0 0 auto}
  .tool-btn{
    border:none;background:transparent;color:inherit;
    min-width:28px;height:32px;
    display:flex;align-items:center;justify-content:center;
    border-radius:6px;cursor:pointer;position:relative;padding:0 5px;
  }
  .tool-btn:hover{background:rgba(255,255,255,0.07)}
  .tool-btn:active{background:rgba(255,255,255,0.10)}
  .tool-btn svg{width:18px;height:18px;display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .tool-btn svg.fill{fill:currentColor;stroke:none}
  .comment-group svg.icon-comment{width:19px;height:19px}
  .comment-group svg.icon-chevron{width:11px;height:11px;margin-left:1px}
  #chatBtn.on{background:rgba(255,255,255,0.12);color:#f2f2ee}
  #chatBtn.on:hover{background:rgba(255,255,255,0.16)}
  #chatBtn.on .icon-chevron{transform:rotate(180deg)}
  #chatBtn.pulse{animation:pulse 1.6s ease infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(122,155,106,.45)}70%{box-shadow:0 0 0 8px rgba(122,155,106,0)}100%{box-shadow:0 0 0 0 rgba(122,155,106,0)}}
  #badge{
    position:absolute;top:1px;right:1px;
    min-width:14px;height:14px;padding:0 3px;
    border-radius:7px;
    background:#2f8fd6;color:#fff;
    font-size:10px;font-weight:700;line-height:14px;text-align:center;
    border:1.5px solid #262821;
    display:none;pointer-events:none;
  }
  #chatBtn.on #badge{border-color:rgba(255,255,255,0.12)}
  .badge-dot{
    position:absolute;right:1px;bottom:5px;
    width:9px;height:9px;border-radius:50%;
    background:#2f8fd6;box-shadow:0 0 0 1.5px #262821;
    display:flex;align-items:center;justify-content:center;
    pointer-events:none;
  }
  .badge-dot svg{width:6px;height:6px;fill:none;stroke:#fff;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
  .dots-btn svg{width:18px;height:18px}
  /* Inspect banner */
  #inspectBanner{
    display:none;align-items:center;gap:8px;
    height:28px;flex:0 0 28px;
    padding:0 12px;
    background:#2a2e22;color:#e9e9e4;
    font-size:12px;line-height:28px;
    border-bottom:1px solid #34362f;
  }
  #inspectBanner.on{display:flex}
  #inspectBanner .dot{width:8px;height:8px;border-radius:50%;background:#7a9b6a;box-shadow:0 0 6px #7a9b6a;flex:0 0 8px}
  #inspectBanner kbd{
    margin-left:auto;
    font:11px/16px monospace;
    background:rgba(255,255,255,.10);
    border:1px solid rgba(255,255,255,.12);
    border-bottom-color:rgba(255,255,255,.18);
    padding:1px 6px;border-radius:4px;
  }
  /* Content / iframe */
  #frameWrap{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;background:#12130e;position:relative}
  iframe{border:none;flex:1 1 auto;width:100%;min-height:0;background:#fff;display:block}
  .globe{position:absolute;left:200px;bottom:8px;color:#f5f5f2;line-height:0;pointer-events:none;opacity:.45}
  .globe svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
  @media (max-width:520px){.globe{left:20%}}
</style></head>
<body>
<div class="toolbar" role="toolbar" aria-label="Browser toolbar">
  <button class="nav-btn" id="backBtn" title="Back" aria-label="Back" disabled>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
  </button>
  <button class="nav-btn" id="fwdBtn" title="Forward" aria-label="Forward" disabled>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
  </button>
  <button class="nav-btn" id="relBtn" title="Reload" aria-label="Reload">
    <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 18.36 5.64L23 10"/></svg>
  </button>
  <div class="urlbar" role="search">
    <input id="url" spellcheck="false" autocomplete="off" placeholder="http://localhost:3000/" aria-label="Address bar"/>
    <button class="copy-btn" id="copyBtn" title="Copy URL" aria-label="Copy URL">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
    </button>
  </div>
  <div class="tools">
    <button class="tool-btn comment-group" id="chatBtn" title="Select element — click to turn ON inspect mode" aria-label="Inspect selection mode" aria-pressed="false">
      <svg class="icon-comment" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="12.5" x2="13" y2="12.5"/></svg>
      <svg class="icon-chevron" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      <span id="badge">0</span>
    </button>
    <button class="tool-btn" id="toolBtn" title="Downloads" aria-label="Downloads">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <span class="badge-dot" aria-hidden="true">
        <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
      </span>
    </button>
    <button class="tool-btn dots-btn" id="dotsBtn" title="More" aria-label="More">
      <svg class="fill" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
    </button>
  </div>
</div>
<div id="inspectBanner" role="status" aria-live="polite">
  <span class="dot"></span>
  <span><b>Inspect mode ON</b>&nbsp; — hover to highlight, click to capture element</span>
  <kbd>ESC</kbd>
</div>
<div id="frameWrap"><iframe id="app" sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-popups" allow="clipboard-read; clipboard-write"></iframe>
  <div class="globe" aria-hidden="true">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
  </div>
</div>
<script>
  const vscode = acquireVsCodeApi();
  const PROXY = 'http://127.0.0.1:${proxyPort}';
  let clicks = 0, stack = [], idx = -1, inspecting = false;
  const $ = function(id){ return document.getElementById(id); };
  const app = $('app');
  const chatBtn = $('chatBtn');
  const banner = $('inspectBanner');
  const badge = $('badge');
  function pushMode(){
    try{ app.contentWindow.postMessage({ __ecb:'mode', enabled: inspecting }, '*'); }catch(e){}
  }
  function setInspect(on){
    inspecting = !!on;
    chatBtn.classList.toggle('on', inspecting);
    chatBtn.classList.toggle('pulse', inspecting);
    chatBtn.setAttribute('aria-pressed', inspecting ? 'true' : 'false');
    chatBtn.title = inspecting ? 'Inspect selection mode is ON — click again to turn OFF (ESC to exit)' : 'Turn ON inspect selection mode — click elements to capture';
    banner.classList.toggle('on', inspecting);
    try{ document.body.style.cursor = inspecting ? 'crosshair' : ''; }catch(e){}
    pushMode();
  }
  function updNav(){
    $('backBtn').disabled = idx <= 0;
    $('fwdBtn').disabled = idx < 0 || idx >= stack.length - 1;
  }
  function go(url, remember){
    if(!url) return;
    url = url.trim();
    if(!url) return;
    if(!/^https?:\\/\\//i.test(url)){ url = 'http://' + url; }
    try{
      var u = new URL(url);
      $('url').value = u.href;
      app.src = PROXY + u.pathname + u.search + u.hash;
      if(remember){ stack = stack.slice(0, idx + 1); stack.push(u.href); idx = stack.length - 1; }
      updNav();
      vscode.postMessage({ type:'navigated', url: u.href });
    }catch(e){}
  }
  window.loadApp = function(url){ go(url, true); };
  $('backBtn').onclick = function(){ if(idx > 0){ idx--; go(stack[idx], false); } };
  $('fwdBtn').onclick  = function(){ if(idx < stack.length - 1){ idx++; go(stack[idx], false); } };
  $('relBtn').onclick  = function(){ if(idx >= 0){ go(stack[idx], false); } else { var v=$('url').value.trim(); if(v) go(v,true); } };
  $('copyBtn').onclick = function(){
    var v = $('url').value || (idx>=0?stack[idx]:'');
    if(!v) return;
    try{ navigator.clipboard.writeText(v); }catch(e){}
    vscode.postMessage({ type:'copy', value: v });
    var b=this; var t=b.title; b.title='Copied!'; setTimeout(function(){b.title=t;},1200);
  };
  $('toolBtn').onclick  = function(){ vscode.postMessage({ type:'pageInfo', url: idx >= 0 ? stack[idx] : '' }); };
  $('dotsBtn').onclick  = function(){ vscode.postMessage({ type:'clearHistory' }); };
  chatBtn.onclick = function(){ setInspect(!inspecting); };
  $('url').addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ go($('url').value, true); this.blur(); }
    if(e.key === 'Escape'){ this.blur(); }
  });
  $('url').addEventListener('focus', function(){ this.select(); });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && inspecting){ e.preventDefault(); setInspect(false); }
  });
  app.addEventListener('load', pushMode);
  setInterval(function(){ if(inspecting) pushMode(); }, 900);
  window.addEventListener('message', function(ev){
    if(ev.data && ev.data.type === 'load' && ev.data.url){ window.loadApp(ev.data.url); return; }
    if(ev.data && ev.data.type === 'setInspect'){ setInspect(!!ev.data.enabled); return; }
    if(ev.source === app.contentWindow && ev.data && ev.data.__ecb){
      var d = ev.data.data || {};
      clicks++;
      badge.textContent = clicks > 99 ? '99+' : String(clicks);
      badge.style.display = 'block';
      badge.animate ? badge.animate([{transform:'scale(1)'},{transform:'scale(1.18)'},{transform:'scale(1)'}],{duration:220}) : 0;
      vscode.postMessage({ type:'elementClicked', data: d });
    }
  });
  window.__setInspect = setInspect;
  vscode.postMessage({ type:'ready' });
</script>
</body></html>`;
}
//# sourceMappingURL=middle.js.map