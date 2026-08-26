// Verifies runShellCommand parses quoted paths + `&&` chains on Windows
// (regression: "The filename, directory name, or volume label syntax is incorrect.").
const fs = require("fs");
const os = require("os");
const path = require("path");
const { runCommandTool } = require("../out/tools/execTools.js");

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-cmd-"));
  fs.writeFileSync(path.join(dir, "index.html"), "<h1>x</h1>");
  const ctx = {
    workspaceRoot: dir,
    commandTimeoutSec: 15,
    signal: new AbortController().signal,
    postEvent() {},
    requestApproval: async () => "approved",
    askUser: async () => undefined,
    emitToolOutput() {},
  };

  const quoted = `cd /d "${dir}" && del /f /q index.html && echo DELETED`;
  const r1 = await runCommandTool.execute({ command: quoted }, ctx);
  console.log("case1 quoted chain ok:", r1.ok, "| file gone:", !fs.existsSync(path.join(dir, "index.html")));
  if (!r1.ok || /DELETED/.test(r1.output) === false) { console.error(r1.output); process.exitCode = 1; }

  const r2 = await runCommandTool.execute({ command: 'echo "a b  c" & dir /b' }, ctx);
  console.log("case2 quotes+dir ok:", r2.ok);

  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
