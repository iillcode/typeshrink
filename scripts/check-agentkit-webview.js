// Syntax-checks the webview script emitted by getWebviewHtml (no VS Code needed).
"use strict";
const g = require("../out/ui/webviewHtml.js");
const html = g.getWebviewHtml({ cspSource: "x" }, {});
const m = html.match(/<script nonce="([^"]+)">([\s\S]*?)<\/script>/);
if (!m) throw new Error("script tag not found");
new Function(m[2]); // compiles without executing
console.log("webview script syntax OK, html bytes:", html.length, ", nonce:", m[1].length);
