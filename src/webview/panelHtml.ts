export function getWebviewHtml(proxyPort: number): string {
	return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;height:100%;overflow:hidden;display:flex;flex-direction:column;background:#1E1F1C;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;}
  /* ============ TOP TOOLBAR ============ */
  .toolbar{
    display:flex;align-items:center;
    height:42px;flex:0 0 42px;
    padding:0 10px;
    background:#272822;
    gap:2px;
    user-select:none;
  }
  .nav-btn{
    width:32px;height:32px;flex:0 0 32px;
    border:none;background:transparent;color:#F8F8F2;
    display:flex;align-items:center;justify-content:center;
    border-radius:6px;cursor:pointer;
  }
  .nav-btn:hover{background:#3E3D32}
  .nav-btn:active{background:#414339}
  .nav-btn:disabled{opacity:.38;pointer-events:none}
  .nav-btn svg{width:20px;height:20px;display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  /* Reload spinner while the page is loading */
  .nav-btn.spinning svg{animation:ecb-spin .9s linear infinite}
  @keyframes ecb-spin{to{transform:rotate(360deg)}}
  /* URL bar — input surface */
  .urlbar{
    flex:1;min-width:120px;
    margin:0 8px;
    height:28px;
    background:#414339;
    border-radius:7px;
    display:flex;align-items:center;
    padding:0 6px 0 10px;
    border:1px solid transparent;
    transition:border-color .15s,background .15s;
  }
  .urlbar:focus-within{
    background:#3E3D32;
    border-color:#75715E;
  }
  #url{
    flex:1;min-width:0;width:100%;
    background:transparent;border:none;outline:none;
    color:#F8F8F2;
    font-size:13px;letter-spacing:.2px;
    font-family:inherit;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  }
  #url::placeholder{color:#75715E}
  #url::selection{background:#75715E;color:#F8F8F2}
  .copy-btn{
    margin-left:auto;
    display:flex;align-items:center;justify-content:center;
    color:#F8F8F2;background:transparent;border:none;
    cursor:pointer;padding:4px;border-radius:5px;flex:0 0 auto;
  }
  .copy-btn:hover{background:#3E3D32}
  .copy-btn:active{background:#414339}
  .copy-btn svg{width:15px;height:15px;display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  /* Right tools */
  .tools{display:flex;align-items:center;gap:2px;color:#F8F8F2;flex:0 0 auto}
  .tool-btn{
    border:none;background:transparent;color:inherit;
    min-width:28px;height:32px;
    display:flex;align-items:center;justify-content:center;
    border-radius:6px;cursor:pointer;position:relative;padding:0 5px;
  }
  .tool-btn:hover{background:#3E3D32}
  .tool-btn:active{background:#414339}
  .tool-btn svg{width:18px;height:18px;display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .tool-btn svg.fill{fill:currentColor;stroke:none}
  .comment-group svg.icon-comment{width:19px;height:19px}
  .comment-group svg.icon-chevron{width:11px;height:11px;margin-left:1px}
  #chatBtn.on{background:#414339;color:#F8F8F2}
  #chatBtn.on:hover{background:#4A4C40}
  #chatBtn.on .icon-chevron{transform:rotate(180deg)}
  #chatBtn.pulse{animation:pulse 1.6s ease infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(117,113,94,.55)}70%{box-shadow:0 0 0 8px rgba(117,113,94,0)}100%{box-shadow:0 0 0 0 rgba(117,113,94,0)}}
  .badge-dot{
    position:absolute;right:1px;bottom:5px;
    width:9px;height:9px;border-radius:50%;
    background:#75715E;box-shadow:0 0 0 1.5px #272822;
    display:flex;align-items:center;justify-content:center;
    pointer-events:none;
  }
  .badge-dot svg{width:6px;height:6px;fill:none;stroke:#F8F8F2;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
  .dots-btn svg{width:18px;height:18px}
  /* Bug-flow recording */
  #flowBtn.flow-on{color:#F8F8F2 !important;background:#414339 !important}
  #flowBadge{
    position:absolute;top:1px;right:1px;
    min-width:14px;height:14px;padding:0 3px;
    border-radius:7px;
    background:#75715E;color:#F8F8F2;
    font-size:10px;font-weight:700;line-height:14px;text-align:center;
    border:1.5px solid #272822;
    display:none;pointer-events:none;
  }
  #flowToast{
    position:absolute;left:50%;bottom:14px;transform:translateX(-50%);
    background:#75715E;color:#F8F8F2;font-size:12px;font-weight:600;
    padding:5px 12px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.4);
    opacity:0;transition:opacity .25s;pointer-events:none;z-index:70;
    white-space:nowrap;
  }
  /* Mini horizontal note editor: [input][+] */
  #noteBox{
    position:absolute;z-index:60;display:none;
    align-items:center;gap:5px;
    background:#272822;border:1px solid #34352F;border-radius:8px;
    padding:4px;box-shadow:0 6px 18px rgba(0,0,0,.45);
  }
  #noteBox.open{display:flex}
  #noteInput{
    width:200px;height:30px;box-sizing:border-box;
    background:#414339;color:#F8F8F2;
    border:1px solid #ffffff;border-radius:5px;
    padding:0 8px;font-size:12px;font-family:inherit;
  }
  #noteInput:focus{outline:none;border-color:#ffffff;box-shadow:0 0 0 1px rgba(255,255,255,.35)}
  #noteInput::placeholder{color:#75715E}
  #noteAdd{
    height:30px;width:30px;flex:0 0 30px;
    background:#ffffff;color:#1E1F1C;border:none;border-radius:5px;
    font-family:inherit;font-size:17px;font-weight:700;line-height:1;
    display:flex;align-items:center;justify-content:center;
    cursor:pointer;padding:0;
  }
  #noteAdd:hover{opacity:.85}
  /* Content / iframe */
  #frameWrap{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;background:#1E1F1C;position:relative}
  iframe{border:none;flex:1 1 auto;width:100%;min-height:0;background:#fff;display:block}
  .globe{position:absolute;left:200px;bottom:8px;color:#F8F8F2;line-height:0;pointer-events:none;opacity:.45}
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
    </button>
    <button class="tool-btn" id="toolBtn" title="Downloads" aria-label="Downloads">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
      <span class="badge-dot" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      </span>
    </button>
    <button class="tool-btn" id="flowBtn" title="Record bug flow — click elements in order, annotate each, then finish to export" aria-label="Record bug flow" aria-pressed="false">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M17.47 9c1.93-.2 3.53-1.9 3.53-4"/><path d="M22 13h-4"/><path d="M21 21c0-2.1-1.7-3.9-3.8-4"/></svg>
      <span id="flowBadge">0</span>
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
  <div id="noteBox">
    <input id="noteInput" type="text" placeholder="Note…" spellcheck="false" autocomplete="off" aria-label="Step note"/>
    <button id="noteAdd" title="Add step (Enter)" aria-label="Add step">+</button>
  </div>
  <div class="globe" aria-hidden="true">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
  </div>
</div>
<script>
  const vscode = acquireVsCodeApi();
  const PROXY = 'http://127.0.0.1:${proxyPort}';
  var TARGET = ''; // real app origin — proxied URLs are displayed mapped back to this
  let clicks = 0, stack = [], idx = -1, inspecting = false;
  // ---- Bug-flow recording ----
  var flowMode = false, pendingEl = null;
  const $ = function(id){ return document.getElementById(id); };
  const app = $('app');
  const chatBtn = $('chatBtn');

  const flowBtn = $('flowBtn');
  const flowBadge = $('flowBadge');
  const noteBox = $('noteBox');
  const noteInput = $('noteInput');
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
  // Persist the current URL so a torn-down/restored webview can reload the
  // page the user was actually on, not just the original launch URL.
  function storeUrl(u){ try{ vscode.setState({ url: u }); }catch(e){} }
  function go(url, remember){
    if(!url) return;
    url = url.trim();
    if(!url) return;
    if(!/^https?:\\/\\//i.test(url)){ url = 'http://' + url; }
    try{
      var u = new URL(url);
      $('url').value = u.href;
      storeUrl(u.href);
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
    storeUrl(u);
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
  chatBtn.onclick = function(){ if(flowMode) return; setInspect(!inspecting); };
  $('url').addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ go($('url').value, true); this.blur(); }
    if(e.key === 'Escape'){ this.blur(); }
  });
  $('url').addEventListener('focus', function(){ this.select(); });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){
      if(noteBox.classList.contains('open')){ e.preventDefault(); hideNote(); return; }
      if(inspecting){ e.preventDefault(); setInspect(false); }
    }
  });
  app.addEventListener('load', function(){
    $('relBtn').classList.remove('spinning');
    pushMode();
  });
  setInterval(function(){ if(inspecting) pushMode(); }, 900);
  window.addEventListener('message', function(ev){
    if(ev.data && ev.data.type === 'load' && ev.data.url){
      TARGET = ev.data.target || '';
      // Prefer the last page the user was on (survives webview teardown).
      var saved = null;
      try{ saved = vscode.getState(); }catch(e){}
      window.loadApp((saved && saved.url) ? saved.url : ev.data.url);
      return;
    }
    if(ev.data && ev.data.type === 'setInspect'){ setInspect(!!ev.data.enabled); return; }
    if(ev.data && ev.data.type === 'flowState'){
      flowMode = !!ev.data.active;
      flowBtn.classList.toggle('flow-on', flowMode);
      flowBtn.setAttribute('aria-pressed', flowMode ? 'true' : 'false');
      // Flow REUSES the inspect capture pipeline: the injected script only
      // reports clicks while inspect mode is on, and its hover outline makes
      // picking elements easier. Captures stay out of plain history because
      // __ecb clicks route to the note popover below instead.
      setInspect(flowMode);
      flowBadgeSet(ev.data.count || 0);
      if(!flowMode && !ev.data.count){ hideNote(); }
      return;
    }
    if(ev.data && ev.data.type === 'flowCount'){ flowBadgeSet(ev.data.count || 0); return; }
    // ---- Design editor: host -> page commands ----
    if(ev.data && ev.data.type === 'ecbApplyStyle'){
      try{ app.contentWindow.postMessage({ __ecb:'applyStyle', prop: ev.data.prop, value: ev.data.value, x: ev.data.x, y: ev.data.y, ecbId: ev.data.ecbId, selector: ev.data.selector }, '*'); }catch(e){}
      return;
    }
    if(ev.data && ev.data.type === 'ecbGetStyles'){
      try{ app.contentWindow.postMessage({ __ecb:'getStyles' }, '*'); }catch(e){}
      return;
    }
    if(ev.data && ev.data.type === 'ecbDeselect'){
      try{ app.contentWindow.postMessage({ __ecb:'deselect' }, '*'); }catch(e){}
      return;
    }
    if(ev.data && ev.data.type === 'ecbEditActive'){
      try{ app.contentWindow.postMessage({ __ecb:'editActive' }, '*'); }catch(e){}
      return;
    }
    // ---- Design editor: page -> host style snapshots / session end ----
    if(ev.source === app.contentWindow && ev.data && ev.data.__ecbStyles){
      vscode.postMessage({ type:'designStyles', data: ev.data.data });
      return;
    }
    if(ev.source === app.contentWindow && ev.data && ev.data.__ecbDesignCleared){
      vscode.postMessage({ type:'designCleared' });
      return;
    }
    if(ev.source === app.contentWindow && ev.data && ev.data.__ecbUrl){
      syncUrl(ev.data.url);
      return;
    }
    if(ev.source === app.contentWindow && ev.data && ev.data.__ecb){
      var d = ev.data.data || {};
      if(d.url) d.url = toReal(d.url); // report the real app URL, not the proxy
      if(flowMode){
        // Bug-flow: annotate instead of adding to plain history. Clicking
        // another element while the editor is open re-targets it there.
        showNote(d);
        return;
      }
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

  // ================= Bug-flow recording =================
  var flowCount = 0, toastEl = null, toastT = 0;
  function showToast(msg){
    if(!toastEl){
      toastEl = document.createElement('div');
      toastEl.id = 'flowToast';
      $('frameWrap').appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastT);
    toastT = setTimeout(function(){ toastEl.style.opacity = '0'; }, 1500);
  }
  function flowBadgeSet(n){
    n = n || 0;
    var grew = n > flowCount;
    flowCount = n;
    flowBadge.textContent = n > 99 ? '99+' : String(n);
    flowBadge.style.display = n > 0 ? 'block' : 'none';
    if(grew){
      if(flowBadge.animate) flowBadge.animate([{transform:'scale(1)'},{transform:'scale(1.4)'},{transform:'scale(1)'}],{duration:320});
      showToast('Step ' + n + ' added ✓');
    }
  }
  // Anchor the mini note editor to the clicked element's own viewport rect
  // from the capture — the iframe renders 1:1 CSS pixels and fills frameWrap
  // edge to edge, so those coords map straight onto frameWrap space.
  function placeNote(d){
    var W = $('frameWrap').clientWidth, H = $('frameWrap').clientHeight;
    var ex = d.rect ? d.rect.x : 40, ey = d.rect ? d.rect.y : 40, eh = d.rect ? d.rect.h : 0;
    var x = ex + 12;
    var y = ey + eh + 8; // just below the element
    if(y > H - 50) y = Math.max(8, ey - 44); // flip above when near the bottom
    x = Math.min(Math.max(8, x), Math.max(8, W - 272));
    y = Math.min(Math.max(8, y), Math.max(8, H - 50));
    noteBox.style.left = x + 'px';
    noteBox.style.top = y + 'px';
  }
  function saveStep(){
    if(!pendingEl) return;
    var d = pendingEl;
    hideNote();
    vscode.postMessage({ type:'stepSaved', data: d, note: noteInput.value.trim() });
  }
  // Re-anchors to every newly clicked element: clicking around before typing
  // simply moves the editor to the latest selection.
  function showNote(d){
    pendingEl = d;
    noteInput.value = '';
    placeNote(d);
    noteBox.classList.add('open');
    setTimeout(function(){ noteInput.focus(); }, 0);
  }
  function hideNote(){ pendingEl = null; noteBox.classList.remove('open'); }
  $('noteAdd').onclick = saveStep;
  noteInput.addEventListener('keydown', function(e){
    e.stopPropagation();
    if(e.key === 'Enter'){ e.preventDefault(); saveStep(); }
    if(e.key === 'Escape'){ hideNote(); }
  });
  // Keep interactions inside the box from leaking to the rest of the panel.
  // Bubble phase (no capture flag!) — a capture-phase stopPropagation here
  // would prevent the event from ever reaching the input and + button below.
  ['mousedown','mouseup','click','dblclick'].forEach(function(evt){
    noteBox.addEventListener(evt, function(e){ e.stopPropagation(); });
  });
  flowBtn.onclick = function(){ vscode.postMessage({ type: 'toggleFlow' }); };

  vscode.postMessage({ type:'ready' });
</script>
</body></html>`;
}
