// Verifies every generated <script> payload compiles cleanly (no execution).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function extractScripts(html) {
  const out = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) { if (m[1].trim()) out.push(m[1]); }
  return out;
}

let fail = 0;
function check(name, js) {
  try { new Function(js); console.log('  ok - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + ': ' + e.message); }
}

const { getWebviewHtml } = require(path.join(ROOT, 'out', 'webview', 'panelHtml.js'));
const { getSidebarHtml } = require(path.join(ROOT, 'out', 'webview', 'sidebarHtml.js'));
const { INJECT_SCRIPT } = require(path.join(ROOT, 'out', 'webview', 'inspectScript.js'));

console.log('Compiling generated scripts...');
extractScripts(getWebviewHtml(47652)).forEach((js, i) => check('panel script #' + i, js));
extractScripts(getSidebarHtml()).forEach((js, i) => check('sidebar script #' + i, js));
extractScripts(INJECT_SCRIPT).forEach((js, i) => check('injected script #' + i, js));

console.log(fail ? fail + ' FAILURES' : 'all generated scripts compile OK');
process.exit(fail ? 1 : 0);
