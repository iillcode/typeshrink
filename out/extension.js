"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CookieJar = void 0;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const http = __importStar(require("http"));
function jarKey(c) {
    return `${c.domain ?? ''}|${c.path}|${c.name}`;
}
/** Parse one Set-Cookie line into a jar entry (scoped to the request URL). */
function parseSetCookieLine(line) {
    const semi = line.indexOf(';');
    const nv = semi === -1 ? line : line.slice(0, semi);
    const eq = nv.indexOf('=');
    if (eq < 1)
        return null;
    const name = nv.slice(0, eq).trim();
    let value = nv.slice(eq + 1).trim();
    if (!name)
        return null;
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
        value = value.slice(1, -1);
    }
    const c = { name, value, path: '/' };
    for (const rawAttr of line.split(';').slice(1)) {
        const i = rawAttr.indexOf('=');
        const k = (i === -1 ? rawAttr : rawAttr.slice(0, i)).trim().toLowerCase();
        const v = i === -1 ? '' : rawAttr.slice(i + 1).trim();
        if (k === 'expires') {
            const t = Date.parse(v);
            if (!Number.isNaN(t))
                c.expires = t;
        }
        else if (k === 'max-age') {
            const s = Number.parseInt(v, 10);
            if (!Number.isNaN(s)) {
                // Max-Age wins over Expires per RFC 6265
                c.expires = s <= 0 ? Date.now() - 1000 : Date.now() + s * 1000;
            }
        }
        else if (k === 'path') {
            c.path = v || '/';
        }
        else if (k === 'domain') {
            c.domain = v.replace(/^\./, '').toLowerCase();
        }
    }
    return c;
}
function domainMatches(cookieDomain, requestHost) {
    const host = requestHost.toLowerCase();
    if (!cookieDomain)
        return true; // host-only handled at insert time
    return host === cookieDomain || host.endsWith('.' + cookieDomain);
}
function pathMatches(cookiePath, requestPath) {
    if (cookiePath === '/')
        return true;
    if (!requestPath.startsWith(cookiePath))
        return false;
    return requestPath.length === cookiePath.length || requestPath[cookiePath.length] === '/';
}
class CookieJar {
    constructor() {
        this.cookies = new Map();
    }
    /** Feed every Set-Cookie line of a response (scoped to its request URL). */
    storeFromResponse(setCookieLines, requestUrl) {
        const host = requestUrl.hostname;
        for (const line of setCookieLines) {
            const c = parseSetCookieLine(line);
            if (!c)
                continue;
            // Host-only cookies must match the exact request host; Domain cookies
            // only apply if the request host is inside that domain.
            if (c.domain && !domainMatches(c.domain, host))
                continue;
            if (!c.domain && host !== host.toLowerCase())
                continue;
            this.cookies.set(jarKey({ ...c, domain: c.domain ?? host }), {
                ...c,
                domain: c.domain ?? host,
            });
        }
        this.sweep();
    }
    /** Cookie header value for a request URL, or undefined when empty. */
    headerFor(requestUrl) {
        this.sweep();
        const host = requestUrl.hostname;
        const out = [];
        for (const c of this.cookies.values()) {
            if (c.expires !== undefined && c.expires <= Date.now())
                continue;
            if (!domainMatches(c.domain, host))
                continue;
            // Host-only cookies match exactly; Domain cookies matched above.
            if (c.domain && c.domain !== host && !host.endsWith('.' + c.domain))
                continue;
            if (!pathMatches(c.path, requestUrl.pathname || '/'))
                continue;
            out.push(`${c.name}=${c.value}`);
        }
        return out.length ? out.join('; ') : undefined;
    }
    sweep() {
        const now = Date.now();
        for (const [k, c] of this.cookies) {
            if (c.expires !== undefined && c.expires <= now)
                this.cookies.delete(k);
        }
    }
    clear() {
        this.cookies.clear();
    }
    get size() {
        this.sweep();
        return this.cookies.size;
    }
    toJSON() {
        return [...this.cookies.values()];
    }
    load(list) {
        for (const c of list)
            this.cookies.set(jarKey(c), c);
    }
}
exports.CookieJar = CookieJar;
/** Combine the browser's own Cookie header (best-effort) with the jar's —
 *  jar entries win so server-side rotations always take effect. */
function mergeCookieHeaders(existing, jar, url) {
    const map = new Map();
    if (existing) {
        for (const pair of existing.split(';')) {
            const i = pair.indexOf('=');
            if (i > 0)
                map.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
        }
    }
    const jarHeader = jar?.headerFor(url);
    if (jarHeader) {
        for (const pair of jarHeader.split('; ')) {
            const i = pair.indexOf('=');
            if (i > 0)
                map.set(pair.slice(0, i), pair.slice(i + 1));
        }
    }
    if (!map.size)
        return undefined;
    return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
/**
 * Rebuild the upstream header set for the proxied response. Forwards ALL
 * application-level headers — critically `set-cookie` (auth sessions die
 * without it), `cache-control`, CORS — and drops only transport headers that
 * fetch already consumed (content-encoding is decoded by undici, hop-by-hop
 * framing) plus CSP when we inject our script into the page.
 */
function collectResponseHeaders(upstream, injectedHtml) {
    const h = {};
    upstream.headers.forEach((v, k) => {
        const key = k.toLowerCase();
        if (key === 'content-encoding' ||
            key === 'transfer-encoding' ||
            key === 'connection' ||
            key === 'keep-alive' ||
            key === 'content-length') {
            return;
        }
        if (key === 'set-cookie')
            return; // handled below (multi-value)
        if (key === 'content-security-policy' && injectedHtml)
            return;
        h[k] = v;
    });
    // headers.forEach() collapses multiple Set-Cookie lines into one comma-
    // joined string, which breaks cookies containing Expires dates. Pull each
    // Set-Cookie separately via getSetCookie() so every session cookie lands.
    const getSetCookie = upstream.headers.getSetCookie;
    const cookies = typeof getSetCookie === 'function' ? getSetCookie.call(upstream.headers) : [];
    if (cookies.length)
        h['set-cookie'] = cookies;
    return h;
}
const INJECT_SCRIPT = `
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
  function report(el){
    try{
      const box = el.getBoundingClientRect();
      const data = {
        tag: el.tagName.toLowerCase(), id: el.id||'',
        className: typeof el.className==='string'?el.className:'',
        text:(el.textContent||'').trim().substring(0,100),
        xpath:getXPath(el), cssSelector:getCss(el),
        outerHTML: el.outerHTML.substring(0,500),
        rect:{x:Math.round(box.x),y:Math.round(box.y),w:Math.round(box.width),h:Math.round(box.height)},
        url: location.href
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
    document.querySelectorAll('.__ecb-hl').forEach(n=>{n.classList.remove('__ecb-hl');});
    el.classList.add('__ecb-hl');
    setTimeout(function(){ el.classList.remove('__ecb-hl'); }, 1200);
    report(el);
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
  st.textContent = [
    '.__ecb-hl{outline:2px solid #007acc !important;outline-offset:2px !important;}',
    '.__ecb-hover{',
    '  position:fixed;display:none;z-index:2147483647;',
    '  border:1.5px dashed rgba(0,174,239,.95);',
    '  background:rgba(0,174,239,.08);',
    '  pointer-events:none;',
    '}',
    '.__ecb-hover-label{',
    '  position:absolute;top:-22px;left:-1.5px;',
    '  font:11px/18px monospace;white-space:nowrap;',
    '  padding:0 6px;border-radius:3px;',
    '  color:#fff;background:#00aef0;',
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
})();
</script>`;
class InjectingProxy {
    constructor(jar) {
        this.wsTarget = '';
        this.port = 0;
        this.jar = jar;
    }
    start(targetOrigin) {
        this.wsTarget = targetOrigin;
        return new Promise((resolve, reject) => {
            this.server = http.createServer(async (req, res) => {
                try {
                    // Direct passthrough: any path/query on this proxy maps 1:1 onto the target origin,
                    // so all relative URLs inside the app keep working without any rewriting.
                    const targetUrl = new URL(req.url ?? '/', targetOrigin);
                    // Forward ALL request headers except hop-by-hop ones. Critical for
                    // Next.js Server Actions: the action id travels in the `next-action`
                    // header — dropping it makes Next.js fail with "Failed to find
                    // Server Action" on form POSTs (e.g. /login).
                    const skipReqHeaders = new Set([
                        'host', 'connection', 'keep-alive', 'transfer-encoding',
                        'upgrade', 'content-length', 'accept-encoding'
                    ]);
                    const headers = {};
                    for (const [k, v] of Object.entries(req.headers)) {
                        const key = k.toLowerCase();
                        if (!skipReqHeaders.has(key)) {
                            headers[key] = Array.isArray(v) ? v.join(', ') : String(v);
                        }
                    }
                    // Inject the jar's cookies into the request (merging over whatever
                    // the browser managed to store) so logins survive webview cookie
                    // partitioning/blocking.
                    const mergedCookie = mergeCookieHeaders(headers['cookie'], this.jar, targetUrl);
                    if (mergedCookie) {
                        headers['cookie'] = mergedCookie;
                    }
                    else {
                        delete headers['cookie'];
                    }
                    // Next.js validates Origin/Referer against Host for Server Actions
                    // (CSRF check) — rewrite both to the target origin so the proxied
                    // request looks like it came from the app itself.
                    headers['referer'] = targetUrl.origin + targetUrl.pathname;
                    headers['origin'] = targetUrl.origin;
                    const chunks = [];
                    req.on('data', c => chunks.push(c));
                    req.on('end', async () => {
                        try {
                            const upstream = await fetch(targetUrl.href, {
                                method: req.method,
                                headers,
                                body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
                                redirect: 'manual'
                            });
                            // Capture upstream Set-Cookie into the jar so the session lives
                            // proxy-side (webview iframes can't be relied on to store it).
                            const getSetCookie = upstream.headers.getSetCookie;
                            if (this.jar && typeof getSetCookie === 'function') {
                                const lines = getSetCookie.call(upstream.headers);
                                if (lines.length) {
                                    this.jar.storeFromResponse(lines, targetUrl);
                                    this.onJarChanged?.();
                                }
                            }
                            // Pass redirects through the proxy so browsing stays proxied.
                            // Keep the upstream status (303/307 carry method semantics that
                            // Server Actions rely on) and ALL headers — login flows set their
                            // session cookie on this redirect response.
                            if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.get('location')) {
                                const loc = new URL(upstream.headers.get('location'), targetUrl);
                                // Only rewrite same-origin redirect targets; cross-origin go direct
                                const locHeader = loc.origin === new URL(targetOrigin).origin
                                    ? loc.pathname + loc.search + loc.hash
                                    : loc.href;
                                const h = collectResponseHeaders(upstream, false);
                                h['location'] = locHeader;
                                res.writeHead(upstream.status, h);
                                res.end();
                                return;
                            }
                            const buf = Buffer.from(await upstream.arrayBuffer());
                            const ct = upstream.headers.get('content-type') ?? '';
                            // Inject capture script into HTML responses
                            if (ct.includes('text/html')) {
                                let html = buf.toString('utf8');
                                html = html.includes('</head>')
                                    ? html.replace('</head>', INJECT_SCRIPT + '</head>')
                                    : INJECT_SCRIPT + html;
                                const h = collectResponseHeaders(upstream, true);
                                h['content-length'] = Buffer.byteLength(html);
                                res.writeHead(upstream.status, h);
                                res.end(html);
                            }
                            else {
                                const h = collectResponseHeaders(upstream, false);
                                h['content-length'] = buf.length;
                                res.writeHead(upstream.status, h);
                                res.end(buf);
                            }
                        }
                        catch (e) {
                            res.writeHead(502, { 'content-type': 'text/plain' });
                            res.end('Proxy error: ' + e.message);
                        }
                    });
                }
                catch (e) {
                    res.writeHead(500);
                    res.end('Bad request');
                }
            });
            // Tunnel WebSocket upgrades (Next.js HMR uses /_next/webpack-hmr over WS)
            this.server.on('upgrade', (req, socket, head) => {
                try {
                    const target = new URL(req.url ?? '/', this.wsTarget);
                    const headers = { ...req.headers };
                    headers.host = target.host;
                    delete headers.origin;
                    const upstream = http.request({
                        host: target.hostname,
                        port: target.port || 80,
                        path: target.pathname + target.search,
                        headers,
                    });
                    upstream.on('upgrade', (uRes, uSocket, uHead) => {
                        const respLines = [`HTTP/1.1 ${uRes.statusCode} ${uRes.statusMessage}`];
                        for (const [k, v] of Object.entries(uRes.headers)) {
                            if (v !== undefined)
                                respLines.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
                        }
                        socket.write(respLines.join('\r\n') + '\r\n\r\n');
                        if (uHead.length)
                            socket.write(uHead);
                        uSocket.pipe(socket);
                        socket.pipe(uSocket);
                    });
                    upstream.on('error', () => { try {
                        socket.destroy();
                    }
                    catch { /* noop */ } });
                    // Flush the initial WS payload as part of ending the request —
                    // calling .write() after .end() throws and silently kills the
                    // HMR tunnel, leaving stale pages without hot updates.
                    upstream.end(head.length ? head : undefined);
                }
                catch {
                    try {
                        socket.destroy();
                    }
                    catch { /* noop */ }
                }
            });
            this.server.listen(0, '127.0.0.1', () => {
                const addr = this.server.address();
                resolve(addr.port);
            });
            this.server.on('error', reject);
        });
    }
    dispose() {
        if (this.server)
            this.server.close();
    }
}
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
    try{ navigator.clipboard.writeText(v).catch(function(){}); }catch(e){}
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
// ---- Rich sidebar UI (Kilo Code style) ----
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function getSidebarHtml() {
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body{margin:0;padding:0;font-family:var(--vscode-font-family);font-size:13px;
    color:var(--vscode-foreground);background:var(--vscode-sideBar-background);}
  /* ---- Header ---- */
  #header{display:flex;align-items:center;gap:6px;padding:10px 12px;border-bottom:1px solid var(--vscode-panel-border);}
  #header h2{margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;flex:1;}
  .icon-btn{background:none;border:none;color:var(--vscode-foreground);opacity:.7;cursor:pointer;
    font-size:14px;padding:3px 6px;border-radius:4px;line-height:1;}
  .icon-btn:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground);}
  /* ---- Empty state ---- */
  #empty{display:flex;flex-direction:column;align-items:center;padding:48px 24px;text-align:center;gap:10px;}
  #empty .big{font-size:34px;opacity:.5;}
  #empty p{margin:0;opacity:.65;font-size:12px;line-height:1.5;}
  /* ---- Element cards ---- */
  #cards{overflow-y:auto;}
  .card{border-bottom:1px solid var(--vscode-panel-border);padding:9px 12px;cursor:pointer;}
  .card:hover{background:var(--vscode-list-hoverBackground);}
  .row{display:flex;align-items:center;gap:7px;}
  .tag-badge{font-family:monospace;font-size:11px;font-weight:600;padding:1px 6px;border-radius:3px;
    background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);}
  .snippet{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85;font-size:12px;}
  .chev{opacity:.5;font-size:11px;transition:transform .15s;}
  .card.open .chev{transform:rotate(90deg);}
  .detail{display:none;margin-top:8px;border-left:2px solid var(--vscode-focusBorder);padding-left:10px;}
  .card.open .detail{display:block;}
  .kv{margin:3px 0;font-size:11px;}
  .kv b{opacity:.6;font-weight:400;margin-right:5px;}
  code{font-family:var(--vscode-editor-font-family,monospace);font-size:11px;
    background:var(--vscode-textCodeBlock-background);padding:1px 4px;border-radius:3px;
    word-break:break-all;display:inline-block;max-width:100%;}
  .actions{display:flex;gap:6px;margin-top:7px;}
  .mini{font-size:10px;padding:2px 8px;border-radius:3px;border:1px solid var(--vscode-button-border,transparent);
    background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);
    cursor:pointer;}
  .mini:hover{background:var(--vscode-button-secondaryHoverBackground);}
  html{color-scheme:var(--vscode-color-scheme, dark);}
</style></head>
<body>
<div id="header">
  <h2>Element Browser</h2>
  <span id="count" style="font-size:11px;opacity:.6;"></span>
  <button class="icon-btn" id="clearBtn" title="Clear history">$(clear-all)🗑</button>
</div>
<div id="empty">
  <div class="big">🎯</div>
  <p><b>No elements captured yet.</b><br/>
  Start inspecting your app, then click any element in the browser panel — its details will appear here.</p>
  <button class="mini" id="startBtn">▶ Start Inspecting</button>
</div>
<div id="cards"></div>
<script>
  const vscode = acquireVsCodeApi();
  let history = [];
  const $ = id => document.getElementById(id);

  function render(){
    $('count').textContent = history.length ? history.length + ' captured' : '';
    $('empty').style.display = history.length ? 'none' : 'flex';
    const cards = $('cards'); cards.innerHTML = '';
    [...history].reverse().forEach((d) => {
      const card = document.createElement('div'); card.className = 'card';
      const row = document.createElement('div'); row.className = 'row';
      const tag = document.createElement('span'); tag.className = 'tag-badge'; tag.textContent = '<' + (d.tag||'?') + '>';
      const snip = document.createElement('span'); snip.className = 'snippet';
      snip.textContent = d.text ? '"' + d.text.slice(0,40) + '"' : (d.id ? '#'+d.id : d.cssSelector || '');
      snip.title = snip.textContent;
      const chev = document.createElement('span'); chev.className = 'chev'; chev.textContent = '▶';
      row.appendChild(tag); row.appendChild(snip); row.appendChild(chev);
      card.appendChild(row);

      const det = document.createElement('div'); det.className = 'detail';
      det.innerHTML =
        '<div class="kv"><b>ID</b>' + (d.id ? '<code>'+esc(d.id)+'</code>' : '<i style="opacity:.5">—</i>') + '</div>' +
        '<div class="kv"><b>CLASS</b>' + (d.className ? '<code>'+esc(d.className)+'</code>' : '<i style="opacity:.5">—</i>') + '</div>' +
        '<div class="kv"><b>XPATH</b><code>'+esc(d.xpath||'')+'</code></div>' +
        '<div class="kv"><b>CSS</b><code>'+esc(d.cssSelector||'')+'</code></div>';
      const actions = document.createElement('div'); actions.className = 'actions';
      actions.innerHTML = '<button class="mini" data-a="xpath">Copy XPath</button>' +
        '<button class="mini" data-a="css">Copy CSS</button>' +
        '<button class="mini" data-a="html">Copy HTML</button>' +
        '<button class="mini" data-a="details">Details…</button>';
      actions.querySelectorAll('.mini').forEach(btn => {
        btn.onclick = function(ev){
          ev.stopPropagation();
          const a = btn.getAttribute('data-a');
          if(a === 'xpath') vscode.postMessage({type:'copy', value:d.xpath||''});
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
  });
  $('clearBtn').onclick = () => vscode.postMessage({type:'clearHistory'});
  $('startBtn').onclick = () => vscode.postMessage({type:'start'});
  vscode.postMessage({type:'sidebarReady'});
</script>
</body></html>`;
}
// ---- Sidebar Webview View (rich UI like Kilo Code) — class defined inside activate() ----
function activate(context) {
    const outputChannel = vscode.window.createOutputChannel('Element Click Browser');
    let history = [];
    // ---- Persistent proxy cookie jars (login sessions survive reloads AND
    // VS Code restarts even though the webview iframe can't keep cookies) ----
    fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
    const jarsFile = path.join(context.globalStorageUri.fsPath, 'proxy-cookie-jars.json');
    const storedJars = new Map();
    const liveJars = new Map();
    try {
        if (fs.existsSync(jarsFile)) {
            const raw = JSON.parse(fs.readFileSync(jarsFile, 'utf8'));
            for (const [origin, list] of Object.entries(raw))
                storedJars.set(origin, list);
        }
    }
    catch (e) {
        outputChannel.appendLine('cookie-jar load failed: ' + e.message);
    }
    function getJar(origin) {
        let jar = liveJars.get(origin);
        if (!jar) {
            jar = new CookieJar();
            const saved = storedJars.get(origin);
            if (saved)
                jar.load(saved);
            liveJars.set(origin, jar);
        }
        return jar;
    }
    function dropJar(origin) {
        liveJars.delete(origin);
        storedJars.delete(origin);
        persistJars();
    }
    function persistJars() {
        try {
            const obj = {};
            for (const [origin, jar] of liveJars)
                obj[origin] = jar.toJSON();
            for (const [origin, list] of storedJars)
                if (!obj[origin])
                    obj[origin] = list;
            fs.writeFileSync(jarsFile, JSON.stringify(obj, null, 2));
        }
        catch (e) {
            outputChannel.appendLine('cookie-jar save failed: ' + e.message);
        }
    }
    // ---- Sidebar Webview View (rich UI like Kilo Code) ----
    class SidebarViewProvider {
        constructor(ctx) {
            this.ctx = ctx;
        }
        resolveWebviewView(view) {
            this.view = view;
            view.webview.options = { enableScripts: true };
            view.webview.html = getSidebarHtml();
            view.webview.onDidReceiveMessage((msg) => {
                if (msg.type === 'copy') {
                    void vscode.env.clipboard.writeText(msg.value);
                    vscode.window.showInformationMessage('Copied to clipboard');
                }
                else if (msg.type === 'showDetails') {
                    showDetails(msg.data, true);
                }
                else if (msg.type === 'clearHistory') {
                    history = [];
                    saveToFile();
                    treeProvider.refresh();
                    this.postUpdate();
                    vscode.window.showInformationMessage('Clicked elements history cleared.');
                }
                else if (msg.type === 'start') {
                    vscode.commands.executeCommand('elementClickBrowser.open');
                }
                else if (msg.type === 'sidebarReady') {
                    this.postUpdate();
                }
            });
            this.postUpdate();
        }
        postUpdate() {
            this.view?.webview.postMessage({ type: 'elements', history, count: history.length });
        }
        reveal() {
            if (this.view) {
                void this.view.show?.(true);
            }
            else {
                void vscode.commands.executeCommand('elementClickBrowser.sidebarView.focus');
            }
        }
    }
    SidebarViewProvider.viewId = 'elementClickBrowser.sidebarView';
    // ---- Helpers ----
    function saveToFile() {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws)
            return;
        try {
            fs.writeFileSync(path.join(ws.uri.fsPath, 'clicked-elements.json'), JSON.stringify(history, null, 2));
        }
        catch (e) {
            outputChannel.appendLine('saveToFile failed: ' + e.message);
        }
    }
    function showDetails(d, focus = false) {
        outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] Clicked <${d.tag}> ${d.id ? '#' + d.id : ''}`);
        outputChannel.appendLine(JSON.stringify(d, null, 2));
        if (focus)
            outputChannel.show(true);
    }
    async function copy(value) {
        if (!value)
            return;
        await vscode.env.clipboard.writeText(value);
        vscode.window.showInformationMessage(`Copied: ${value}`);
    }
    function shortUrl(u) {
        try {
            const p = new URL(u);
            return p.host + p.pathname;
        }
        catch {
            return u;
        }
    }
    // ---- Tree data provider for sidebar view ----
    class ElementsTreeProvider {
        constructor() {
            this._onDidChange = new vscode.EventEmitter();
            this.onDidChangeTreeData = this._onDidChange.event;
        }
        refresh() { this._onDidChange.fire(); }
        getTreeItem(item) { return item; }
        getChildren(el) {
            if (!el) {
                if (history.length === 0) {
                    return [new ElementItem({
                            tag: 'No elements yet', id: '', className: '', text: 'Click elements in the browser panel',
                            xpath: '', cssSelector: '', outerHTML: '', timestamp: 0
                        }, 0, true)];
                }
                return history.map((d, i) => new ElementItem(d, i));
            }
            return [];
        }
    }
    class ElementItem extends vscode.TreeItem {
        constructor(d, index, placeholder = false) {
            const label = placeholder
                ? d.tag
                : `${index + 1}. <${d.tag}> ${[d.id ? '#' + d.id : '', d.className ? '.' + d.className.trim().split(/\\s+/)[0] : '', d.text ? `"${d.text.slice(0, 24)}"` : ''].filter(Boolean).join(' ')}`.slice(0, 70);
            super(label, vscode.TreeItemCollapsibleState.None);
            this.xpath = '';
            this.cssSelector = '';
            if (placeholder) {
                this.tooltip = d.text;
                return;
            }
            const label2 = [d.id ? '#' + d.id : '', d.className ? '.' + d.className.trim().split(/\\s+/)[0] : '', d.text ? `"${d.text.slice(0, 24)}"` : '']
                .filter(Boolean).join(' ');
            void label2;
            this.description = shortUrl(d.url ?? '');
            const md = new vscode.MarkdownString();
            md.appendMarkdown([
                `**<${d.tag}>** ${d.id ? '`#' + d.id + '`' : ''} ${d.className ? '`.' + d.className.split(' ').join('`.`') + '`' : ''}`,
                '',
                d.text ? `📝 ${d.text.slice(0, 80)}\n` : '',
                '---',
                `- **XPath:** \`${d.xpath}\``,
                `- **CSS:** \`${d.cssSelector}\``,
                '',
                '```html',
                d.outerHTML.slice(0, 200),
                '```'
            ].join('\n'));
            md.supportHtml = true;
            this.tooltip = md;
            this.iconPath = new vscode.ThemeIcon('symbol-tag');
            this.contextValue = 'clickedElement';
            this.xpath = d.xpath;
            this.cssSelector = d.cssSelector;
            this.command = {
                command: 'elementClickBrowser.showDetails',
                title: 'Show Details',
                arguments: [d]
            };
        }
    }
    const treeProvider = new ElementsTreeProvider();
    const sidebarProvider = new SidebarViewProvider(context);
    // ---- (CDP inspector removed — now using InjectingProxy + webview) ----
    context.subscriptions.push(outputChannel, vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewId, sidebarProvider, {
        webviewOptions: { retainContextWhenHidden: true }
    }), vscode.window.registerTreeDataProvider('elementClickBrowser.elementsView', treeProvider), vscode.commands.registerCommand('elementClickBrowser.open', async () => {
        const urlInput = await vscode.window.showInputBox({
            prompt: 'Enter the URL of your app (e.g. http://localhost:3000)',
            value: 'http://localhost:3000',
            ignoreFocusOut: true
        });
        if (!urlInput)
            return;
        let targetOrigin;
        try {
            targetOrigin = new URL(urlInput).origin;
        }
        catch {
            vscode.window.showErrorMessage('Invalid URL.');
            return;
        }
        try {
            const proxy = new InjectingProxy(getJar(targetOrigin));
            proxy.onJarChanged = persistJars;
            const proxyPort = await proxy.start(targetOrigin);
            outputChannel.appendLine(`Proxy running on http://127.0.0.1:${proxyPort} -> ${targetOrigin} (jar: ${proxy.jar?.size ?? 0} cookies)`);
            const panel = vscode.window.createWebviewPanel('elementClickBrowser', `Element Browser — ${urlInput}`, vscode.ViewColumn.One, { enableScripts: true });
            panel.webview.html = getWebviewHtml(proxyPort);
            let ready = false;
            panel.webview.onDidReceiveMessage((msg) => {
                if (msg.type === 'elementClicked') {
                    const d = msg.data;
                    d.timestamp = Date.now();
                    history.push(d);
                    saveToFile();
                    showDetails(d); // logs silently — never steals focus
                    sidebarProvider.postUpdate();
                }
                else if (msg.type === 'showDetails') {
                    showDetails(msg.data);
                }
                else if (msg.type === 'pageInfo') {
                    const u = msg.url || 'No page loaded yet.';
                    vscode.window.showInformationMessage(`Page: ${u} | ${history.length} element(s) captured`, 'Clear history')
                        .then(pick => { if (pick === 'Clear history')
                        vscode.commands.executeCommand('elementClickBrowser.clearHistory'); });
                }
                else if (msg.type === 'ready' && !ready) {
                    ready = true;
                    panel.webview.postMessage({ type: 'load', url: urlInput });
                }
            }, undefined, context.subscriptions);
            panel.onDidDispose(() => proxy.dispose(), undefined, context.subscriptions);
            panel.webview.postMessage({ type: 'load', url: urlInput });
            sidebarProvider.reveal();
            vscode.window.showInformationMessage(`Inspecting ${urlInput} — click any element in the browser panel.`);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to start inspector: ${err.message}`);
        }
    }), vscode.commands.registerCommand('elementClickBrowser.stop', () => {
        vscode.window.showInformationMessage('Close the Element Browser tab to stop inspecting.');
    }), vscode.commands.registerCommand('elementClickBrowser.clearSession', async () => {
        const originInput = await vscode.window.showInputBox({
            prompt: 'Clear the saved login session for which origin? (leave empty to clear ALL)',
            value: 'http://localhost:3000',
            ignoreFocusOut: true
        });
        if (originInput === undefined)
            return;
        if (originInput.trim() === '') {
            for (const origin of [...liveJars.keys(), ...storedJars.keys()])
                dropJar(origin);
            liveJars.clear();
            storedJars.clear();
            persistJars();
            vscode.window.showInformationMessage('All saved proxy sessions cleared. Reload the Element Browser to log in fresh.');
            return;
        }
        try {
            const origin = new URL(originInput.trim()).origin;
            dropJar(origin);
            vscode.window.showInformationMessage(`Saved session for ${origin} cleared.`);
        }
        catch {
            vscode.window.showErrorMessage('Invalid URL.');
        }
    }), vscode.commands.registerCommand('elementClickBrowser.clearHistory', () => {
        history = [];
        treeProvider.refresh();
        saveToFile();
        sidebarProvider.postUpdate();
        vscode.window.showInformationMessage('Clicked elements history cleared.');
    }), vscode.commands.registerCommand('elementClickBrowser.showDetails', showDetails), vscode.commands.registerCommand('elementClickBrowser.copyXPath', (item) => copy(item.xpath)), vscode.commands.registerCommand('elementClickBrowser.copySelector', (item) => copy(item.cssSelector)));
    context.subscriptions.push({ dispose: () => { } });
}
function deactivate() { }
//# sourceMappingURL=extension.js.map