"use strict";
/**
 * Session persistence for the proxied browser.
 *
 * The webview iframe is a THIRD-PARTY context, so Chromium partitions or
 * outright blocks its cookies — logins would die on the first reload.
 * Every request flows through the proxy, so session state lives HERE:
 * upstream Set-Cookie lines are captured into a jar and a correct Cookie
 * header is injected on every outgoing request.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CookieJar = void 0;
exports.mergeCookieHeaders = mergeCookieHeaders;
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
    /** Import cookies the page wrote via document.cookie (client-side auth
     *  flows). These are always host-only, path "/" — HttpOnly cookies are
     *  invisible here, so server-set entries are never clobbered blindly. */
    importDocumentCookie(docCookie, requestUrl) {
        const host = requestUrl.hostname;
        let changed = false;
        for (const pair of docCookie.split(';')) {
            const i = pair.indexOf('=');
            if (i < 1)
                continue;
            const name = pair.slice(0, i).trim();
            const value = pair.slice(i + 1).trim();
            if (!name)
                continue;
            const key = jarKey({ name, domain: host, path: '/' });
            const cur = this.cookies.get(key);
            if (!cur || cur.value !== value) {
                this.cookies.set(key, { name, value, domain: host, path: '/' });
                changed = true;
            }
        }
        return changed;
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
//# sourceMappingURL=cookieJar.js.map