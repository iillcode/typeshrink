"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebviewHtml = getWebviewHtml;
/**
 * Self-contained Codex-style chat UI for the sidebar webview. No bundler: one
 * inline, CSP-nonce'd script. Talks to the provider over postMessage.
 */
function getWebviewHtml(webview, extensionUri) {
    const nonce = Array.from({ length: 24 }, () => Math.random().toString(36)[2] ?? "0").join("");
    void extensionUri;
    const script = `
(function () {
  var vscode = acquireVsCodeApi();
  var state = { profiles: [], activeProfileId: "", autoApprove: false, busy: false, settingsVisible: false, transcript: [], pendingApproval: null, activeLabel: "", chats: [], activeChatId: "" };
  var DEFAULT_BASE_URL = "https://opencode.ai/zen/v1";
  var chatsView = false;
  var editingProfileId = undefined; // undefined = list view, null = new, string = edit
  var draftModels = [];
  var lastModelsError = "";
  var streamBuf = "";
  var streamEl = null;
  var streamActive = false;
  var reasoningBuf = "";
  var stepsDone = 0;
  var actionText = "";
  // Incremental-DOM bookkeeping: how many transcript entries are already in the
  // DOM, and which view is mounted. Frequent events update nodes in place
  // instead of rebuilding the whole panel (which caused flicker/refreshing).
  var renderedCount = 0;
  var currentView = "chat";
  var paintQueued = false;
  // Autoscroll stickiness: follow the stream unless the user deliberately
  // scrolled up. Computed BEFORE each paint (never from post-mutation layout,
  // which caused the view to get stuck at the top of growing messages).
  var followStream = true;

  var IC = {
    plus: "<svg width='14' height='14' viewBox='0 0 16 16' fill='none'><path d='M8 3v10M3 8h10' stroke='currentColor' stroke-width='1.5' stroke-linecap='round'/></svg>",
    sliders: "<svg width='14' height='14' viewBox='0 0 16 16' fill='none'><path d='M2 5h12M2 11h12' stroke='currentColor' stroke-width='1.4' stroke-linecap='round'/><circle cx='6' cy='5' r='1.9' fill='none' stroke='currentColor' stroke-width='1.4'/><circle cx='10.5' cy='11' r='1.9' fill='none' stroke='currentColor' stroke-width='1.4'/></svg>",
    up: "<svg width='13' height='13' viewBox='0 0 16 16' fill='none'><path d='M8 13V3M3.5 7.5 8 3l4.5 4.5' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/></svg>",
    stop: "<svg width='11' height='11' viewBox='0 0 16 16'><rect x='3.5' y='3.5' width='9' height='9' rx='2' fill='currentColor'/></svg>",
    bolt: "<svg width='11' height='11' viewBox='0 0 16 16'><path d='M8.7 1.2 3.2 9H7l-1.1 5.6L11.8 7H8.2l.5-5.8Z' fill='currentColor'/></svg>",
    chip: "<svg width='12' height='12' viewBox='0 0 16 16' fill='none'><rect x='4.5' y='4.5' width='7' height='7' rx='1.5' stroke='currentColor' stroke-width='1.3'/><path d='M6.5 1.5v2M9.5 1.5v2M6.5 12.5v2M9.5 12.5v2M1.5 6.5h2M1.5 9.5h2M12.5 6.5h2M12.5 9.5h2' stroke='currentColor' stroke-width='1.3' stroke-linecap='round'/></svg>",
    file: "<svg width='12' height='12' viewBox='0 0 16 16' fill='none'><path d='M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9 1.5Z' stroke='currentColor' stroke-width='1.2' stroke-linejoin='round'/><path d='M9 1.5V5.5H13' stroke='currentColor' stroke-width='1.2' stroke-linejoin='round'/></svg>",
    pencil: "<svg width='12' height='12' viewBox='0 0 16 16' fill='none'><path d='m11.3 2.1 2.6 2.6L5 13.6l-3.2.6.6-3.2 8.9-8.9Z' stroke='currentColor' stroke-width='1.2' stroke-linejoin='round'/></svg>",
    eye: "<svg width='12' height='12' viewBox='0 0 16 16' fill='none'><path d='M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z' stroke='currentColor' stroke-width='1.2'/><circle cx='8' cy='8' r='1.8' stroke='currentColor' stroke-width='1.2'/></svg>",
    search: "<svg width='12' height='12' viewBox='0 0 16 16' fill='none'><circle cx='7' cy='7' r='4.5' stroke='currentColor' stroke-width='1.3'/><path d='m10.5 10.5 3 3' stroke='currentColor' stroke-width='1.3' stroke-linecap='round'/></svg>",
    list: "<svg width='12' height='12' viewBox='0 0 16 16' fill='none'><path d='M2.5 4h11M2.5 8h11M2.5 12h7' stroke='currentColor' stroke-width='1.3' stroke-linecap='round'/></svg>",
    term: "<svg width='12' height='12' viewBox='0 0 16 16' fill='none'><rect x='1.5' y='2.5' width='13' height='11' rx='1.5' stroke='currentColor' stroke-width='1.2'/><path d='m4 6 2.5 2L4 10M8 10.5h4' stroke='currentColor' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/></svg>",
    chat: "<svg width='12' height='12' viewBox='0 0 16 16' fill='none'><path d='M14 8A6 6 0 1 1 8 2a6 6 0 0 1 6 6Z' stroke='currentColor' stroke-width='1.2'/><path d='m4.5 13.5-.9 1.8 2.6-.9' stroke='currentColor' stroke-width='1.2' stroke-linejoin='round'/></svg>",
    check: "<svg width='11' height='11' viewBox='0 0 16 16' fill='none'><path d='m3 8.5 3 3L13 5' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/></svg>",
    clock: "<svg width='14' height='14' viewBox='0 0 16 16' fill='none'><circle cx='8' cy='8' r='6.2' stroke='currentColor' stroke-width='1.3'/><path d='M8 4.6V8l2.4 1.6' stroke='currentColor' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'/></svg>",
    trash: "<svg width='12' height='12' viewBox='0 0 16 16' fill='none'><path d='M2.5 4.5h11M6.5 2.5h3M4 4.5l.7 9h6.6l.7-9M6.7 7v4.5M9.3 7v4.5' stroke='currentColor' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/></svg>"
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function mdRender(src) {
    var blocks = [];
    var text = String(src == null ? "" : src).replace(/\\\`\\\`(\\w*)\\n?([\\s\\S]*?)\\\`\\\`/g, function (_, lang, code) {
      blocks.push({ lang: lang, code: code.replace(/\\n$/, "") });
      return "\\u0000CB" + (blocks.length - 1) + "\\u0000";
    });
    var html = esc(text);
    html = html.replace(/\\\`([^\\\`\\n]+)\\\`/g, "<code>$1</code>");
    html = html.replace(/\\*\\*([^*\\n]+)\\*\\*/g, "<b>$1</b>");
    var lines = html.split("\\n").map(function (line) {
      var m;
      if ((m = line.match(/^(#{1,4}) (.+)$/))) return "<div class='md-h'>" + m[2] + "</div>";
      if (/^[-*] /.test(line)) return "<div class='md-li'>" + line.slice(2) + "</div>";
      return line === "" ? "<div class='md-gap'></div>" : "<div>" + (line || " ") + "</div>";
    }).join("");
    html = lines.replace(/\\u0000CB(\\d+)\\u0000/g, function (_, i) {
      var b = blocks[Number(i)];
      return "<pre><code>" + b.code + "</code></pre>";
    });
    return html;
  }

  var root = document.getElementById("app");

  function render() {
    var parts = [];

    // ---------- header ----------
    parts.push("<div class='header'>");
    parts.push("<div class='brand'><span class='brand-glyph'>&gt;_</span><span>Agent Kit</span></div>");
    parts.push("<div class='header-actions'>");
    parts.push("<button id='btn-new' class='icon-btn' title='New chat'>" + IC.plus + "</button>");
    parts.push("<button id='btn-chats' class='icon-btn" + (chatsView ? " active" : "") + "' title='Chat history'>" + IC.clock + "</button>");
    parts.push("<button id='btn-settings' class='icon-btn' title='Model settings'>" + IC.sliders + "</button>");
    parts.push("</div></div>");

    if (state.settingsVisible || editingProfileId !== undefined) {
      parts.push(renderSettings());
    } else if (chatsView) {
      parts.push(renderChats());
    } else {
      parts.push(renderChat());
    }

    root.innerHTML = parts.join("");
    wire();
    currentView = desiredView();
    renderedCount = state.transcript.length;
    if (!state.settingsVisible && editingProfileId === undefined && !chatsView) syncApproval();
    // Re-attach any in-flight streamed response after a re-render (e.g. returning
    // from settings or a state push mid-run) so nothing visually vanishes.
    if (streamActive && streamBuf && !state.settingsVisible && editingProfileId === undefined && !chatsView) {
      ensureStreamEl();
      paintStream();
    }
  }

  function desiredView() {
    if (state.settingsVisible || editingProfileId !== undefined) return "settings";
    if (chatsView) return "chats";
    return "chat";
  }

  // ------------------------------------------------------------------
  // Chat history view
  // ------------------------------------------------------------------

  function renderChats() {
    var parts = [];
    parts.push("<div class='settings'>");
    parts.push("<div class='settings-head'>");
    parts.push("<button id='btn-back' class='icon-btn back-btn' title='Back to chat'>&larr;</button>");
    parts.push("<span class='settings-title'>Chats</span>");
    parts.push("<span style='width:26px'></span>");
    parts.push("</div>");
    parts.push("<button id='btn-new-chat' class='btn primary wide'>" + IC.plus.replace("width='14' height='14'", "width='12' height='12'") + " New chat</button>");
    var list = Array.isArray(state.chats) ? state.chats : [];
    if (list.length === 0) {
      parts.push("<div class='hint' style='text-align:center;margin-top:24px'>No chats yet. Send your first request.</div>");
    }
    list.forEach(function (c) {
      var isActive = c.id === state.activeChatId;
      parts.push(
        "<div class='chat-row" + (isActive ? " active" : "") + "' data-chat-id='" + esc(c.id) + "'>" +
        "<div class='chat-main'>" +
        "<div class='chat-title'>" + esc(c.title || "New chat") + "</div>" +
        "<div class='chat-date muted small'>" + fmtDate(c.updatedAt) + "</div>" +
        "</div>" +
        "<button class='icon-btn del-chat' data-del-chat='" + esc(c.id) + "' title='Delete chat'>" + IC.trash + "</button>" +
        "</div>"
      );
    });
    parts.push("</div>");
    return parts.join("");
  }

  function fmtDate(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return "Today " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    }
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return d.getDate() + " " + months[d.getMonth()] + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function chatVisible() {
    return document.getElementById("transcript") !== null;
  }

  // ------------------------------------------------------------------
  // Incremental sync — update only what changed, never rebuild the DOM.
  // ------------------------------------------------------------------

  function entryHTML(entry) {
    if (entry.kind === "user") return "<div class='turn-user'>" + mdRender(entry.text) + "</div>";
    if (entry.kind === "assistant") {
      var html = "<div class='turn-assistant'><div class='md'>" + mdRender(entry.text) + "</div>";
      if (entry.reasoning) {
        html += "<details class='reasoning'><summary>Reasoning</summary><div class='pre'>" + esc(entry.reasoning) + "</div></details>";
      }
      return html + "</div>";
    }
    if (entry.kind === "tool") return toolRow(entry);
    return "<div class='notice'>" + esc(entry.text || "") + "</div>";
  }

  function syncTranscript() {
    var t = document.getElementById("transcript");
    if (!t) return;
    var empty = t.querySelector(".empty");
    var appendedUser = false;
    while (renderedCount < state.transcript.length) {
      if (empty) { empty.remove(); empty = null; }
      var entry = state.transcript[renderedCount];
      t.insertAdjacentHTML("beforeend", entryHTML(entry));
      if (entry.kind === "user") appendedUser = true; // own message always snaps to bottom
      renderedCount++;
    }
    scrollBottom(appendedUser);
  }

  function syncWorkingRow() {
    var wrap = document.querySelector(".composer-wrap");
    if (!wrap) return;
    var row = wrap.querySelector(".working-row");
    if (state.busy) {
      if (!row) {
        row = document.createElement("div");
        row.className = "working-row";
        row.innerHTML = "<span class='spinner'></span><span class='working-text'></span>";
        wrap.insertBefore(row, wrap.firstChild);
      }
      row.querySelector(".working-text").textContent = workingLabel() + "...";
    } else if (row) {
      row.remove();
    }
  }

  function syncSendStop() {
    var foot = document.querySelector(".composer-foot");
    if (!foot) return;
    var send = document.getElementById("btn-send");
    var stop = document.getElementById("btn-stop");
    // Send stays available while busy: sending interrupts the running task.
    if (state.busy && !stop && send) {
      stop = document.createElement("button");
      stop.id = "btn-stop";
      stop.className = "send-btn stop";
      stop.title = "Stop";
      stop.innerHTML = IC.stop;
      stop.onclick = function () { vscode.postMessage({ type: "cancel" }); };
      foot.insertBefore(stop, send);
    } else if (!state.busy && stop) {
      stop.remove();
    }
    if (send) send.title = state.busy ? "Interrupt & send (Enter)" : "Send (Enter)";
    var ta = document.getElementById("input");
    if (ta) ta.placeholder = state.busy ? "Send to interrupt & start a new task..." : "Describe a task...";
  }

  function syncApproval() {
    var wrap = document.querySelector(".composer-wrap");
    if (!wrap) return;
    var existing = document.querySelector(".approval");
    var p = state.pendingApproval;
    if (!p) {
      if (existing) existing.remove();
      return;
    }
    if (existing && existing.getAttribute("data-approval-id") === p.id) return; // already shown
    if (existing) existing.remove();
    var div = document.createElement("div");
    div.className = "approval";
    div.setAttribute("data-approval-id", p.id);
    div.innerHTML =
      "<div class='approval-head'>Approval needed &#183; " + esc(p.tool) + "</div>" +
      "<div class='approval-title'>" + esc(p.title) + "</div>" +
      (p.detail ? "<pre class='approval-detail'>" + esc(p.detail) + "</pre>" : "") +
      "<div class='approval-actions'>" +
      "<button class='btn primary' data-decision='approved' data-id='" + esc(p.id) + "'>Approve</button>" +
      "<button class='btn' data-decision='always' data-id='" + esc(p.id) + "'>Always allow</button>" +
      "<button class='btn danger' data-decision='denied' data-id='" + esc(p.id) + "'>Deny</button>" +
      "</div>";
    wrap.insertBefore(div, wrap.firstChild);
    wireApprovalButtons(div);
  }

  function wireApprovalButtons(scope) {
    scope.querySelectorAll("[data-decision]").forEach(function (b) {
      b.onclick = function () {
        vscode.postMessage({ type: "approval", id: b.getAttribute("data-id"), decision: b.getAttribute("data-decision") });
        b.disabled = true;
      };
    });
  }

  function syncAutoPill() {
    var aa = document.getElementById("aa-toggle");
    if (!aa) return;
    aa.className = "pill" + (state.autoApprove ? " on" : "");
    aa.innerHTML = IC.bolt + "<span>Auto" + (state.autoApprove ? " on" : "") + "</span>";
  }

  function syncModelChip() {
    var mc = document.getElementById("model-chip");
    if (!mc) return;
    var span = mc.querySelector("span");
    var label = esc(state.activeLabel || "(no model)");
    if (span) span.innerHTML = label; else mc.innerHTML = IC.chip + "<span>" + label + "</span>";
  }

  function syncDynamic() {
    syncWorkingRow();
    syncSendStop();
    syncApproval();
    syncAutoPill();
    syncModelChip();
    syncTranscript();
  }

  // ------------------------------------------------------------------
  // Chat view
  // ------------------------------------------------------------------

  function renderChat() {
    var parts = [];
    parts.push("<div class='transcript' id='transcript'>");

    if (state.transcript.length === 0 && !streamActive) {
      parts.push(
        "<div class='empty'>" +
        "<div class='empty-glyph'>&gt;_</div>" +
        "<div class='empty-title'>What should we build?</div>" +
        "<div class='empty-sub'>The agent reads code, creates files &amp; folders, edits, runs commands and verifies its work.</div>" +
        "<div class='examples'>" +
        exampleBtn("Create a Node.js REST API with Express in src/") +
        exampleBtn("Write unit tests for utils.ts") +
        exampleBtn("Run the setup automation, then summarize") +
        "</div></div>"
      );
    }

    state.transcript.forEach(function (entry) {
      parts.push(entryHTML(entry));
    });

    parts.push("<div id='stream-anchor'></div>");
    parts.push("</div>");

    // ---------- composer (Codex-style rounded box) ----------
    parts.push("<div class='composer-wrap'>");
    if (state.busy) {
      parts.push(
        "<div class='working-row'>" +
        "<span class='spinner'></span>" +
        "<span class='working-text'>" + esc(workingLabel()) + "...</span>" +
        "</div>"
      );
    }
    parts.push("<div class='composer'>");
    parts.push("<textarea id='input' rows='1' placeholder='" +
      (state.busy ? "Send to interrupt &amp; start a new task..." : "Describe a task...") +
      "'></textarea>");
    parts.push("<div class='composer-foot'>");
    parts.push("<button id='aa-toggle' class='pill" + (state.autoApprove ? " on" : "") + "' title='Auto-approve writes &amp; commands (this session)'>" +
      IC.bolt + "<span>Auto" + (state.autoApprove ? " on" : "") + "</span></button>");
    parts.push("<button id='model-chip' class='pill model' title='Switch model profile'>" + IC.chip + "<span>" + esc(state.activeLabel || "(no model)") + "</span></button>");
    if (state.busy) {
      parts.push("<button id='btn-stop' class='send-btn stop' title='Stop'>" + IC.stop + "</button>");
    }
    parts.push("<button id='btn-send' class='send-btn' title='" + (state.busy ? "Interrupt & send (Enter)" : "Send (Enter)") + "'>" + IC.up + "</button>");
    parts.push("</div></div>");
    return parts.join("");
  }

  function workingLabel() {
    var label = "Step " + (stepsDone + 1);
    if (actionText) label += " \u00b7 " + actionText;
    return label;
  }

  function updateWorkingRow() {
    var el = document.querySelector(".working-text");
    if (el && state.busy) el.textContent = workingLabel() + "...";
  }

  function exampleBtn(text) {
    return "<button class='example' data-example='" + esc(text) + "'>" + esc(text) + "</button>";
  }

  function toolIcon(name) {
    var n = String(name || "");
    if (/write|edit/.test(n)) return IC.pencil;
    if (/read_file/.test(n)) return IC.eye;
    if (/search/.test(n)) return IC.search;
    if (/list/.test(n)) return IC.list;
    if (/command|automation/.test(n)) return IC.term;
    if (/ask_user|attempt_completion/.test(n)) return IC.chat;
    return IC.file;
  }

  function toolRow(entry) {
    var cls = entry.status === "ok" ? "ok" : entry.status === "error" ? "error" : entry.status === "denied" ? "denied" : "running";
    var statusIcon = { ok: IC.check, error: "&#10007;", denied: "&#9940;", running: "" }[entry.status];
    var parts = ["<details class='act " + cls + "' data-callid='" + esc(entry.callId || "") + "'" + (entry.status === "ok" ? "" : " open") + ">"];
    parts.push("<summary>");
    parts.push("<span class='act-icon'>" + toolIcon(entry.name) + "</span>");
    parts.push("<span class='act-name'>" + esc(entry.name) + "</span>");
    if (entry.argsSummary) parts.push("<span class='act-args'>" + esc(entry.argsSummary) + "</span>");
    parts.push("<span class='act-status'>" + (entry.status === "running" ? "<span class='mini-spinner'></span>" : statusIcon) + "</span>");
    parts.push("</summary>");
    if (entry.output) parts.push("<pre>" + esc(truncateOutput(entry.output)) + "</pre>");
    parts.push("</details>");
    return parts.join("");
  }

  function truncateOutput(s) {
    return s.length > 4000 ? s.slice(0, 4000) + "\\n... (truncated)" : s;
  }

  // ------------------------------------------------------------------
  // Settings SPA
  // ------------------------------------------------------------------

  function renderSettings() {
    var parts = [];
    parts.push("<div class='settings'>");
    parts.push("<div class='settings-head'>");
    parts.push("<button id='btn-back' class='icon-btn back-btn' title='Back to chat'>&larr;</button>");
    parts.push("<span class='settings-title'>Settings</span>");
    parts.push("<span style='width:26px'></span>");
    parts.push("</div>");

    if (editingProfileId === undefined) {
      parts.push("<div class='section-label'>Model profiles</div>");
      parts.push("<div class='hint'>Any OpenAI-compatible endpoint works. Default is <code>opencode zen</code> &mdash; override the URL to point elsewhere (OpenAI, DeepSeek, Ollama...), then fetch its models.</div>");
      state.profiles.forEach(function (p) {
        var isActive = p.id === state.activeProfileId;
        parts.push("<div class='profile-row" + (isActive ? " active" : "") + "'>");
        parts.push("<div class='profile-main'><div class='profile-label'>" + esc(p.label) + (isActive ? " <span class='badge'>Active</span>" : "") + "</div>");
        parts.push("<div class='mono small muted'>" + esc(p.baseUrl) + " &#183; " + esc(p.model || "(no model)") + "</div></div>");
        parts.push("<div class='profile-actions'>");
        if (!isActive) parts.push("<button class='btn sm' data-use='" + esc(p.id) + "'>Use</button>");
        parts.push("<button class='btn sm' data-edit='" + esc(p.id) + "'>Edit</button>");
        parts.push("<button class='btn sm danger' data-del='" + esc(p.id) + "'>&#10005;</button>");
        parts.push("</div></div>");
      });
      parts.push("<button id='btn-add-profile' class='btn primary wide'>Add profile</button>");
    } else {
      var p = editingProfileId ? state.profiles.find(function (x) { return x.id === editingProfileId; }) || {} : {};
      parts.push("<div class='section-label'>" + (editingProfileId ? "Edit profile" : "New profile") + "</div>");
      parts.push("<div class='form'>");

      parts.push(field("Base URL (override)", "<input id='f-baseurl' class='mono' placeholder='" + esc(DEFAULT_BASE_URL) + "' value='" + esc(p.baseUrl || DEFAULT_BASE_URL) + "'/>"));
      parts.push(field("API key", "<input id='f-apikey' type='password' placeholder='not required for local servers' value='" + esc(p.apiKey || "") + "'/>"));
      parts.push(field("Model", "<input id='f-model' class='mono' list='model-list' placeholder='claude-sonnet-5' value='" + esc(p.model || "") + "'/><datalist id='model-list'>" +
        draftModels.map(function (m) { return "<option value='" + esc(m) + "'/>"; }).join("") + "</datalist>"));
      parts.push("<button id='btn-fetch-models' class='btn wide'>" + (draftModels.length || lastModelsError ? "Re-fetch models" : "Fetch models") + "</button>");
      if (lastModelsError) parts.push("<div class='fetch-error'>" + esc(lastModelsError) + "</div>");
      if (draftModels.length) parts.push("<div class='fetch-ok'>" + draftModels.length + " models found</div>");

      parts.push(fieldRow(
        field("Temperature", "<input id='f-temp' type='number' step='0.1' min='0' max='2' value='" + (p.temperature != null ? p.temperature : 0.2) + "'/>"),
        field("Max tokens", "<input id='f-maxtok' type='number' step='256' min='0' value='" + (p.maxTokens != null ? p.maxTokens : "") + "'/>")
      ));

      parts.push("<div class='form-actions'>");
      parts.push("<button id='btn-save-profile' class='btn primary wide'>Save" + (!editingProfileId ? " &amp; use" : "") + "</button>");
      parts.push("</div></div>");
    }
    parts.push("</div>");
    return parts.join("");
  }

  function field(label, inner) {
    return "<label class='field'><span>" + label + "</span>" + inner + "</label>";
  }
  function fieldRow(a, b) {
    return "<div class='row2'>" + a + b + "</div>";
  }

  // ------------------------------------------------------------------
  // Live streaming region
  // ------------------------------------------------------------------

  function ensureStreamEl() {
    var t = document.getElementById("transcript");
    if (!t) return;
    if (streamEl && !streamEl.isConnected) streamEl = null;
    if (!streamEl) {
      streamEl = document.createElement("div");
      streamEl.className = "turn-assistant";
      t.appendChild(streamEl);
    }
    rebuildStreamDom();
    scrollBottom();
  }

  function rebuildStreamDom() {
    if (!streamEl) return;
    var html = "";
    if (reasoningBuf) {
      // Collapses automatically once real content starts arriving (see appendStream).
      html += "<details class='reasoning stream-reasoning'" + (streamBuf ? "" : " open") + ">" +
        "<summary>Thinking</summary><div class='pre'>" + esc(reasoningBuf) + "</div></details>";
    }
    html += "<div class='md streaming'>" + mdRender(streamBuf) + "</div>";
    streamEl.innerHTML = html;
  }

  function paintStream() {
    if (!streamEl) return;
    var md = streamEl.querySelector(".md");
    if (md) md.innerHTML = mdRender(streamBuf);
    var d = streamEl.querySelector(".stream-reasoning");
    if (d && streamBuf) d.open = false;
    scrollBottom();
  }

  function appendStream(delta) {
    // Always buffer, even while settings are open — the buffer survives
    // view switches and is repainted when the chat becomes visible again.
    streamActive = true;
    streamBuf += delta;
    if (!chatVisible()) return;
    ensureStreamEl();
    queuePaint(function () {
      var md = streamEl ? streamEl.querySelector(".md") : null;
      if (md) md.innerHTML = mdRender(streamBuf);
      scrollBottom(false);
    });
  }

  function appendReasoning(delta) {
    streamActive = true;
    reasoningBuf += delta;
    if (!chatVisible()) return;
    ensureStreamEl();
    queuePaint(function () {
      var pre = streamEl ? streamEl.querySelector(".stream-reasoning .pre") : null;
      if (pre) {
        pre.textContent = reasoningBuf;
        pre.parentElement.scrollTop = pre.parentElement.scrollHeight;
      }
      scrollBottom(false);
    });
  }

  function finalizeStream() {
    if (streamEl) {
      streamEl.remove();
      streamEl = null;
    }
    streamBuf = "";
    reasoningBuf = "";
    streamActive = false;
  }

  function scrollBottom(force) {
    var t = document.getElementById("transcript");
    if (!t) return;
    if (force === true) followStream = true; // explicit jumps re-engage following
    if (!followStream) return;
    t.scrollTop = t.scrollHeight;
  }

  // Track manual scroll-away vs return. Capture phase catches the transcript
  // element no matter how often it is rebuilt.
  document.addEventListener("scroll", function (ev) {
    var t = ev.target;
    if (!t || t.id !== "transcript") return;
    var dist = t.scrollHeight - t.scrollTop - t.clientHeight;
    if (dist > 200) followStream = false;
    else if (dist < 60) followStream = true;
  }, true);

  function queuePaint(fn) {
    if (paintQueued) return;
    paintQueued = true;
    requestAnimationFrame(function () {
      paintQueued = false;
      fn();
    });
  }

  // ------------------------------------------------------------------
  // Events from extension
  // ------------------------------------------------------------------

  function findEntryByCallId(callId) {
    for (var i = state.transcript.length - 1; i >= 0; i--) {
      var t = state.transcript[i];
      if (t.kind === "tool" && t.callId === callId) return t;
    }
    return null;
  }

  function updateCardInPlace(entry) {
    var safeId = String(entry.callId || "").replace(new RegExp("[^A-Za-z0-9_-]", "g"), "");
    var card = document.querySelector("details.act[data-callid='" + safeId + "']");
    if (!card) return false;
    var cls = entry.status === "ok" ? "ok" : entry.status === "error" ? "error" : entry.status === "denied" ? "denied" : "running";
    card.className = "act " + cls;
    if (entry.status !== "running") {
      card.open = false; // collapse finished actions
      var st = card.querySelector(".act-status");
      if (st) st.innerHTML = entry.status === "ok" ? IC.check : (entry.status === "error" ? "&#10007;" : "&#9940;");
    }
    if (entry.output) {
      var pre = card.querySelector("pre");
      if (!pre) {
        pre = document.createElement("pre");
        card.appendChild(pre);
      }
      pre.textContent = tailOutput(entry.output);
    }
    return true;
  }

  window.addEventListener("message", function (e) {
    var msg = e.data;
    switch (msg.type) {
      case "state": {
        var wasBusy = state.busy;
        var nextBusy = !!(msg.state && msg.state.busy);
        state = Object.assign(state, msg.state);
        // Reset the buffer when a run starts or ends; KEEP it on mid-run pushes
        // (approval, auto-approve toggle, ...) so streamed text never vanishes.
        if (!nextBusy || !wasBusy) {
          finalizeStream();
          stepsDone = 0;
          actionText = "";
        }
        var viewChanged = currentView !== desiredView();
        var transcriptReset = state.transcript.length < renderedCount;
        if (viewChanged || transcriptReset) {
          render(); // structural change only
        } else {
          syncDynamic(); // in-place update — no flicker
        }
        break;
      }
      case "status":
        if (!state.busy) break;
        if (msg.phase === "thinking") { actionText = ""; updateWorkingRow(); }
        else if (msg.phase === "executing") { actionText = String(msg.detail || ""); updateWorkingRow(); }
        break;
      case "assistant_delta":
        appendStream(msg.text);
        if (streamBuf) { actionText = "Responding"; updateWorkingRow(); }
        break;
      case "reasoning_delta":
        appendReasoning(msg.text);
        break;
      case "stream_reset":
        // Retry loop discarded a failed attempt — drop its live buffers.
        if (streamEl) { streamEl.remove(); streamEl = null; }
        streamBuf = "";
        reasoningBuf = "";
        break;
      case "assistant_message": {
        // Commit locally so the finished message shows immediately, even before
        // the next full-state push arrives.
        finalizeStream();
        stepsDone++;
        actionText = "";
        state.transcript.push({ kind: "assistant", text: msg.text, reasoning: msg.reasoning });
        if (chatVisible()) {
          syncTranscript();
          syncWorkingRow();
        } else {
          updateWorkingRow();
        }
        break;
      }
      case "tool_start": {
        if (!findEntryByCallId(msg.callId)) {
          state.transcript.push({
            kind: "tool", callId: msg.callId, name: msg.name,
            argsSummary: msg.argsSummary || "", status: "running", output: "",
          });
          if (chatVisible()) syncTranscript(); // appends just this card
        }
        if (state.busy) {
          actionText = msg.name + (msg.argsSummary ? " \u00b7 " + String(msg.argsSummary).slice(0, 48) : "");
          updateWorkingRow();
        }
        break;
      }
      case "tool_output": {
        var entry = findEntryByCallId(msg.callId);
        if (!entry) break;
        entry.output = (entry.output || "") + msg.text;
        if (entry.output.length > 8000) entry.output = entry.output.slice(-8000);
        // Update the card's <pre> in place — no re-render per chunk.
        if (!updateCardInPlace(entry) && chatVisible()) syncTranscript();
        break;
      }
      case "tool_result": {
        var e2 = findEntryByCallId(msg.callId);
        if (e2 && e2.status === "running") {
          e2.status = msg.output === "(denied)" ? "denied" : (msg.ok ? "ok" : "error");
          e2.output = msg.output === "(denied)" ? "" : String(msg.output || "");
          stepsDone++;
          if (chatVisible()) {
            if (!updateCardInPlace(e2)) syncTranscript();
            scrollBottom(false);
          }
        }
        if (state.busy) { actionText = ""; updateWorkingRow(); }
        break;
      }
      case "modelsResult":
        if (msg.error) { lastModelsError = msg.error; draftModels = []; }
        else { lastModelsError = ""; draftModels = msg.models || []; }
        render();
        break;
    }
  });

  function tailOutput(s) {
    return s.length > 4000 ? s.slice(-4000) : s;
  }

  // ------------------------------------------------------------------
  // DOM events -> extension
  // ------------------------------------------------------------------

  function wire() {
    var q = function (id) { return document.getElementById(id); };

    if (q("btn-settings")) q("btn-settings").onclick = function () {
      chatsView = false;
      editingProfileId = undefined;
      vscode.postMessage({ type: state.settingsVisible ? "closeSettings" : "openSettings" });
    };
    if (q("btn-chats")) q("btn-chats").onclick = function () {
      chatsView = !chatsView;
      render();
    };
    if (q("btn-new")) q("btn-new").onclick = function () {
      chatsView = false;
      vscode.postMessage({ type: "newTask" });
    };
    if (q("btn-new-chat")) q("btn-new-chat").onclick = function () {
      chatsView = false;
      vscode.postMessage({ type: "newTask" });
    };
    if (q("btn-back")) q("btn-back").onclick = function () {
      var wasSettings = state.settingsVisible;
      chatsView = false;
      editingProfileId = undefined;
      if (wasSettings) vscode.postMessage({ type: "closeSettings" });
      else render();
    };
    if (q("btn-send")) q("btn-send").onclick = submit;
    if (q("btn-stop")) q("btn-stop").onclick = function () { vscode.postMessage({ type: "cancel" }); };

    var input = q("input");
    if (input) {
      input.onkeydown = function (ev) {
        if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); submit(); }
      };
      autoSize(input);
      input.focus();
    }

    var aa = q("aa-toggle");
    if (aa) aa.onclick = function () {
      var v = !state.autoApprove;
      state.autoApprove = v;
      vscode.postMessage({ type: "autoApprove", value: v });
      syncAutoPill(); // in-place — no rebuild
    };
    var mc = q("model-chip");
    if (mc) mc.onclick = function () { editingProfileId = undefined; vscode.postMessage({ type: "openSettings" }); };

    document.querySelectorAll(".example[data-example]").forEach(function (b) {
      b.onclick = function () { var inp = q("input"); if (inp) { inp.value = b.getAttribute("data-example"); inp.focus(); autoSize(inp); } };
    });

    if (q("btn-add-profile")) q("btn-add-profile").onclick = function () { draftModels = []; lastModelsError = ""; editingProfileId = null; render(); };
    if (q("btn-cancel-profile")) q("btn-cancel-profile").onclick = function () { editingProfileId = undefined; render(); };

    document.querySelectorAll(".chat-row[data-chat-id]").forEach(function (row) {
      row.onclick = function (ev) {
        if (ev.target && ev.target.closest && ev.target.closest("[data-del-chat]")) return;
        chatsView = false;
        vscode.postMessage({ type: "openChat", id: row.getAttribute("data-chat-id") });
      };
    });
    document.querySelectorAll("[data-del-chat]").forEach(function (b) {
      b.onclick = function (ev) {
        ev.stopPropagation();
        vscode.postMessage({ type: "deleteChat", id: b.getAttribute("data-del-chat") });
      };
    });

    document.querySelectorAll("[data-use]").forEach(function (b) {
      b.onclick = function () { vscode.postMessage({ type: "setActiveProfile", id: b.getAttribute("data-use") }); };
    });
    document.querySelectorAll("[data-edit]").forEach(function (b) {
      b.onclick = function () { draftModels = []; lastModelsError = ""; editingProfileId = b.getAttribute("data-edit"); render(); };
    });
    document.querySelectorAll("[data-del]").forEach(function (b) {
      b.onclick = function () { vscode.postMessage({ type: "deleteProfile", id: b.getAttribute("data-del") }); };
    });

    if (q("btn-fetch-models")) q("btn-fetch-models").onclick = function () {
      lastModelsError = ""; draftModels = [];
      vscode.postMessage({
        type: "fetchModels",
        profile: { baseUrl: val("f-baseurl"), apiKey: val("f-apikey"), model: val("f-model") },
      });
    };
    if (q("btn-save-profile")) q("btn-save-profile").onclick = function () {
      vscode.postMessage({
        type: "saveProfile",
        makeActive: true,
        profile: {
          id: editingProfileId || undefined,
          baseUrl: val("f-baseurl"),
          apiKey: val("f-apikey"),
          model: val("f-model"),
          temperature: parseFloat(val("f-temp")) || undefined,
          maxTokens: parseInt(val("f-maxtok"), 10) || undefined,
        },
      });
    };
  }

  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }

  function submit() {
    var input = document.getElementById("input");
    if (!input || !input.value.trim()) return;
    var task = input.value;
    input.value = "";
    followStream = true;
    vscode.postMessage({ type: "submit", task: task });
  }

  function autoSize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }

  render();
  vscode.postMessage({ type: "ready" });
})();
`;
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;" />
<style>
  :root { color-scheme: dark; --r-lg: 12px; --r-md: 8px; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0; height: 100vh; display: flex; flex-direction: column;
    font-family: var(--vscode-font-family); font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground); background: var(--vscode-sideBar-background);
  }
  #app { display: flex; flex-direction: column; height: 100%; }

  /* ---------- header ---------- */
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px 8px; flex-shrink: 0;
  }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 600; letter-spacing: .2px; font-size: 13px; }
  .brand-glyph {
    width: 20px; height: 20px; border-radius: 6px;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; font-weight: 700;
  }
  .header-actions { display: flex; gap: 2px; }
  .icon-btn {
    background: transparent; border: none; color: var(--vscode-foreground); opacity: .8;
    width: 26px; height: 26px; border-radius: 6px; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; padding: 0;
  }
  .icon-btn:hover { background: var(--vscode-toolbar-hoverBackground); opacity: 1; }

  /* ---------- transcript ---------- */
  .transcript { flex: 1; overflow-y: auto; padding: 4px 14px 10px; min-height: 0; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
  .turn-user {
    background: rgba(128,128,128,.10); border-radius: var(--r-lg);
    padding: 8px 11px; margin: 12px 0 6px; white-space: pre-wrap; word-break: break-word;
    line-height: 1.45; animation: fadeUp .18s ease-out;
  }
  .turn-assistant {
    margin: 10px 0 4px; white-space: pre-wrap; word-break: break-word; line-height: 1.55;
    animation: fadeUp .18s ease-out;
  }
  .turn-assistant.streaming::after { content: ""; display: inline-block; width: 7px; height: 13px;
    background: currentColor; opacity: .7; vertical-align: text-bottom; margin-left: 2px;
    animation: blink 1s steps(1) infinite; border-radius: 1px; }
  @keyframes blink { 50% { opacity: 0; } }
  .md-h { font-weight: 700; margin-top: 8px; }
  .md-li { padding-left: 14px; position: relative; }
  .md-li::before { content: "-"; position: absolute; left: 2px; opacity: .55; }
  .md-gap { height: 6px; }
  code {
    font-family: var(--vscode-editor-font-family, monospace); font-size: 12px;
    background: rgba(128,128,128,.15); border-radius: 4px; padding: 1px 4px;
  }
  pre {
    background: rgba(128,128,128,.12); border-radius: var(--r-md); padding: 8px 10px;
    overflow-x: auto; white-space: pre-wrap; word-break: break-word; margin: 6px 0;
    font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; line-height: 1.5;
  }
  pre code { background: transparent; padding: 0; }
  .reasoning summary { cursor: pointer; font-size: 11px; opacity: .55; margin-top: 6px; user-select: none; }
  .reasoning .pre { font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; opacity: .7;
    white-space: pre-wrap; margin: 4px 0 0 8px; }

  /* ---------- empty state ---------- */
  .empty { text-align: center; margin-top: 15vh; padding: 0 8px; animation: fadeUp .25s ease-out; }
  .empty-glyph {
    width: 44px; height: 44px; border-radius: 12px; margin: 0 auto 14px;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--vscode-editor-font-family, monospace); font-size: 18px; font-weight: 700;
  }
  .empty-title { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
  .empty-sub { font-size: 12px; opacity: .6; line-height: 1.5; max-width: 260px; margin: 0 auto; }
  .examples { margin-top: 22px; display: flex; flex-direction: column; gap: 6px; align-items: center; }
  .example {
    background: transparent; color: var(--vscode-descriptionForeground, var(--vscode-foreground));
    border: 1px solid var(--vscode-panel-border, #444); border-radius: 999px;
    padding: 5px 14px; cursor: pointer; font-size: 12px; max-width: 100%;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: border-color .12s, color .12s;
  }
  .example:hover { border-color: var(--vscode-focusBorder); color: var(--vscode-foreground); }

  /* ---------- activity rows (tool calls) ---------- */
  details.act {
    margin: 5px 0; font-size: 12px; border-radius: var(--r-md);
    background: rgba(128,128,128,.07); border: 1px solid transparent;
  }
  details.act.error { border-color: rgba(255,102,102,.35); }
  details.act.denied { border-color: rgba(255,204,0,.35); }
  details.act.running { border-color: rgba(128,128,128,.25); }
  details.act summary {
    cursor: pointer; padding: 5px 9px; display: flex; gap: 7px; align-items: center;
    list-style: none; overflow: hidden; user-select: none;
  }
  details.act summary::-webkit-details-marker { display: none; }
  details.act summary::before {
    content: "\\25B8"; font-size: 9px; opacity: .45; flex-shrink: 0;
    transition: transform .12s ease; width: 9px;
  }
  details.act[open] summary::before { transform: rotate(90deg); }
  .act-icon { opacity: .65; display: inline-flex; flex-shrink: 0; }
  .act-name { font-weight: 600; flex-shrink: 0; }
  .act-args {
    opacity: .55; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; min-width: 0;
  }
  .act-status { margin-left: auto; flex-shrink: 0; opacity: .8; display: inline-flex; align-items: center; }
  details.act.ok .act-status { color: var(--vscode-testing-iconPassed, #4caf50); }
  details.act.error .act-status { color: var(--vscode-errorForeground, #f66); }
  details.act.denied .act-status { color: var(--vscode-editorWarning-foreground, #fc0); }
  details.act pre { margin: 0; border-radius: 0 0 var(--r-md) var(--r-md); max-height: 260px; overflow-y: auto; }

  @keyframes pulse { 50% { opacity: .25; } }
  .mini-spinner, .spinner {
    width: 8px; height: 8px; border-radius: 50%; background: currentColor;
    animation: pulse 1s ease-in-out infinite; display: inline-block;
  }
  .spinner { width: 9px; height: 9px; }

  /* ---------- notices ---------- */
  .notice {
    text-align: center; font-size: 12px; opacity: .6; margin: 14px 0;
    border-top: 1px dashed rgba(128,128,128,.3); padding-top: 10px;
  }

  /* ---------- approval card ---------- */
  .approval {
    margin: 0 12px 8px; flex-shrink: 0;
    border: 1px solid var(--vscode-focusBorder); border-radius: var(--r-lg);
    padding: 10px 12px; background: rgba(128,128,128,.06); animation: fadeUp .18s ease-out;
  }
  .approval-head { font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: var(--vscode-focusBorder); font-weight: 700; }
  .approval-title { font-weight: 600; margin: 5px 0; }
  .approval-detail {
    font-family: var(--vscode-editor-font-family, monospace); font-size: 11px;
    max-height: 140px; overflow-y: auto; white-space: pre-wrap; word-break: break-word;
    background: rgba(128,128,128,.12); border-radius: 6px; padding: 6px 8px; margin: 4px 0 8px;
  }
  .approval-actions { display: flex; gap: 6px; flex-wrap: wrap; }

  /* ---------- composer ---------- */
  .composer-wrap { padding: 4px 12px 10px; flex-shrink: 0; }
  .working-row {
    display: flex; align-items: center; gap: 8px; padding: 2px 6px 8px;
    font-size: 12px; opacity: .75;
  }
  .composer {
    border: 1px solid var(--vscode-panel-border, #555); border-radius: var(--r-lg);
    background: var(--vscode-editor-background, rgba(128,128,128,.08));
    transition: border-color .12s ease; overflow: hidden;
  }
  .composer:focus-within { border-color: var(--vscode-focusBorder); }
  .composer textarea {
    display: block; width: 100%; resize: none; max-height: 180px; min-height: 38px;
    background: transparent; color: var(--vscode-input-foreground, inherit);
    border: none; outline: none; padding: 10px 12px 6px;
    font-family: inherit; font-size: 13px; line-height: 1.45;
  }
  .composer textarea::placeholder { color: var(--vscode-input-placeholderForeground, rgba(128,128,128,.7)); }
  .composer-foot { display: flex; align-items: center; gap: 6px; padding: 2px 6px 7px; flex-wrap: wrap; }
  .pill {
    display: inline-flex; align-items: center; gap: 5px;
    background: rgba(128,128,128,.12); color: var(--vscode-descriptionForeground, inherit);
    border: none; border-radius: 999px; padding: 3px 9px;
    font-size: 11px; cursor: pointer; max-width: 60%; transition: background .12s, color .12s;
  }
  .pill span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pill:hover { background: rgba(128,128,128,.22); color: var(--vscode-foreground); }
  .pill.on { color: var(--vscode-testing-iconPassed, #6c6); }
  .send-btn {
    margin-left: auto; width: 26px; height: 26px; border-radius: 50%; border: none;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;
    transition: filter .12s;
  }
  .send-btn:hover { filter: brightness(1.2); }
  .send-btn.stop {
    background: transparent; border: 1px solid var(--vscode-errorForeground);
    color: var(--vscode-errorForeground);
  }

  /* ---------- buttons ---------- */
  .btn {
    background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
    border: none; border-radius: 6px; padding: 5px 11px; cursor: pointer; font-size: 12px;
    transition: filter .12s;
  }
  .btn:hover { filter: brightness(1.18); }
  .btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn.danger { background: transparent; color: var(--vscode-errorForeground); border: 1px solid var(--vscode-errorForeground); }
  .btn.sm { padding: 3px 9px; font-size: 11px; border-radius: 999px; }
  .btn.wide { width: 100%; padding: 7px; margin-top: 4px; }

  /* ---------- settings ---------- */
  .settings { flex: 1; overflow-y: auto; padding: 0 12px 14px; min-height: 0; }
  .settings-head { display: grid; grid-template-columns: 26px 1fr 26px; align-items: center; margin-bottom: 10px; }
  .back-btn { justify-self: start; }
  .settings-title { text-align: center; font-weight: 600; font-size: 13px; }
  .section-label { font-size: 11px; text-transform: uppercase; letter-spacing: .8px; opacity: .6; margin: 8px 0; font-weight: 600; }
  .hint { font-size: 11px; opacity: .6; margin-bottom: 12px; line-height: 1.45; }
  .profile-row {
    border: 1px solid var(--vscode-panel-border, #333); border-radius: var(--r-md);
    padding: 9px 11px; margin-bottom: 8px; display: flex; justify-content: space-between;
    gap: 8px; align-items: center; transition: border-color .12s;
  }
  .profile-row.active { border-color: var(--vscode-focusBorder); background: rgba(128,128,128,.06); }
  .profile-label { font-weight: 600; margin-bottom: 2px; }
  .badge {
    font-size: 9px; text-transform: uppercase; letter-spacing: .5px;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border-radius: 999px; padding: 1px 7px; vertical-align: middle; margin-left: 4px;
  }
  .profile-actions { display: flex; gap: 4px; flex-shrink: 0; }
  .icon-btn.active { background: var(--vscode-toolbar-hoverBackground); opacity: 1; }
  .chat-row {
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
    border-radius: var(--r-md); padding: 8px 10px; margin-bottom: 4px;
    cursor: pointer; transition: background .12s;
  }
  .chat-row:hover { background: rgba(128,128,128,.12); }
  .chat-row.active { background: rgba(128,128,128,.10); border-left: 2px solid var(--vscode-focusBorder); padding-left: 8px; }
  .chat-main { min-width: 0; flex: 1; }
  .chat-title { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chat-date { font-size: 11px; opacity: .55; margin-top: 1px; }
  .del-chat { width: 24px; height: 24px; opacity: .45; }
  .chat-row:hover .del-chat { opacity: .9; }
  .small { font-size: 11px; }
  .muted { opacity: .6; }
  .mono { font-family: var(--vscode-editor-font-family, monospace); }

  .form { display: flex; flex-direction: column; gap: 10px; }
  .field { display: flex; flex-direction: column; gap: 4px; font-size: 11px; }
  .field span { opacity: .7; }
  .field input, .field select {
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: var(--r-md);
    padding: 7px 9px; font-size: 12px; outline: none; transition: border-color .12s;
  }
  .field input:focus, .field select:focus { border-color: var(--vscode-focusBorder); }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .form-actions { margin-top: 4px; }
  .fetch-ok { font-size: 11px; color: var(--vscode-testing-iconPassed, #7c7); }
  .fetch-error { font-size: 11px; color: var(--vscode-errorForeground); white-space: pre-wrap; }

  /* ---------- scrollbars ---------- */
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: rgba(128,128,128,.28); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,.45); }
  ::-webkit-scrollbar-track { background: transparent; }
</style>
</head>
<body>
<div id="app"></div>
<script nonce="${nonce}">${script}</script>
</body>
</html>`;
}
//# sourceMappingURL=webviewHtml.js.map