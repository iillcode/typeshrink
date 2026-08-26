// Headless check: aborting mid-stream must stop the agent loop promptly.
const http = require("http");
const { AgentRunner } = require("../out/harness/agentRunner.js");
const { OpenAiCompatClient } = require("../out/llm/openaiCompat.js");

const server = http.createServer((req, res) => {
  if (req.url.endsWith("/chat/completions")) {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    let n = 0;
    const t = setInterval(() => {
      n++;
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "chunk " + n } }] })}\n\n`);
    }, 50);
    req.on("close", () => clearInterval(t));
  } else {
    res.writeHead(404).end();
  }
});

server.listen(0, "127.0.0.1", async () => {
  const port = server.address().port;
  const ac = new AbortController();
  const runner = new AgentRunner({
    clientFactory: () => new OpenAiCompatClient({ id: "t", label: "t", baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: "", model: "m" }),
    tools: [],
  });
  const started = Date.now();
  setTimeout(() => ac.abort(), 400);
  const result = await runner.run(
    {
      workspaceRoot: process.cwd(), commandTimeoutSec: 10, signal: ac.signal,
      postEvent: () => {}, requestApproval: async () => "denied", askUser: async () => undefined,
    },
    { task: "test", maxIterations: 5 },
  );
  const elapsed = Date.now() - started;
  server.close();
  if (result.status !== "aborted" || elapsed > 2000) {
    console.error(`FAIL status=${result.status} elapsed=${elapsed}ms`, result.summary);
    process.exit(1);
  }
  console.log(`ABORT OK: status=${result.status}, stopped after ${elapsed}ms`);
  process.exit(0);
});
