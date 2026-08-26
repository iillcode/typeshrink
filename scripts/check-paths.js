// Verifies resolveInsideWorkspace handles Windows casing + new-file cases.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolveInsideWorkspace } = require("../out/tools/paths.js");

(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "ak-path-"));
  fs.mkdirSync(path.join(base, "sub"), { recursive: true });
  // Simulate VS Code reporting different casing than the on-disk realpath:
  let root = base;
  if (/^[a-z]:/.test(root)) root = root[0].toUpperCase() + root.slice(1);
  else if (/^[A-Z]:/.test(root)) root = root[0].toLowerCase() + root.slice(1);

  const flipDrive = (p) => (/^[a-zA-Z]:/.test(p) ? (p[0] === p[0].toUpperCase() ? p[0].toLowerCase() : p[0].toUpperCase()) + p.slice(1) : p);

  fs.writeFileSync(path.join(base, "index.html"), "x");
  const absFlipped = flipDrive(path.join(root, "index.html"));
  console.log("case1 absolute+case-diff:", await resolveInsideWorkspace(root, absFlipped));

  console.log("case2 new nested file:", await resolveInsideWorkspace(root, "app/deep/readme.md"));
  console.log("case3 relative traverse:", await resolveInsideWorkspace(root, "./sub/../index.html"));
  console.log("case4 abs new nested:", await resolveInsideWorkspace(root, path.join(root, "a", "b", "c.txt")));

  try {
    await resolveInsideWorkspace(root, "../outside.txt");
    console.log("case5: FAIL - escape not refused");
    process.exitCode = 1;
  } catch {
    console.log("case5 escape refused OK");
  }
  try {
    await resolveInsideWorkspace(root, flipDrive(path.join(path.dirname(root), "elsewhere.txt")));
    console.log("case6: FAIL - sibling not refused");
    process.exitCode = 1;
  } catch {
    console.log("case6 sibling refused OK");
  }
  fs.rmSync(base, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
