"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.firstHttpUrl = firstHttpUrl;
exports.composeBugReport = composeBugReport;
exports.pathReport = pathReport;
exports.composeProjectReport = composeProjectReport;
const buildContextText_1 = require("./buildContextText");
/** First http(s) URL found across a path's steps — the page the flow ran on. */
function firstHttpUrl(steps) {
    const found = steps.map((s) => String(s.element.url || '')).find((u) => /^https?:\/\//i.test(u));
    return found || '';
}
/**
 * Compose the report for one recorded path: an ordered, annotated walkthrough
 * where every step carries the user's note plus the full attached element
 * context (selector, HTML path, outer HTML, CSS…).
 */
function composeBugReport(title, targetUrl, steps) {
    const L = [];
    L.push('# Bug Flow Report — ' + title);
    L.push('');
    if (targetUrl) {
        L.push('Target: ' + targetUrl);
    }
    L.push('Captured: ' + new Date().toLocaleString());
    L.push('Steps: ' + steps.length);
    steps.forEach((s) => {
        L.push('');
        L.push('---');
        L.push('');
        L.push('## Step — <' + s.element.tag + '>' + (s.element.id ? '#' + s.element.id : ''));
        if (s.note) {
            L.push('');
            L.push('**Note:** ' + s.note.replace(/\r?\n/g, '\n'));
        }
        L.push('');
        L.push(buildBlock(s.element));
        L.push('');
    });
    return L.join('\n');
}
/** Full markdown document for one stored path (bug or task). */
function pathReport(p) {
    const heading = p.kind === 'task' ? 'Task Flow Report' : 'Bug Flow Report';
    return composeTypedReport(heading, p.title, p);
}
function composeTypedReport(kindHeading, title, p) {
    const L = [];
    L.push('# ' + kindHeading + ' — ' + title);
    L.push('');
    const target = firstHttpUrl(p.steps);
    if (target)
        L.push('Target: ' + target);
    L.push('Recorded: ' + new Date(p.createdAt).toLocaleString());
    L.push('Steps: ' + p.steps.length);
    p.steps.forEach((s) => {
        L.push('');
        L.push('---');
        L.push('');
        L.push('## Step — <' + s.element.tag + '>' + (s.element.id ? '#' + s.element.id : ''));
        if (s.note) {
            L.push('');
            L.push('**Note:** ' + s.note.replace(/\r?\n/g, '\n'));
        }
        L.push('');
        L.push(buildBlock(s.element));
        L.push('');
    });
    return L.join('\n');
}
/** Compose every path in a project into one shareable markdown document. */
function composeProjectReport(p) {
    const L = [];
    L.push('# Debug Project — ' + p.name);
    L.push('');
    L.push('Created: ' + new Date(p.createdAt).toLocaleString());
    L.push('Paths: ' + p.paths.length);
    if (!p.paths.length) {
        L.push('');
        L.push('_No recorded paths yet._');
    }
    p.paths.forEach((pt, i) => {
        L.push('');
        L.push('=======================');
        L.push('');
        L.push(composeTypedReport(pt.kind === 'task' ? 'Task Flow Report' : 'Bug Flow Report', i + 1 + '. ' + pt.title, pt));
    });
    return L.join('\n');
}
/** Standard attached-context block per step. */
function buildBlock(d) {
    try {
        return (0, buildContextText_1.buildContextText)(d);
    }
    catch {
        return d.outerHTML || '';
    }
}
//# sourceMappingURL=exportBugReport.js.map