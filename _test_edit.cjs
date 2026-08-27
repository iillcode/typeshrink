const http = require("http");
const { OpenAiCompatClient } = require("./out/llm/openaiCompat.js");

function sse(res, chunks) {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  for (const c of chunks) res.write(`data: ${typeof c === "string" ? c : JSON.stringify(c)}\n\n`);
  res.end();
}

// Split a tool-call arg string into many small deltas (like real gateways)
function argDeltas(id, name, argsStr, n = 6) {
  const out = [];
  const step = Math.ceil(argsStr.length / n);
  for (let i = 0; i < argsStr.length; i += step) {
    out.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: i === 0 ? id : undefined, function: { ...(i === 0 ? { name } : {}), arguments: argsStr.slice(i, i + step) } }] }, finish_reason: null }] });
  }
  return out;
}

// Scenario A: VALID json args (newlines escaped as \n inside the JSON string)
const validArgs = JSON.stringify({ path: "app.ts", content: "line1\nline2\nline3" });
// Scenario B: INVALID json — literal newline inside the string value (models emit this)
const invalidArgs = '{"path": "app.ts", "content": "line1\nline2\nline3"}';

function runScenario(name, argsStr) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (!req.url.includes("/chat/completions")) return res.writeHead(404).end();
        const chunks = [
          { choices: [{ delta: { reasoning_content: "I will edit the file. " }, finish_reason: null }] },
          { choices: [{ delta: { content: "Editing now." }, finish_reason: null }] },
          ...argDeltas("call_1", "edit_file", argsStr),
          { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
          "[DONE]",
        ];
        sse(res, chunks);
      });
    });
    server.listen(0, "127.0.0.1", async () => {
      const port = server.address().port;
      const client = new OpenAiCompatClient({ id: "t", label: "t", baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: "x", model: "mock" });
      const tools = [{ type: "function", function: { name: "edit_file", description: "", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } } } } }];
      const deltas = [];
      try {
        const r = await client.chat([{ role: "user", content: "edit" }], tools, {
          onTextDelta: (d) => deltas.push(["text", d]),
          onReasoningDelta: (d) => deltas.push(["reason", d]),
        }, new AbortController().signal);
        console.log(`\n=== ${name} ===`);
        console.log("toolCalls:", JSON.stringify(r.toolCalls));
        console.log("blocks:", r.blocks.map((b) => `${b.type}:${JSON.stringify(b.text.slice(0, 40))}`).join(" | "));
        console.log("deltas:", JSON.stringify(deltas));
      } catch (e) {
        console.log(`\n=== ${name} ===`);
        console.log("THREW:", e.message);
        console.log("deltas so far:", JSON.stringify(deltas));
      }
      server.close(resolve);
    });
  });
}

(async () => {
  await runScenario("A: valid escaped args", validArgs);
  await runScenario("B: literal newline args (invalid JSON)", invalidArgs);
})();
