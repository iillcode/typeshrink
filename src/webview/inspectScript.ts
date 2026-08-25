/** Injected into every HTML response served through the proxy.
 *  Provides browser-only plumbing: document.cookie mirroring,
 *  cross-origin navigation hand-off, Server-Action self-heal and
 *  URL-change reporting so the toolbar stays in sync. */
export const INJECT_SCRIPT = `
<script>
(function(){
  if (window.__ecbInstalled) return; window.__ecbInstalled = true;
  // ---- Self-heal stale Server Action builds ----
  // When the app is rebuilt/redeployed while this page is open, its JS still
  // carries old action ids and form POSTs fail with 500 ("Failed to find
  // Server Action"). Detect that specific failure and reload once to fetch
  // fresh chunks instead of leaving a broken login/form behind.
  function __ecbCanHeal(){
    try{
      var t = Number(sessionStorage.getItem('__ecbLastHeal')||0);
      if(Date.now()-t < 10000) return false;
      sessionStorage.setItem('__ecbLastHeal',''+Date.now());
      return true;
    }catch(e){ return false; }
  }
  try{
    var __ecbOrigFetch = window.fetch;
    window.fetch = function(input, init){
      var args = arguments;
      var isActionPost = false;
      try{
        var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        var hdrs = (init && init.headers) || (input && input.headers);
        var na = null;
        if(hdrs){
          if(typeof hdrs.get === 'function'){ na = hdrs.get('next-action'); }
          else { for(var k in hdrs){ if(String(k).toLowerCase()==='next-action') na = hdrs[k]; } }
        }
        var url = '';
        try{ url = typeof input === 'string' ? input : (input && input.url) || ''; }catch(e){}
        var sameOrigin = true;
        try{ sameOrigin = new URL(url, location.href).origin === location.origin; }catch(e){}
        isActionPost = method === 'POST' && !!na && sameOrigin;
      }catch(e){}
      var p = __ecbOrigFetch.apply(this, args);
      if(isActionPost){
        p.then(function(res){
          if(res && res.status >= 500 && !document.__ecbHealing && __ecbCanHeal()){
            document.__ecbHealing = true;
            setTimeout(function(){ location.reload(); }, 60);
          }
        }).catch(function(){});
      }
      return p;
    };
  }catch(e){}
  // ---- Mirror document.cookie into the proxy jar ----
  // Client-side auth flows often write cookies from JS. The webview may be
  // blocked from storing them (third-party partitioning), so we relay every
  // change up to the panel, which forwards it to the extension host.
  var __ecbLastDc = null;
  setInterval(function(){
    try{
      var dc = document.cookie;
      if(dc !== __ecbLastDc){
        var changed = (__ecbLastDc !== null);
        __ecbLastDc = dc;
        parent.postMessage({ __ecbCookies:true, cookie:dc, url:location.href, first:!changed }, '*');
      }
    }catch(e){}
  }, 1500);
  // ---- Hand cross-origin navigations to the system browser ----
  // OAuth/SSO providers (Google, GitHub\u2026) refuse to render inside our
  // iframe (X-Frame-Options). Intercept link clicks and window.open calls
  // that leave our origin and let the user finish those flows externally.
  document.addEventListener('click', function(e){
    try{
      var t = e.target;
      var a = t && t.closest ? t.closest('a[href]') : null;
      if(!a) return;
      var href = a.getAttribute('href') || '';
      if(!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return;
      var u = new URL(a.href, location.href);
      if(u.origin !== location.origin && (u.protocol === 'http:' || u.protocol === 'https:')){
        e.preventDefault(); e.stopPropagation();
        parent.postMessage({ __ecbExternal:true, url: u.href }, '*');
      }
    }catch(err){}
  }, true);
  try{
    var __ecbOrigOpen = window.open;
    window.open = function(u){
      try{
        var uu = new URL(u, location.href);
        if(uu.origin !== location.origin){
          parent.postMessage({ __ecbExternal:true, url: uu.href }, '*');
          return null;
        }
      }catch(e){}
      return __ecbOrigOpen.apply(this, arguments);
    };
  }catch(e){}
  // ---- Report every navigation so the toolbar URL stays in sync ----
  function __ecbReportUrl(){
    try{ parent.postMessage({ __ecbUrl:true, url: location.href }, '*'); }catch(e){}
  }
  window.addEventListener('load', __ecbReportUrl);
  window.addEventListener('popstate', __ecbReportUrl);
  try{
    var __ecbPs = history.pushState, __ecbRs = history.replaceState;
    history.pushState = function(){ var r = __ecbPs.apply(this, arguments); setTimeout(__ecbReportUrl, 0); return r; };
    history.replaceState = function(){ var r = __ecbRs.apply(this, arguments); setTimeout(__ecbReportUrl, 0); return r; };
  }catch(e){}
  setInterval(__ecbReportUrl, 1200);
})();
</script>`;
