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
const http = __importStar(require("http"));
// ===================== Reverse Proxy with Script Injection =====================
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
})();
</script>`;
class InjectingProxy {
    constructor() {
        this.wsTarget = '';
        this.port = 0;
    }
    start(targetOrigin) {
        this.wsTarget = targetOrigin;
        return new Promise((resolve, reject) => {
            this.server = http.createServer(async (req, res) => {
                try {
                    // Direct passthrough: any path/query on this proxy maps 1:1 onto the target origin,
                    // so all relative URLs inside the app keep working without any rewriting.
                    const targetUrl = new URL(req.url ?? '/', targetOrigin);
                    const headers = { accept: req.headers.accept ?? '*/*', referer: targetUrl.origin };
                    if (req.headers['content-type'])
                        headers['content-type'] = String(req.headers['content-type']);
                    if (req.headers.cookie)
                        headers['cookie'] = String(req.headers.cookie);
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
                            // Pass redirects through the proxy so browsing stays proxied
                            if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.get('location')) {
                                const loc = new URL(upstream.headers.get('location'), targetUrl);
                                // Only rewrite same-origin redirect targets; cross-origin go direct
                                const locHeader = loc.origin === new URL(targetOrigin).origin
                                    ? loc.pathname + loc.search + loc.hash
                                    : loc.href;
                                res.writeHead(302, { location: locHeader });
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
                                res.writeHead(upstream.status, { 'content-type': ct });
                                res.end(html);
                            }
                            else {
                                const h = {};
                                upstream.headers.forEach((v, k) => {
                                    if (!['content-security-policy', 'content-encoding', 'transfer-encoding', 'content-length'].includes(k))
                                        h[k] = v;
                                });
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
                    upstream.end(head.length ? undefined : undefined);
                    if (head.length)
                        upstream.write(head);
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
//# sourceMappingURL=part1.js.map