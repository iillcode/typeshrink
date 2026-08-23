/** Injected into every HTML response served through the proxy.
 *  Provides: inspect-mode element capture, URL-change reporting,
 *  document.cookie mirroring and cross-origin navigation hand-off. */
export const INJECT_SCRIPT = `
<script>
(function(){
  if (window.__ecbInstalled) return; window.__ecbInstalled = true;
  // Inspect selection mode is OFF by default; the topbar message icon toggles it
  var mode = false;
  window.addEventListener('message', function(ev){
    try{
      var m = ev.data;
      if(m && m.__ecb === 'mode'){
        mode = !!m.enabled;
        document.documentElement.classList.toggle('__ecb-inspect', mode);
        if(!mode){ clearHover(); }
      }
    }catch(e){}
  });
  function getXPath(el){ if(el.id) return '//*[@id="'+el.id+'"]'; const parts=[]; while(el && el.nodeType===1 && el!==document.body){ let i=1,s=el.previousElementSibling; while(s){ if(s.tagName===el.tagName)i++; s=s.previousElementSibling;} parts.unshift(el.tagName.toLowerCase()+'['+i+']'); el=el.parentElement;} return '/body/'+parts.join('/'); }
  function getCss(el){ if(el.id) return '#'+CSS.escape(el.id); const parts=[]; let n=el; while(n && n!==document.documentElement && parts.length<6){ let s=n.tagName.toLowerCase(); if(n.classList && n.classList.length) s+='.'+[...n.classList].map(c=>CSS.escape(c)).join('.'); let i=1,sib=n.previousElementSibling; while(sib){ if(sib.tagName===n.tagName)i++; sib=sib.previousElementSibling;} if(i>1)s+=':nth-of-type('+i+')'; parts.unshift(s); n=n.parentElement;} return parts.reverse().join(' > '); }
  // ================= Rich element context collection =================
  var MATCHED_LIMIT = 80, INHERITED_LIMIT = 40, RULE_TEXT_LIMIT = 700;
  var INHERITED_PROPS = ['color', 'font-family', 'font-size', 'line-height', 'letter-spacing', 'text-align'];
  var COMPUTED_PROPS = ['box-sizing', 'display', 'position', 'margin', 'margin-inline-start', 'margin-inline-end',
    'padding', 'border-width', 'border-style', 'border-color', 'align-items', 'justify-content', 'gap',
    'background-color', 'color', 'font-family', 'font-feature-settings', 'font-size', 'line-height',
    'flex-basis', 'flex-grow', 'flex-shrink', 'width', 'height', 'max-width', 'min-height',
    'overflow', 'z-index', 'opacity', 'outline-color', 'tab-size', 'unicode-bidi'];

  // Pure-universal selectors match every element ("*", "::before",
  // "*, ::after, ::backdrop", "*:where(...)"…) — they carry preflight resets,
  // not element-specific info. A part qualifies when it is only a star and/or
  // chained pseudo-classes/pseudo-elements (no class/id/tag/attribute).
  function isUniversalSelector(sel){
    var parts = String(sel).split(',');
    if(!parts.length) return false;
    for(var i = 0; i < parts.length; i++){
      var p = parts[i].trim().replace(/^\\*/, '');
      if(p === '') continue;
      if(!/^(:{1,2}[a-zA-Z][a-zA-Z-]*(\([^()]*\))?)+$/.test(p)) return false;
    }
    return true;
  }

  function ruleLines(rule, prefixComment){
    try{
      var st = rule.style;
      if(!st || !st.length) return null;
      var out = [];
      var sel = prefixComment ? ('/* ' + prefixComment + ' */ ' + rule.selectorText) : rule.selectorText;
      out.push(sel + ' {');
      for(var i = 0; i < st.length; i++){
        var pr = st.item(i);
        var v = st.getPropertyValue(pr);
        if(!v || !v.trim()) continue; // drop empty-value longhands
        if(v.length > RULE_TEXT_LIMIT) v = v.substring(0, RULE_TEXT_LIMIT) + '…';
        out.push('  ' + pr + ': ' + v + ';');
      }
      out.push('}');
      if(out.length <= 2) return null; // nothing usable declared
      return out;
    }catch(e){ return null; }
  }

  function collectCss(el){
    var matched = [], inherited = [];
    try{
      for(var s = 0; s < document.styleSheets.length; s++){
        try{
          // Skip our own inspection stylesheet (cursor/highlight rules)
          if(document.styleSheets[s].ownerNode && document.styleSheets[s].ownerNode.id === '__ecb-style') continue;
        }catch(eSkip){}
        var rules;
        try{ rules = document.styleSheets[s].cssRules; }catch(err){ continue; } // cross-origin sheet
        if(!rules) continue;
        // Generic descent: Tailwind v4 wraps utilities in @layer, apps use
        // @media/@supports/@container — ALL of these expose .cssRules, so
        // recurse into every grouping rule instead of hard-coding types.
        (function walk(list){
          for(var r = 0; r < list.length; r++){
            var rule = list[r];
            if(rule.selectorText && rule.style && !isUniversalSelector(rule.selectorText)){
              var hit = false;
              try{ hit = el.matches(rule.selectorText); }catch(e){}
              if(hit){
                if(matched.length < MATCHED_LIMIT){
                  var L = ruleLines(rule);
                  if(L) matched.push(L.join('\\n'));
                }
              } else if(inherited.length < INHERITED_LIMIT){
                var hasInh = false;
                for(var q = 0; q < rule.style.length; q++){
                  if(INHERITED_PROPS.indexOf(rule.style.item(q)) >= 0){ hasInh = true; break; }
                }
                if(hasInh){
                  for(var anc = el.parentElement; anc && anc.nodeType === 1; anc = anc.parentElement){
                    var ahit = false;
                    try{ ahit = anc.matches(rule.selectorText); }catch(e2){}
                    if(ahit){
                      var L2 = ruleLines(rule, anc.tagName.toLowerCase() + (anc.id ? '#' + anc.id : ''));
                      if(L2) inherited.push(L2.join('\\n'));
                      break;
                    }
                  }
                }
              }
            }
            try{
              if(rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
            }catch(eInner){}
          }
        })(rules);
      }
    }catch(e){}
    return { m: matched, i: inherited };
  }

  function collectComputed(el){
    try{
      var cs = getComputedStyle(el);
      var res = [];
      for(var i = 0; i < COMPUTED_PROPS.length; i++){
        var p = COMPUTED_PROPS[i];
        var v = cs.getPropertyValue(p);
        if(v) res.push(p + ': ' + v + ';');
      }
      var vars = [];
      for(var j = 0; j < cs.length && vars.length < 40; j++){
        var pn = cs[j];
        if(pn.indexOf('--') === 0) vars.push(pn + ': ' + cs.getPropertyValue(pn) + ';');
      }
      return { res: res, vars: vars };
    }catch(e){ return { res: [], vars: [] }; }
  }

  function reactSource(el){
    try{
      var k = Object.keys(el).find(function(x){ return x.indexOf('__reactFiber$') === 0; });
      var f = k ? el[k] : null;
      while(f){
        if(f._debugSource) return { file: f._debugSource.fileName, line: f._debugSource.lineNumber };
        f = f.return;
      }
    }catch(e){}
    return null;
  }

  function report(el){
    try{
      var box = el.getBoundingClientRect();
      // Strip our own inspection artifacts so captures match the real DOM
      function cleanClasses(el2){
        return [].slice.call(el2.classList).filter(function(c){ return c.indexOf('__ecb') !== 0; });
      }
      var htmlPathParts = [];
      var n = el, depth = 0;
      while(n && n.nodeType === 1 && n.tagName !== 'BODY' && n.tagName !== 'HTML' && depth < 12){
        var part = n.tagName.toLowerCase();
        var cls = cleanClasses(n);
        if(cls.length) part += '.' + cls.join('.');
        htmlPathParts.unshift(part);
        n = n.parentElement;
        depth++;
      }
      var css = collectCss(el);
      var comp = collectComputed(el);
      // Keep only variables actually referenced by this element's matched /
      // inherited / resolved values — mirrors DevTools' curated var list.
      (function(){
        var refText = (css.m || []).concat(css.i || []).concat(comp.res || []).join('\\n');
        var used = {}, mm;
        var re = new RegExp('var\\\\((--[a-zA-Z0-9_-]+)', 'g');
        while((mm = re.exec(refText))) used[mm[1]] = true;
        var filtered = [], fallback = [];
        for(var i = 0; i < comp.vars.length; i++){
          var entry = comp.vars[i];
          var name = entry.split(':')[0];
          if(used[name]) filtered.push(entry);
          else if(name.indexOf('--tw-') !== 0) fallback.push(entry);
        }
        if(!filtered.length && fallback.length > 12) fallback = fallback.slice(0, 12);
        comp.vars = filtered.length ? filtered : fallback;
        comp.vars.sort();
      })();
      var cleanClassName = cleanClasses(el).join(' ');
      var data = {
        tag: el.tagName.toLowerCase(), id: el.id||'',
        className: cleanClassName,
        text:(el.textContent||'').trim().substring(0,100),
        xpath:getXPath(el), cssSelector:getCss(el),
        outerHTML: el.outerHTML.replace(/ __ecb-hl/g, '').replace(/__ecb-hl /g, '').substring(0, 8000),
        rect:{x:Math.round(box.x),y:Math.round(box.y),w:Math.round(box.width),h:Math.round(box.height)},
        url: location.href,
        htmlPath: htmlPathParts.join(' > ') || '/body/' + (el.tagName.toLowerCase()),
        cssMatched: css.m,
        cssInherited: css.i,
        cssResolved: comp.res,
        cssVars: comp.vars,
        source: reactSource(el)
      };
      parent.postMessage({ __ecb: true, data: data }, '*');
    }catch(e){}
  }
  document.addEventListener('click', function(e){
    if(!mode) return; // inspect mode off -> let the app behave normally
    e.preventDefault(); e.stopPropagation();
    const el = e.target;
    if(!el || el.nodeType !== 1) return;
    clearHover();
    report(el); // capture CLEAN element state BEFORE any visual mutation
    document.querySelectorAll('.__ecb-hl').forEach(n=>{n.classList.remove('__ecb-hl');});
    el.classList.add('__ecb-hl');
    setTimeout(function(){ el.classList.remove('__ecb-hl'); }, 1200);
  }, true);
  // ---- Hover selection indicator ----
  var hoverBox = null, hoverLabel = null;
  function ensureHoverUi(){
    if(hoverBox) return;
    hoverBox = document.createElement('div');
    hoverBox.className = '__ecb-hover';
    hoverLabel = document.createElement('div');
    hoverLabel.className = '__ecb-hover-label';
    hoverBox.appendChild(hoverLabel);
    (document.body || document.documentElement).appendChild(hoverBox);
  }
  function positionBox(box, r){
    box.style.left = (r.x - 2) + 'px';
    box.style.top  = (r.y - 2) + 'px';
    box.style.width = (r.width + 4) + 'px';
    box.style.height = (r.height + 4) + 'px';
  }
  function describe(el){
    var t = el.tagName.toLowerCase();
    var d = t;
    if(el.id) d += '#' + el.id;
    if(typeof el.className === 'string' && el.className.trim()){
      d += '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.');
    }
    return d;
  }
  function clearHover(){
    if(hoverBox){ hoverBox.style.display = 'none'; }
  }
  document.addEventListener('mousemove', function(e){
    if(!mode) return; // no hover indicator unless inspecting
    const el = e.target;
    if(!el || el.nodeType !== 1){ return; }
    ensureHoverUi();
    const box = el.getBoundingClientRect();
    positionBox(hoverBox, box);
    hoverBox.style.display = 'block';
    if(hoverLabel){ hoverLabel.textContent = describe(el); }
  }, true);
  document.addEventListener('scroll', clearHover, true);
  document.addEventListener('mouseleave', clearHover, true);
  var st = document.createElement('style');
  st.id = '__ecb-style';
  // Selection highlighter is white — stands out on any page.
  st.textContent = [
    '.__ecb-hl{outline:2px solid #FFFFFF !important;outline-offset:2px !important;}',
    '.__ecb-hover{',
    '  position:fixed;display:none;z-index:2147483647;',
    '  border:1.5px dashed rgba(255,255,255,.95);',
    '  background:rgba(255,255,255,.10);',
    '  pointer-events:none;',
    '}',
    '.__ecb-hover-label{',
    '  position:absolute;top:-22px;left:-1.5px;',
    '  font:11px/18px monospace;white-space:nowrap;',
    '  padding:0 6px;border-radius:3px;',
    '  color:#1E1F1C;background:#FFFFFF;',
    '}',
    'html.__ecb-inspect, html.__ecb-inspect *{cursor:crosshair !important;}'
  ].join('');
  document.head.appendChild(st);
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
  // OAuth/SSO providers (Google, GitHub…) refuse to render inside iframes
  // (X-Frame-Options). Intercept link clicks and window.open calls that
  // leave our origin and let the user finish those flows externally.
  document.addEventListener('click', function(e){
    try{
      if(mode) return; // inspect mode handles clicks itself
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
