"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildContextText = buildContextText;
/** Compose the full "Attached Element Context" block shown in Output and
 *  copyable from the sidebar — mirrors DevTools-style element dumps. */
function buildContextText(d) {
    const cls = d.className && d.className.trim()
        ? '.' + d.className.trim().split(/\s+/).join('.')
        : '';
    const L = [];
    L.push(`Attached Element Context from Element Browser`);
    L.push('');
    L.push(`Element: ${d.tag}${cls}`);
    L.push('');
    L.push(`URL: ${d.url ?? ''}`);
    L.push('');
    L.push(`HTML Path: ${d.htmlPath ?? d.xpath}`);
    if (d.source) {
        L.push('');
        L.push(`Source: ${d.source.file}:${d.source.line}`);
    }
    L.push('');
    L.push('Outer HTML:');
    L.push('```html');
    L.push(d.outerHTML);
    L.push('```');
    if (d.rect) {
        L.push('');
        L.push('Dimensions:');
        L.push(`- top: ${d.rect.y}px`);
        L.push(`- left: ${d.rect.x}px`);
        L.push(`- width: ${d.rect.w}px`);
        L.push(`- height: ${d.rect.h}px`);
    }
    L.push('');
    L.push('CSS:');
    L.push('```css');
    for (const r of d.cssMatched ?? [])
        L.push(r);
    if (d.cssInherited?.length) {
        L.push('');
        L.push('/* Inherited */');
        for (const r of d.cssInherited)
            L.push(r);
    }
    if (d.cssResolved?.length) {
        L.push('');
        L.push('/* Resolved values */');
        for (const r of d.cssResolved)
            L.push(r);
    }
    if (d.cssVars?.length) {
        L.push('');
        L.push('/* CSS variables */');
        for (const v of d.cssVars)
            L.push(v);
    }
    L.push('```');
    return L.join('\n');
}
//# sourceMappingURL=buildContextText.js.map