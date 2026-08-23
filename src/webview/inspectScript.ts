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
        var wasMode = mode;
        mode = !!m.enabled;
        document.documentElement.classList.toggle('__ecb-inspect', mode);
        if(!mode){ clearHover(); }
        // Toggling the selector OFF cancels any active selection session
        if(wasMode && !mode && selEl){ clearSelection(); }
      }
      // ---- Design editor channel (sidebar property panel) ----
      if(m && m.__ecb === 'applyStyle'){ ecApplyStyle(m); }
      if(m && m.__ecb === 'getStyles'){ sendStylesSnapshot(); }
      if(m && m.__ecb === 'deselect'){ clearSelection(); }
      if(m && m.__ecb === 'editActive'){
        // Klone-style suppression (editor-iframe.ts selBoxHiddenUntil): EVERY
        // panel edit pushes the deadline out 1.5s; the pin loop hides the box
        // while the window is live and restores it automatically on expiry.
        selBoxHiddenUntil = Date.now() + 1500;
        updateSelBox();
      }
    }catch(e){}
  });
  // ================= Design editor support =================
  var ecbSeq = 0, lastSelected = null, lastEcbId = null, selEl = null, selBoxHiddenUntil = 0, selBoxEl = null;
  // ---- Persistent selection highlight: top-level overlay box (klone model) ----
  function ensureSelBox(){
    if(selBoxEl) return;
    var root = document.body || document.documentElement;
    if(!root) return; // body not parsed yet — pin loop retries
    selBoxEl = document.createElement('div');
    selBoxEl.id = '__ecb-selbox';
    selBoxEl.innerHTML = '<i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>';
    root.appendChild(selBoxEl);
  }
  function updateSelBox(){
    ensureSelBox();
    if(!selBoxEl) return;
    // Expired suppression window clears itself (no restore message needed).
    if(selBoxHiddenUntil && Date.now() >= selBoxHiddenUntil){ selBoxHiddenUntil = 0; }
    if(!selEl || !selEl.isConnected || selBoxHiddenUntil){
      if(selBoxEl.style.display !== 'none') selBoxEl.style.display = 'none';
      return;
    }
    var r = selEl.getBoundingClientRect();
    if(r.width === 0 && r.height === 0){
      if(selBoxEl.style.display !== 'none') selBoxEl.style.display = 'none';
      return;
    }
    selBoxEl.style.display = 'block';
    selBoxEl.style.left = (r.left - 3) + 'px';
    selBoxEl.style.top = (r.top - 3) + 'px';
    selBoxEl.style.width = (r.width + 6) + 'px';
    selBoxEl.style.height = (r.height + 6) + 'px';
  }
  (function pinSelBox(){ updateSelBox(); requestAnimationFrame(pinSelBox); })();
  function setSelected(el){
    selEl = el;
    lastSelected = el;
    lastEcbId = ensureEcbId(el);
    updateSelBox();
  }
  function clearSelection(){
    selEl = null; lastSelected = null; lastEcbId = null;
    updateSelBox();
    try{ parent.postMessage({ __ecbDesignCleared: true }, '*'); }catch(e){}
  }
  function camelize(s){ return String(s).replace(/-([a-z])/g, function(_, c){ return c.toUpperCase(); }); }
  var DESIGN_PROPS = ['width','height','min-width','min-height','max-width','opacity','visibility',
    'mix-blend-mode','background-color','background-image','background-blend-mode','color',
    'border-radius','border-top-left-radius','border-top-right-radius','border-bottom-left-radius','border-bottom-right-radius',
    'border-top-width','border-right-width','border-bottom-width','border-left-width',
    'border-top-color','border-right-color','border-bottom-color','border-left-color',
    'border-top-style','border-right-style','border-bottom-style','border-left-style',
    'box-shadow','font-family','font-weight','font-size','font-style','line-height','letter-spacing',
    'direction','text-align','vertical-align','text-transform','text-decoration-line','text-overflow',
    'white-space','overflow','transform'];
  function collectDesignStyles(el){
    try{
      var cs = getComputedStyle(el), o = {};
      for(var i = 0; i < DESIGN_PROPS.length; i++){
        var p = DESIGN_PROPS[i], v = '';
        try{ v = cs.getPropertyValue(p); }catch(e){}
        if(v) o[camelize(p)] = v;
      }
      return o;
    }catch(e){ return {}; }
  }
  function decomposeTransform(t){
    var res = { tx: 0, ty: 0, rot: 0, sx: 1, sy: 1 };
    if(!t || t === 'none') return res;
    var tr = t.match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/);
    if(tr){ res.tx = parseFloat(tr[1]) || 0; res.ty = parseFloat(tr[2]) || 0; }
    var m = t.match(/matrix(?:3d)?\\(([^)]+)\\)/);
    if(m){
      var parts = m[1].split(',').map(function(p){ return parseFloat(p); });
      if(parts.length >= 6){
        var a, b, c, d;
        if(parts.length === 16){ res.tx = parts[12] || res.tx; res.ty = parts[13] || res.ty; a = parts[0]; b = parts[1]; c = parts[4]; d = parts[5]; }
        else { res.tx = parts[4] || res.tx; res.ty = parts[5] || res.ty; a = parts[0]; b = parts[1]; c = parts[2]; d = parts[3]; }
        res.rot = Math.round(Math.atan2(b, a) * 180 / Math.PI);
        res.sx = Math.sqrt(a * a + b * b) || 1;
        res.sy = Math.sqrt(c * c + d * d) || 1;
        // A negative determinant means one axis is flipped (scale(-1, 1)).
        if ((a * d - b * c) < 0) res.sy = -res.sy;
      }
    }
    return res;
  }
  function findTargetEl(cmd){
    if(cmd && cmd.ecbId){
      try{ var el = document.querySelector('[data-ecb-id="' + cmd.ecbId + '"]'); if(el) return el; }catch(e){}
    }
    if(cmd && cmd.selector){ try{ var el2 = document.querySelector(cmd.selector); if(el2) return el2; }catch(e){} }
    if(lastSelected && lastSelected.isConnected) return lastSelected;
    return null;
  }
  function ensureEcbId(el){
    var id = el.getAttribute('data-ecb-id');
    if(!id){ id = 'ecb-' + (++ecbSeq) + '-' + Date.now().toString(36); el.setAttribute('data-ecb-id', id); }
    return id;
  }
  function sendStylesSnapshot(){
    var el = (lastSelected && lastSelected.isConnected) ? lastSelected : null;
    if(!el && lastEcbId){ try{ el = document.querySelector('[data-ecb-id="' + lastEcbId + '"]'); }catch(e){} }
    if(!el) return;
    lastEcbId = ensureEcbId(el);
    parent.postMessage({ __ecbStyles: true, data: { ecbId: lastEcbId, tag: el.tagName.toLowerCase(), selector: getCss(el), styles: collectDesignStyles(el) } }, '*');
  }
  function ecApplyStyle(cmd){
    var el = findTargetEl(cmd);
    if(!el || !cmd || !cmd.prop) return;
    var prop = String(cmd.prop), value = cmd.value;
    // Non-replaced INLINE elements ignore transforms entirely — promote them
    // to inline-block when a geometry property needs room to move.
    var isGeo = (prop === 'transform' || prop === 'rotate' || prop === 'scaleX' || prop === 'scaleY' ||
                 prop === 'width' || prop === 'height' || prop === 'minWidth' || prop === 'minHeight' || prop === 'maxWidth');
    if(isGeo){
      try{
        if(getComputedStyle(el).display === 'inline'){
          el.style.setProperty('display', 'inline-block', 'important');
        }
      }catch(eI){}
    }
    if(prop === 'transform' || prop === 'rotate' || prop === 'scaleX' || prop === 'scaleY'){
      var d = decomposeTransform(getComputedStyle(el).transform);
      if(prop === 'transform'){
        if(cmd.x !== undefined) d.tx = Number(cmd.x) || 0;
        if(cmd.y !== undefined) d.ty = Number(cmd.y) || 0;
      }
      if(prop === 'rotate'){ d.rot = parseFloat(value) || 0; }
      if(prop === 'scaleX'){ d.sx = parseFloat(value) || 1; }
      if(prop === 'scaleY'){ d.sy = parseFloat(value) || 1; }
      var t = 'translate(' + d.tx + 'px, ' + d.ty + 'px)';
      if(d.rot) t += ' rotate(' + d.rot + 'deg)';
      if(d.sx !== 1 || d.sy !== 1) t += ' scale(' + d.sx + ', ' + d.sy + ')';
      el.style.setProperty('transform', t, 'important');
    } else {
      var cssProp = prop.replace(/[A-Z]/g, function(c){ return '-' + c.toLowerCase(); });
      // '!important' so site stylesheets (utility classes etc.) can never
      // silently swallow our edit.
      el.style.setProperty(cssProp, value, 'important');
    }
    lastSelected = el;
    lastEcbId = ensureEcbId(el);
    setSelected(el);
    sendStylesSnapshot();
  }

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
      // Design editor hooks: tag the element + attach a style snapshot
      try{
        data.ecbId = ensureEcbId(el);
        lastSelected = el; lastEcbId = data.ecbId;
        data.styles = collectDesignStyles(el);
        setSelected(el); // persistent highlight until editing ends
      }catch(eD){}
      parent.postMessage({ __ecb: true, data: data }, '*');
    }catch(e){}
  }
  document.addEventListener('click', function(e){
    if(!mode) return; // inspect mode off -> let the app behave normally
    e.preventDefault(); e.stopPropagation();
    const el = e.target;
    if(!el || el.nodeType !== 1) return;
    clearHover();
    // Editing-session rules: clicking the selected element again or any
    // background/body area ends the session instead of picking a new target.
    if(selEl && el === selEl){ clearSelection(); return; }
    if(el === document.body || el === document.documentElement){
      if(selEl){ clearSelection(); } return;
    }
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
    // Selection ring = dedicated top-level overlay (klone's selBoxEl model):
    // position:fixed + rAF pin means NO ancestor overflow can ever clip it,
    // so all four sides are always visible regardless of the element.
    '#__ecb-selbox{position:fixed;display:none;z-index:2147483647;pointer-events:none;border:2px solid #FFFFFF;box-shadow:0 0 0 3px rgba(255,255,255,.28);}',
    '#__ecb-selbox i{position:absolute;width:7px;height:7px;background:#FFFFFF;border:1px solid #1E1F1C;}',
    '#__ecb-selbox i.tl{left:-4px;top:-4px;}',
    '#__ecb-selbox i.tr{right:-4px;top:-4px;}',
    '#__ecb-selbox i.bl{left:-4px;bottom:-4px;}',
    '#__ecb-selbox i.br{right:-4px;bottom:-4px;}',
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
