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
  /* Linear page-loading indicator (20 × 2 px, indeterminate sweep).
     The dim track is always visible; only the bright segment animates on load. */
  #lineLoader{
    width:20px;height:2px;flex:0 0 20px;margin-left:6px;
    border-radius:1px;background:#34352F;position:relative;overflow:hidden;
  }
  #lineLoader::after{
    content:'';position:absolute;top:0;left:-8px;width:8px;height:2px;border-radius:1px;
    background:#F8F8F2;opacity:0;
  }
  #lineLoader.on::after{
    opacity:1;
    animation:ecb-line .9s linear infinite;
  }
  @keyframes ecb-line{to{left:20px}}
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
    <button class="tool-btn" id="toolBtn" title="Page info" aria-label="Page info">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
    </button>
    <button class="tool-btn" id="extBtn" title="Open this page in your system browser (for OAuth/SSO logins)" aria-label="Open in system browser">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
    </button>
    <div id="lineLoader" role="progressbar" aria-label="Page loading"></div>
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
  let clicks = 0, stack = [], idx = -1;
  const $ = function(id){ return document.getElementById(id); };
  const app = $('app');
  function updNav(){
    $('backBtn').disabled = idx <= 0;
    $('fwdBtn').disabled = idx < 0 || idx >= stack.length - 1;
  }
  // Persist the current URL so a torn-down/restored webview can reload the
  // page the user was actually on, not just the original launch URL.
  function storeUrl(u){ try{ vscode.setState({ url: u }); }catch(e){} }
  // Page loading state: line loader in the toolbar + tab loader in VS Code.
  // Stays on until the iframe fires its load event (30s failsafe).
  var pageLoading = false, loadFailT = 0;
  function setPageLoading(on){
    if(pageLoading === !!on) return;
    pageLoading = !!on;
    var l = $('lineLoader'); if(l) l.classList.toggle('on', pageLoading);
    vscode.postMessage({ type:'pageLoadState', loading: pageLoading });
    if(pageLoading){
      clearTimeout(loadFailT);
      loadFailT = setTimeout(function(){ setPageLoading(false); }, 30000);
    } else {
      clearTimeout(loadFailT);
    }
  }
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
      setPageLoading(true);
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
  $('url').addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ go($('url').value, true); this.blur(); }
    if(e.key === 'Escape'){ this.blur(); }
  });
  $('url').addEventListener('focus', function(){ this.select(); });
  app.addEventListener('load', function(){
    setPageLoading(false);
  });
  window.addEventListener('message', function(ev){
    if(ev.data && ev.data.type === 'load' && ev.data.url){
      TARGET = ev.data.target || '';
      // Prefer the last page the user was on (survives webview teardown).
      var saved = null;
      try{ saved = vscode.getState(); }catch(e){}
      window.loadApp((saved && saved.url) ? saved.url : ev.data.url);
      return;
    }
    if(ev.source === app.contentWindow && ev.data && ev.data.__ecbUrl){
      syncUrl(ev.data.url);
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

  vscode.postMessage({ type:'ready' });
</script>
</body></html>`;
}
