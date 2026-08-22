"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebviewHtml = getWebviewHtml;
function getWebviewHtml(proxyPort) {
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;height:100%;overflow:hidden;display:flex;flex-direction:column;background:#12130e;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;}
  /* ============ TOP TOOLBAR — olive design ============ */
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
  /* Reload spinner while the page is loading */
  .nav-btn.spinning svg{animation:ecb-spin .9s linear infinite}
  @keyframes ecb-spin{to{transform:rotate(360deg)}}
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
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
  </button>
  <button class="nav-btn" id="fwdBtn" title="Forward" aria-label="Forward" disabled>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
  </button>
  <button class="nav-btn" id="relBtn" title="Reload" aria-label="Reload">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
  </button>
  <div class="urlbar" role="search">
    <input id="url" spellcheck="false" autocomplete="off" placeholder="http://localhost:3000/" aria-label="Address bar"/>
    <button class="copy-btn" id="copyBtn" title="Copy URL" aria-label="Copy URL">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
    </button>
  </div>
  <div class="tools">
    <button class="tool-btn comment-group" id="chatBtn" title="Select element — click to turn ON inspect mode" aria-label="Inspect selection mode" aria-pressed="false">
      <svg class="icon-comment" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg>
      <svg class="icon-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      <span id="badge">0</span>
    </button>
    <button class="tool-btn" id="toolBtn" title="Downloads" aria-label="Downloads">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
      <span class="badge-dot" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      </span>
    </button>
    <button class="tool-btn" id="extBtn" title="Open this page in your system browser (for OAuth/SSO logins)" aria-label="Open in system browser">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
    </button>
    <button class="tool-btn dots-btn" id="dotsBtn" title="More" aria-label="More">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
    </button>
  </div>
</div>
<div id="frameWrap"><iframe id="app" sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-popups" allow="clipboard-read; clipboard-write"></iframe>
  <div class="globe" aria-hidden="true">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
  </div>
</div>
<script>
  const vscode = acquireVsCodeApi();
  const PROXY = 'http://127.0.0.1:${proxyPort}';
  var TARGET = ''; // real app origin — proxied URLs are displayed mapped back to this
  let clicks = 0, stack = [], idx = -1, inspecting = false;
  const $ = function(id){ return document.getElementById(id); };
  const app = $('app');
  const chatBtn = $('chatBtn');
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
      startSpin();
      if(remember){ stack = stack.slice(0, idx + 1); stack.push(u.href); idx = stack.length - 1; }
      updNav();
      vscode.postMessage({ type:'navigated', url: u.href });
    }catch(e){}
  }
  // Map a proxied URL (127.0.0.1:<port>/...) back to the real target origin
  function toReal(u){
    u = String(u || '');
    try{
      var x = new URL(u);
      if(TARGET && x.origin === new URL(PROXY).origin){
        var t = new URL(TARGET);
        return t.origin + x.pathname + x.search + x.hash;
      }
    }catch(e){}
    return u;
  }
  // Keep the address bar + back/forward stack in sync with in-app navigations
  function syncUrl(u){
    u = String(u || '').trim();
    if(!u) return;
    u = toReal(u);
    try{ u = new URL(u).href; }catch(e){ return; }
    if(document.activeElement === $('url')) return; // don't fight the user typing
    $('url').value = u;
    if(idx >= 0 && stack[idx] === u) return;
    if(idx > 0 && stack[idx - 1] === u){ idx--; updNav(); return; }   // in-app Back
    if(idx >= 0 && stack[idx + 1] === u){ idx++; updNav(); return; }  // in-app Forward
    stack = stack.slice(0, idx + 1);
    stack.push(u);
    idx = stack.length - 1;
    updNav();
  }
  // Reload spinner: spin from navigation start until the iframe finishes loading
  function startSpin(){
    var rb = $('relBtn');
    rb.classList.add('spinning');
    clearTimeout(startSpin._t);
    startSpin._t = setTimeout(function(){ rb.classList.remove('spinning'); }, 8000);
  }
  window.loadApp = function(url){ go(url, true); };
  $('backBtn').onclick = function(){ if(idx > 0){ idx--; go(stack[idx], false); } };
  $('fwdBtn').onclick  = function(){ if(idx < stack.length - 1){ idx++; go(stack[idx], false); } };
  $('relBtn').onclick  = function(){ if(idx >= 0){ go(stack[idx], false); } else { var v=$('url').value.trim(); if(v) go(v,true); } };
  $('copyBtn').onclick = function(){
    var v = $('url').value || (idx>=0?stack[idx]:'');
    if(!v) return;
    try{ navigator.clipboard.writeText(v).catch(function(){}); }catch(e){}
    vscode.postMessage({ type:'copy', value: v });
    var b=this; var t=b.title; b.title='Copied!'; setTimeout(function(){b.title=t;},1200);
  };
  $('toolBtn').onclick  = function(){ vscode.postMessage({ type:'pageInfo', url: idx >= 0 ? stack[idx] : '' }); };
  $('extBtn').onclick   = function(){ vscode.postMessage({ type:'openCurrent', url: app.src || '' }); };
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
  app.addEventListener('load', function(){
    $('relBtn').classList.remove('spinning');
    pushMode();
  });
  setInterval(function(){ if(inspecting) pushMode(); }, 900);
  window.addEventListener('message', function(ev){
    if(ev.data && ev.data.type === 'load' && ev.data.url){
      TARGET = ev.data.target || '';
      window.loadApp(ev.data.url);
      return;
    }
    if(ev.data && ev.data.type === 'setInspect'){ setInspect(!!ev.data.enabled); return; }
    if(ev.source === app.contentWindow && ev.data && ev.data.__ecbUrl){
      syncUrl(ev.data.url);
      return;
    }
    if(ev.source === app.contentWindow && ev.data && ev.data.__ecb){
      var d = ev.data.data || {};
      if(d.url) d.url = toReal(d.url); // report the real app URL, not the proxy
      clicks++;
      badge.textContent = clicks > 99 ? '99+' : String(clicks);
      badge.style.display = 'block';
      badge.animate ? badge.animate([{transform:'scale(1)'},{transform:'scale(1.18)'},{transform:'scale(1)'}],{duration:220}) : 0;
      vscode.postMessage({ type:'elementClicked', data: d });
      return;
    }
    if(ev.source === app.contentWindow && ev.data && ev.data.__ecbCookies){
      vscode.postMessage({ type:'cookieSync', cookie: ev.data.cookie, url: ev.data.url });
      return;
    }
    if(ev.source === app.contentWindow && ev.data && ev.data.__ecbExternal){
      vscode.postMessage({ type:'openExternal', url: ev.data.url });
      return;
    }
  });
  window.__setInspect = setInspect;
  vscode.postMessage({ type:'ready' });
</script>
</body></html>`;
}
//# sourceMappingURL=panelHtml.js.map