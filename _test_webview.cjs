// Execute the REAL webview script against a minimal DOM shim and replay a
// realistic edit-file run event sequence to find the mapping corruption.
const { getWebviewHtml } = require("./out/ui/webviewHtml.js");
const html = getWebviewHtml({ cspSource: "vscode-resource:", asWebviewUri: (u) => String(u) });

// Extract the inline script (the one with the nonce)
const m = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
if (!m) { console.log("NO SCRIPT FOUND"); process.exit(1); }
const script = m[1];

// ---------------- minimal DOM shim ----------------
class El {
  constructor(tag) {
    this.tagName = (tag || "div").toUpperCase();
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.innerHTML = "";
    this.textContent = "";
    this.className = "";
    this.id = "";
    this.style = {};
    this.open = false;
    this.disabled = false;
    this.value = "";
    this.scrollTop = 0;
    this.scrollHeight = 100;
    this.clientHeight = 100;
    this.isConnected = true;
    this.parentElement = null;
    this.selectionStart = null;
  }
  get classList() {
    const self = this;
    return {
      add: (...c) => { self.className = (self.className + " " + c.join(" ")).trim(); },
      remove: (...c) => { self.className = self.className.split(" ").filter((x) => !c.includes(x)).join(" "); },
      contains: (c) => self.className.split(" ").includes(c),
    };
  }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === "id") this.id = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  insertBefore(c, ref) { c.parentElement = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentElement = null; return c; }
  remove() { if (this.parentElement) this.parentElement.removeChild(this); }
  insertAdjacentHTML(pos, htmlStr) { const frag = parseHTML(htmlStr); for (const n of frag) { n.parentElement = this; this.children.push(n); } }
  querySelector(sel) { return queryAll(this, sel)[0] || null; }
  querySelectorAll(sel) { return queryAll(this, sel); }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  click() { (this.listeners.click || []).forEach((f) => f({ target: this, preventDefault() {} })); }
  focus() {}
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get lastElementChild() { return this.children[this.children.length - 1] || null; }
  contains() { return false; }
  closest() { return null; }
}

// crude parser: only needs to handle the shapes our script produces
function parseHTML(htmlStr) {
  const out = [];
  const re = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>|<(\w+)([^>]*)\/>/g;
  let rest = htmlStr;
  let match;
  let lastIndex = 0;
  while ((match = re.exec(htmlStr))) {
    if (match.index > lastIndex) {
      const text = htmlStr.slice(lastIndex, match.index);
      if (text.trim()) {
        const tn = new El("#text");
        tn.textContent = text;
        out.push(tn);
      }
    }
    const tag = match[1] || match[4];
    const attrs = match[2] || match[5] || "";
    const inner = match[3];
    const el = new El(tag);
    const attrRe = /([\w-]+)=['"]([^'"]*)['"]/g;
    let a;
    while ((a = attrRe.exec(attrs))) el.setAttribute(a[1], a[2]);
    el.className = el.attributes["class"] || "";
    el.id = el.attributes["id"] || "";
    if (inner) {
      if (/<\w/.test(inner)) { for (const c of parseHTML(inner)) el.appendChild(c); }
      else el.textContent = inner;
    }
    out.push(el);
    lastIndex = re.lastIndex;
  }
  if (lastIndex < rest.length && rest.slice(lastIndex).trim()) {
    const tn = new El("#text");
    tn.textContent = rest.slice(lastIndex);
    out.push(tn);
  }
  return out;
}

function matches(el, sel) {
  sel = sel.trim();
  const idMatch = sel.match(/^#([\w-]+)$/);
  if (idMatch) return el.id === idMatch[1];
  const classMatches = sel.match(/^\.([\w-]+)/);
  const tagMatch = sel.match(/^([a-zA-Z][\w-]*)/);
  if (tagMatch && el.tagName.toLowerCase() !== tagMatch[1].toLowerCase() && el.tagName !== "#text") return false;
  if (classMatches) {
    const rest = sel.slice(sel.indexOf(classMatches[0]) + classMatches[0].length);
    if (!el.className.split(" ").includes(classMatches[1])) return false;
    if (rest.trim()) {
      const attrM = rest.trim().match(/^\[([\w-]+)=['"]([^'"]*)['"]\]$/);
      if (attrM) return el.attributes[attrM[1]] === attrM[2];
    }
    return true;
  }
  if (tagMatch && !classMatches) {
    const rest = sel.slice(tagMatch[0].length).trim();
    if (rest) {
      const attrM = rest.match(/^\[([\w-]+)=['"]([^'"]*)['"]\]$/);
      if (attrM) return el.attributes[attrM[1]] === attrM[2];
      if (rest.startsWith(".")) return matches(el, rest);
    }
    return true;
  }
  return false;
}

function queryAll(root, sel) {
  const parts = sel.split(",").map((s) => s.trim());
  const result = [];
  function walk(el) {
    for (const c of el.children) {
      for (const p of parts) {
        const segs = p.split(/\s+/);
        if (segs.length === 1) { if (matches(c, segs[0])) { result.push(c); break; } }
        else {
          // descendant selector: match last seg against c, ancestors against rest
          if (matches(c, segs[segs.length - 1])) {
            let anc = el;
            let ok = true;
            for (let i = segs.length - 2; i >= 0; i--) {
              while (anc && !matches(anc, segs[i])) anc = anc.parentElement;
              if (!anc) { ok = false; break; }
            }
            if (ok) { result.push(c); break; }
          }
        }
      }
      walk(c);
    }
  }
  if (root.children) walk(root);
  return result;
}

const documentStub = {
  getElementById(id) { return queryAll(docRoot, "#" + id)[0] || null; },
  createElement(tag) { return new El(tag); },
  querySelector(sel) { return queryAll(docRoot, sel)[0] || null; },
  querySelectorAll(sel) { return queryAll(docRoot, sel); },
  addEventListener() {},
  removeEventListener() {},
  body: new El("body"),
  activeElement: null,
  execCommand: () => true,
};
const docRoot = new El("#document");
const appEl = new El("div");
appEl.setAttribute("id", "app");
docRoot.appendChild(appEl);
for (const id of ["transcript", "btn-send", "btn-stop", "input", "aa-toggle", "model-chip", "mode-chip"]) {
  const el = new El(id === "btn-send" || id === "btn-stop" ? "button" : "div");
  el.setAttribute("id", id);
  appEl.appendChild(el);
}
const transcriptEl = appEl.children[0];

const windowListeners = {};
let rafCallbacks = [];
const requestAnimationFrame = (fn) => { rafCallbacks.push(fn); return rafCallbacks.length; };
function flushRaf() { const cbs = rafCallbacks; rafCallbacks = []; cbs.forEach((f) => f()); }

const posted = [];
const vscode = { postMessage: (m) => posted.push(m) };

// Execute the script
const fn = new Function("document", "window", "vscode", "requestAnimationFrame", "acquireVsCodeApi",
  script + "\n;return { post: (m) => window.dispatchEvent({ data: m }), state: typeof state !== 'undefined' ? state : undefined };");
const api = fn(documentStub, {
  addEventListener: (t, f) => { windowListeners[t] = (windowListeners[t] || []).concat(f); },
  requestAnimationFrame,
}, vscode, requestAnimationFrame, () => vscode);

function sendMessage(msg) { (windowListeners["message"] || []).forEach((f) => f({ data: msg })); }

// ---------------- replay a realistic edit-file run ----------------
function dump(label) {
  flushRaf();
  const parts = [];
  for (const c of transcriptEl.children) parts.push(describe(c));
  console.log(`--- ${label} ---`);
  console.log(parts.map((p, i) => `${i}: ${p}`).join("\n"));
}

function describe(el) {
  if (el.className.includes("turn-user")) return "USER";
  if (el.className.includes("turn-assistant")) {
    const bits = [];
    for (const c of el.children) {
      if (c.tagName === "DETAILS" || c.className.includes("reasoning")) bits.push("THINK[" + textOf(c).slice(0, 30) + "]");
      else if (c.className.includes("md")) bits.push("TEXT[" + textOf(c).slice(0, 40) + "]");
      else bits.push(c.className || c.tagName);
    }
    return "ASSISTANT: " + bits.join(" + ");
  }
  if (el.className.includes("act")) return "TOOL-CARD " + (el.attributes["data-callid"] || "") + " " + textOf(el).slice(0, 50);
  if (el.className.includes("notice")) return "NOTICE";
  if (el.className.includes("approval")) return "APPROVAL";
  return el.className || el.tagName;
}
function textOf(el) { return (el.textContent || "") + el.children.map(textOf).join(""); }

// initial state
sendMessage({ type: "state", state: { profiles: [], activeProfileId: "p", busy: false, transcript: [], pendingApproval: null, activeChatId: "chat1", settingsVisible: false, chats: [], mode: "build" } });

// turn 1: reasoning + text, then edit_file call
sendMessage({ type: "reasoning_delta", sessionId: "chat1", text: "I will edit app.ts. " });
sendMessage({ type: "reasoning_delta", sessionId: "chat1", text: "Adding a line." });
sendMessage({ type: "assistant_delta", sessionId: "chat1", text: "Editing the file now." });
sendMessage({ type: "assistant_message", sessionId: "chat1", text: "Editing the file now.", reasoning: "I will edit app.ts. Adding a line.", blocks: [{ type: "reasoning", text: "I will edit app.ts. " }, { type: "text", text: "Editing the file now." }] });
sendMessage({ type: "tool_start", sessionId: "chat1", callId: "call_1", name: "edit_file", argsSummary: "path: app.ts", });
sendMessage({ type: "tool_output", sessionId: "chat1", callId: "call_1", text: "patched" });
sendMessage({ type: "tool_result", sessionId: "chat1", callId: "call_1", ok: true, output: "edited ok" });

// turn 2: post-edit response (reasoning + text)
sendMessage({ type: "reasoning_delta", sessionId: "chat1", text: "Edit applied. " });
sendMessage({ type: "reasoning_delta", sessionId: "chat1", text: "Now summarizing." });
sendMessage({ type: "assistant_delta", sessionId: "chat1", text: "Done! I updated app.ts." });
sendMessage({ type: "assistant_message", sessionId: "chat1", text: "Done! I updated app.ts.", reasoning: "Edit applied. Now summarizing.", blocks: [{ type: "reasoning", text: "Edit applied. " }, { type: "text", text: "Done! I updated app.ts." }] });

dump("after full run");

// final state push from provider (run transcript)
sendMessage({ type: "state", state: { profiles: [], activeProfileId: "p", busy: false, transcript: [
  { kind: "user", text: "please edit app.ts" },
  { kind: "assistant", text: "Editing the file now.", reasoning: "I will edit app.ts. Adding a line.", blocks: [{ type: "reasoning", text: "I will edit app.ts. " }, { type: "text", text: "Editing the file now." }] },
  { kind: "tool", callId: "call_1", name: "edit_file", argsSummary: "path: app.ts", status: "ok", output: "edited ok" },
  { kind: "assistant", text: "Done! I updated app.ts.", reasoning: "Edit applied. Now summarizing.", blocks: [{ type: "reasoning", text: "Edit applied. " }, { type: "text", text: "Done! I updated app.ts." }] },
], pendingApproval: null, activeChatId: "chat1", settingsVisible: false, chats: [], mode: "build" } });

dump("after final state push");
console.log("\nPosted messages:", JSON.stringify(posted));
