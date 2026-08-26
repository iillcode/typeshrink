// Verifies per-chat conversation history reaches the model on follow-up runs.
const os = require("os");
const path = require("path");
const fs = require("fs");
const { AgentRunner } = require("../out/harness/agentRunner.js");

(async () => {
  const captured = [];
  const client = {
    async chat(messages) {
      captured.push(messages.slice()); // snapshot: the runner keeps mutating its array
      return { content: "Completed the task.", toolCalls: [], finishReason: "stop" };
    },
    async listModels() { return []; },
  };
  const runner = new AgentRunner({ clientFactory: () => client, tools: [] });
  const wsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ak-hist-"));
  const ctx = {
    workspaceRoot: wsRoot,
    commandTimeoutSec: 5,
    signal: new AbortController().signal,
    postEvent() {},
    requestApproval: async () => "denied",
    askUser: async () => undefined,
  };

  const r1 = await runner.run(ctx, { task: "first task", maxIterations: 3 });
  const history = [
    { role: "user", content: "first task" },
    { role: "assistant", content: r1.summary },
  ];
  await runner.run(ctx, { task: "second task", maxIterations: 3, history });

  const m1 = captured[0];
  const m2 = captured[1];
  const ok =
    m1.length === 2 && // system + task
    m2.length === 4 && // system + history(2) + new task
    m2[1].role === "user" && String(m2[1].content).includes("first task") &&
    m2[2].role === "assistant" && String(m2[2].content).includes(r1.summary) &&
    String(m2[3].content).includes("second task");

  if (!ok) {
    console.error("HISTORY FAIL", JSON.stringify({ l1: m1.length, l2: m2.length }, null, 2));
    process.exit(1);
  }
  console.log("HISTORY OK: follow-up request carried previous turns (" + m2.length + " messages)");

  // --- interrupted-run context (the "continue" bug) ---
  const { summarizeRunForHistory } = require("../out/harness/types.js");
  const mem = summarizeRunForHistory({
    status: "aborted",
    fallbackSummary: "Task aborted by user.",
    texts: ["I'll create the API routes next."],
    partial: "",
    actions: [
      { name: "read_file", argsSummary: "path: src/server.ts", ok: true },
      { name: "write_file", argsSummary: "path: src/routes.ts", ok: true },
      { name: "run_command", argsSummary: "command: npm test", ok: false },
    ],
  });
  const ctxOk =
    mem.includes("interrupted") &&
    mem.includes("read_file") && mem.includes("src/server.ts") &&
    mem.includes("write_file") && mem.includes("[ok]") &&
    mem.includes("[failed]") &&
    mem.includes("API routes");
  const emptyMem = summarizeRunForHistory({ status: "aborted", fallbackSummary: "Task aborted by user.", texts: [], partial: "", actions: [] });
  const completedMem = summarizeRunForHistory({
    status: "completed", fallbackSummary: "All done.",
    texts: ["x"], partial: "", actions: [{ name: "write_file", argsSummary: "p", ok: true }],
  });

  if (!ctxOk || !emptyMem.includes("aborted") || completedMem !== "All done.") {
    console.error("INTERRUPT-CONTEXT FAIL\n---\n" + mem + "\n---\nempty=" + emptyMem + "\ncompleted=" + completedMem);
    process.exit(1);
  }
  console.log("INTERRUPT CONTEXT OK: aborted runs keep partial output + action log");
  fs.rmSync(wsRoot, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
