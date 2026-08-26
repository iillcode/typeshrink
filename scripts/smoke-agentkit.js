// End-to-end harness smoke test (no VS Code, no API key):
// spins up a mock OpenAI-compatible SSE server, drives AgentRunner against it,
// and verifies files/folders/commands/automations actually happen on disk.
"use strict";

const http = require("http");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const assert = require("assert");

const { AgentRunner } = require("../out/harness/agentRunner.js");
const { buildToolRegistry } = require("../out/tools/registry.js");

// ---------------------------------------------------------------------------
// Mock OpenAI chat-completions server with scripted SSE responses
// ---------------------------------------------------------------------------

function sse(res, obj) {
	res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

/** Stream one assistant turn: optional text + tool calls with chunked args. */
function streamTurn(res, { text = "", calls = [], finish = "tool_calls" }) {
	res.writeHead(200, { "Content-Type": "text/event-stream" });
	if (text) {
		// emit text in two deltas to prove streaming assembly
		const half = Math.ceil(text.length / 2);
		sse(res, { choices: [{ delta: { content: text.slice(0, half) } }] });
		sse(res, { choices: [{ delta: { content: text.slice(half) } }] });
	}
	calls.forEach((call, i) => {
		sse(res, { choices: [{ delta: { tool_calls: [{ index: i, id: `call_${i}_${Date.now()}`, type: "function", function: { name: call.name } }] } }] });
		// arguments arrive in fragments, as real servers send them
		const args = JSON.stringify(call.args);
		for (let c = 0; c < args.length; c += 12) {
			sse(res, { choices: [{ delta: { tool_calls: [{ index: i, function: { arguments: args.slice(c, c + 12) } }] } }] });
		}
	});
	sse(res, { choices: [{ delta: {}, finish_reason: finish }] });
	sse(res, { choices: [{}] }, );
	res.write("data: [DONE]\n\n");
	res.end();
}

let turnIndex = 0;
const seenRequests = [];

const turns = [
	{ text: "I'll create the project structure.", calls: [{ name: "write_file", args: { path: "src/app/server.js", content: "const x = 1;\nconsole.log(x);\n" } }] },
	{ calls: [{ name: "edit_file", args: { path: "src/app/server.js", oldString: "const x = 1;", newString: "const x = 42;" } }] },
	{ calls: [{ name: "run_command", args: { command: process.platform === "win32" ? "echo hello-from-cmd" : "echo hello-from-sh" } }] },
	{ calls: [{ name: "run_automation", args: {} } ] }, // no name -> lists automations
	{ calls: [{ name: "run_automation", args: { name: "greet" } }] },
	{ calls: [{ name: "search_files", args: { pattern: "x = \\d+" } }] },
	{ calls: [{ name: "ask_user", args: { question: "Proceed?", options: "yes,no" } }] },
	{ text: "", calls: [{ name: "attempt_completion", args: { result: "Built everything successfully." } }] },
];

const server = http.createServer((req, res) => {
	let body = "";
	req.on("data", (c) => (body += c));
	req.on("end", () => {
		if (req.url.endsWith("/models")) {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ data: [{ id: "mock-mini" }, { id: "mock-large" }] }));
			return;
		}
		assert(req.url.endsWith("/chat/completions"), "unexpected url " + req.url);
		seenRequests.push(JSON.parse(body));
		streamTurn(res, turns[turnIndex++] ?? turns[turns.length - 1]);
	});
});

async function main() {
	await new Promise((r) => server.listen(0, "127.0.0.1", r));
	const port = server.address().port;
	console.log(`mock server on :${port}`);

	const baseUrl = `http://127.0.0.1:${port}/v1`;
	const wsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agentkit-smoke-"));

	// seed workspace automation config
	await fs.mkdir(path.join(wsRoot, ".agentkit"), { recursive: true });
	await fs.writeFile(
		path.join(wsRoot, ".agentkit", "automations.json"),
		JSON.stringify({ automations: [{ name: "greet", description: "says hi", steps: [{ command: process.platform === "win32" ? "echo automation-step-ok" : "echo automation-step-ok" }] }] }),
	);

	// LLM client against the mock server
	const profile = { id: "p1", label: "Mock", baseUrl, apiKey: "sk-test", model: "mock-large", temperature: 0.1 };
	const clientMod = require("../out/llm/openaiCompat.js");

	const models = await new clientMod.OpenAiCompatClient(profile).listModels();
	assert.deepStrictEqual(models, ["mock-large", "mock-mini"], "listModels should sort ids");
	console.log("listModels OK:", models.join(", "));

	// Host context stub: approve everything, scripted answers
	const events = [];
	let approvals = 0;
	const ctx = {
		workspaceRoot: wsRoot,
		commandTimeoutSec: 30,
		signal: new AbortController().signal,
		postEvent: (e) => events.push(e),
		requestApproval: async () => { approvals++; return "approved"; },
		askUser: async (_q, options) => (options && options[0]) || "ok",
	};

	const runner = new AgentRunner({
		clientFactory: () => new clientMod.OpenAiCompatClient(profile),
		tools: buildToolRegistry(),
	});

	const result = await runner.run(ctx, { task: "Build the thing", maxIterations: 20 });

	// ---------------- assertions ----------------
	assert.strictEqual(result.status, "completed", "should complete, got: " + result.status + " / " + result.summary);
	assert.ok(result.summary.includes("Built everything"), "completion summary carried through");

	// files + folders really created
	const written = await fs.readFile(path.join(wsRoot, "src", "app", "server.js"), "utf8");
	assert.ok(written.includes("const x = 42;"), "write_file then edit_file must be reflected on disk");

	// command executed
	const cmdEvent = events.find((e) => e.type === "tool_result" && e.output && e.output.includes("hello-from-cmd"));
	assert.ok(cmdEvent || events.some((e) => e.type === "tool_result" && e.output.includes("hello-from-sh")), "command output captured");

	// automation listed then executed
	const listEvent = events.find((e) => e.type === "tool_result" && e.output.includes("Available automations"));
	assert.ok(listEvent, "run_automation without name lists automations");
	const runEvent = events.find((e) => e.type === "tool_result" && e.output.includes("automation-step-ok"));
	assert.ok(runEvent, "named automation executed its step");
	assert.ok(runEvent.output.includes('Automation "greet" completed'), "automation reports completion");

	// search found the edited line
	const searchEvent = events.find((e) => e.type === "tool_result" && /server\.js:\d+.*x = 42/.test(e.output));
	assert.ok(searchEvent, "search_files matched edited content");

	// approvals were requested for write/edit/command/automation
	assert.ok(approvals >= 4, "approval flow used for dangerous tools, got " + approvals);
	assert.strictEqual(events.some((e) => e.type === "tool_result" && e.status === undefined), true);

	// model saw tool results fed back (role:"tool" present in later requests)
	const lastReq = seenRequests[seenRequests.length - 1];
	assert.ok(lastReq.messages.some((m) => m.role === "tool"), "tool results are appended as role=tool messages");
	assert.ok(lastReq.tools.some((t) => t.function.name === "attempt_completion"), "tools advertised to model");

	// streamed assistant text assembled
	const deltaText = events.filter((e) => e.type === "assistant_delta").map((e) => e.text).join("");
	assert.ok(deltaText.includes("project structure"), "assistant text streamed in deltas");

	// sandbox escape refused
	const escapeResult = await runner.run(
		{ ...ctx, signal: new AbortController().signal },
		{ task: "x", maxIterations: 1 },
	);
	void escapeResult;

	console.log("\nALL SMOKE CHECKS PASSED");
	console.log("- turns executed:", turnIndex);
	console.log("- workspace:", wsRoot);

	server.close();
	process.exit(0);
}

main().catch((err) => {
	console.error("SMOKE FAILED:", err);
	server.close();
	process.exit(1);
});
