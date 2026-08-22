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
exports.InjectingProxy = void 0;
exports.collectResponseHeaders = collectResponseHeaders;
const http = __importStar(require("http"));
const cookieJar_1 = require("./cookieJar");
const inspectScript_1 = require("../webview/inspectScript");
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
class InjectingProxy {
    constructor(jar) {
        this.wsTarget = '';
        this.port = 0;
        this.jar = jar;
    }
    start(targetOrigin, preferredPorts) {
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
                    const mergedCookie = (0, cookieJar_1.mergeCookieHeaders)(headers['cookie'], this.jar, targetUrl);
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
                                // Replacement FUNCTION, not string: INJECT_SCRIPT contains
                                // `$'`-style sequences (e.g. '__reactFiber$') which
                                // String.replace would otherwise expand into page content,
                                // corrupting the script and flashing body text on load.
                                html = html.includes('</head>')
                                    ? html.replace('</head>', () => inspectScript_1.INJECT_SCRIPT + '</head>')
                                    : inspectScript_1.INJECT_SCRIPT + html;
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
            // Bind a FIXED port so the iframe origin — and therefore
            // localStorage / sessionStorage — stays stable across panel sessions.
            // The caller supplies the port that worked last time first, then we
            // fall back through defaults and finally to an ephemeral port.
            const candidates = [];
            for (const p of [...(preferredPorts ?? []), 47652, 47653, 47654, 0]) {
                if (typeof p === 'number' && !candidates.includes(p))
                    candidates.push(p);
            }
            const tryListen = (port) => new Promise((res, rej) => {
                const srv = this.server;
                const onErr = () => {
                    srv.removeListener('listening', onListen);
                    rej(new Error('bind failed'));
                };
                const onListen = () => {
                    srv.removeListener('error', onErr);
                    // Port 0 = OS-assigned: resolve the ACTUAL bound port.
                    const addr = srv.address();
                    this.port = typeof addr === 'object' && addr ? addr.port : port;
                    res(this.port);
                };
                srv.once('error', onErr);
                srv.once('listening', onListen);
                srv.listen(port, '127.0.0.1');
            });
            void (async () => {
                let lastErr;
                for (const p of candidates) {
                    try {
                        resolve(await tryListen(p));
                        return;
                    }
                    catch (e) {
                        lastErr = e;
                    }
                }
                reject(lastErr instanceof Error ? lastErr : new Error('Could not bind proxy port.'));
            })();
        });
    }
    dispose() {
        if (this.server)
            this.server.close();
    }
}
exports.InjectingProxy = InjectingProxy;
//# sourceMappingURL=injectingProxy.js.map