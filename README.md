# Element Browser + Agent Kit

One VS Code extension with two features:

## 1. Element Browser

A webview-based browser for previewing your app inside VS Code.

- Open any URL (e.g. `http://localhost:3000`) in a browser panel tab
- Login sessions survive reloads and VS Code restarts (proxy-side cookie jars + stable proxy ports)
- Cross-origin logins (OAuth/SSO) hand off to your system browser automatically
- Address bar with back/forward/reload, copy-URL and page loading indicators

Commands:

- `Element Browser: Open App URL`
- `Element Browser: Stop Preview`
- `Element Browser: Clear Saved Login Session`

## 2. Agent Kit — AI Coding Harness

A Kilo-Code-style agentic coding assistant (robot icon in the Activity Bar). Describe a task;
the built-in agent harness plans, reads code, **creates files & folders**, edits code, runs shell
commands and named automations, verifies its work, then summarizes.

Works with **any OpenAI-compatible chat completions endpoint** (default: [OpenCode Zen](https://opencode.ai/zen/v1);
override the URL for OpenAI, DeepSeek, Groq, Ollama, LM Studio...) configured dynamically at runtime —
gear icon in the panel: set base URL → paste key → **Fetch models** → save & use.

### Architecture

```
src/
  config/modelProfiles.ts   model profiles + default endpoint (opencode zen)
  llm/openaiCompat.ts       streaming /chat/completions client (+ GET /models)
  harness/
    types.ts                tool/message/event contracts (pure Node, DI-friendly)
    prompts.ts              system prompt + workspace snapshot builder
    agentRunner.ts          THE AGENT LOOP: LLM -> tools -> results -> repeat until attempt_completion
  tools/
    fsTools.ts              write_file (auto-creates folders) / edit_file / read_file / list / search
    execTools.ts            run_command + run_automation (.agentkit/automations.json)
    interactiveTools.ts     ask_user + attempt_completion
  ui/
    agentPanelProvider.ts   sidebar webview host, approvals, ask-user plumbing
    webviewHtml.ts          chat UI (streaming, tool cards, settings SPA)
```

### Tools the agent can use

| Tool | What it does |
|---|---|
| `write_file` | Creates a file, **auto-creating parent folders** |
| `edit_file` | Exact-snippet replacement with uniqueness checks |
| `read_file` | Numbered content, line ranges |
| `list_files` / `search_files` | Directory listing / regex search |
| `run_command` | Shell command w/ output capture, timeout, process-tree kill |
| `run_automation` | Named pipelines from `.agentkit/automations.json` |
| `ask_user` / `attempt_completion` | Clarify requirements / finish with summary |

### Automations

`Agent Kit: Initialize Workspace Config` creates `.agentkit/automations.json`
(steps support `cwd`, `timeoutSec`, `continueOnError`). Ask the agent to
*"run the verify automation"*.

### Safety

Workspace-root confinement, per-action approvals ("Always allow this session" /
auto-approve toggle), command timeouts, and `agentKit.maxIterations` loop bound.

## Development

```
npm run compile                      # type-check & build to out/
node scripts/selfcheck-webviews.js   # generated webview scripts compile check
node test-smoke.js                   # activation smoke test: all commands/views register
node scripts/smoke-agentkit.js       # E2E: mock OpenAI SSE server drives the real agent loop
```

Press F5 in VS Code ("Run Element Browser + Agent Kit") to launch the Extension
Development Host.
