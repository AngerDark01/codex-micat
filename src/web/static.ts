export const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Micat Console</title>
  <link rel="stylesheet" href="/assets/app.css">
</head>
<body>
  <div class="shell">
    <aside class="rail">
      <div class="brand">
        <div class="mark">M</div>
        <div>
          <h1>Micat</h1>
          <p id="storageRoot">loading</p>
        </div>
      </div>
      <div class="rail-actions">
        <button id="refreshBtn" class="primary">Refresh</button>
      </div>
      <div class="session-list" id="sessionList"></div>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <nav class="tabs">
          <button class="tab active" data-view="session">Session</button>
          <button class="tab" data-view="prompt">Prompt</button>
          <button class="tab" data-view="config">Config</button>
        </nav>
        <div class="status" id="statusText">Ready</div>
      </header>

      <section id="sessionView" class="view active">
        <div class="summary" id="sessionSummary"></div>
        <div class="detail-tabs">
          <button class="detail-tab active" data-detail="rounds">Rounds</button>
          <button class="detail-tab" data-detail="traces">Traces</button>
          <button class="detail-tab" data-detail="rules">Rules</button>
          <button class="detail-tab" data-detail="context">Context</button>
          <button class="detail-tab" data-detail="errors">Errors</button>
        </div>
        <div id="sessionDetail" class="panel"></div>
      </section>

      <section id="promptView" class="view">
        <div class="editor-head">
          <div>
            <h2>Rollup Prompt</h2>
            <p id="promptPath"></p>
          </div>
          <button id="savePromptBtn" class="primary">Save</button>
        </div>
        <textarea id="promptEditor" spellcheck="false"></textarea>
      </section>

      <section id="configView" class="view">
        <div class="editor-head">
          <div>
            <h2>Runtime Config</h2>
            <p id="configPath"></p>
          </div>
          <div class="actions">
            <button id="testLlmBtn">Test LLM</button>
            <button id="saveConfigBtn" class="primary">Save</button>
          </div>
        </div>
        <form id="configForm" class="config-grid"></form>
        <div id="llmTestResult" class="test-result">LLM test has not run yet.</div>
      </section>
    </main>
  </div>
  <script src="/assets/app.js"></script>
</body>
</html>`;

export const APP_CSS = `:root {
  --bg: #f5f4ef;
  --ink: #1d1f21;
  --muted: #686b70;
  --line: #d9d5cb;
  --panel: #fffdf8;
  --accent: #176b5b;
  --accent-2: #b84a35;
  --warn: #a36a00;
  --bad: #a13737;
  --code: #151714;
  --code-ink: #e9efe7;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0;
}

button, input, textarea {
  font: inherit;
}

button {
  border: 1px solid var(--line);
  background: #fffaf0;
  color: var(--ink);
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
}

button:hover { border-color: var(--accent); }
button.primary {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(280px, 340px) 1fr;
}

.rail {
  border-right: 1px solid var(--line);
  background: #ece8dd;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.brand {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 18px;
  border-bottom: 1px solid var(--line);
}

.mark {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: var(--ink);
  color: #f7ecd4;
  font-weight: 800;
}

.brand h1 {
  margin: 0;
  font-size: 18px;
}

.brand p, .editor-head p {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 12px;
  word-break: break-all;
}

.rail-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--line);
}

.session-list {
  overflow: auto;
  padding: 10px;
}

.session-item {
  width: 100%;
  text-align: left;
  background: transparent;
  border-color: transparent;
  padding: 10px;
  margin-bottom: 6px;
}

.session-item.active {
  background: var(--panel);
  border-color: var(--accent);
}

.session-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-meta {
  margin-top: 6px;
  color: var(--muted);
  font-size: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.workspace {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  min-height: 56px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  background: var(--panel);
}

.tabs, .detail-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tab, .detail-tab {
  background: transparent;
  border-color: transparent;
}

.tab.active, .detail-tab.active {
  background: #ede6d7;
  border-color: var(--line);
}

.status {
  color: var(--muted);
  font-size: 12px;
}

.view {
  display: none;
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 18px;
}

.view.active { display: block; }

.summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(120px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.metric {
  border: 1px solid var(--line);
  background: var(--panel);
  border-radius: 8px;
  padding: 10px;
  min-width: 0;
}

.metric b {
  display: block;
  font-size: 18px;
}

.metric span {
  color: var(--muted);
  font-size: 12px;
}

.detail-tabs {
  margin-bottom: 10px;
}

.panel {
  border: 1px solid var(--line);
  background: var(--panel);
  border-radius: 8px;
  min-height: 360px;
  overflow: hidden;
}

.split {
  display: grid;
  grid-template-columns: minmax(260px, 380px) 1fr;
  min-height: 520px;
}

.list-pane {
  border-right: 1px solid var(--line);
  overflow: auto;
  max-height: 70vh;
}

.viewer-pane {
  min-width: 0;
  overflow: auto;
  max-height: 70vh;
}

.row {
  padding: 12px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}

.row.active {
  background: #f2eadb;
}

.row-title {
  font-weight: 700;
  font-size: 13px;
  margin-bottom: 4px;
}

.row-sub {
  color: var(--muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

pre {
  margin: 0;
  padding: 14px;
  background: var(--code);
  color: var(--code-ink);
  min-height: 100%;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.doc {
  padding: 14px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.55;
}

.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.editor-head h2 {
  margin: 0;
  font-size: 18px;
}

textarea {
  width: 100%;
  min-height: 68vh;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--ink);
  padding: 14px;
  line-height: 1.55;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(220px, 1fr));
  gap: 12px;
}

.field {
  display: grid;
  gap: 6px;
  border: 1px solid var(--line);
  background: var(--panel);
  border-radius: 8px;
  padding: 12px;
}

.field label {
  font-weight: 700;
  font-size: 12px;
}

.field input {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px;
  background: #fffaf2;
}

.test-result {
  margin-top: 12px;
  border: 1px solid var(--line);
  background: var(--panel);
  border-radius: 8px;
  padding: 12px;
  color: var(--muted);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.test-result b {
  display: block;
  color: var(--ink);
  margin-bottom: 4px;
}

.test-result.ok {
  border-color: #9cc7ae;
  color: var(--ink);
}

.test-result.error {
  border-color: #d6a09a;
  color: var(--bad);
}

.test-result.pending {
  border-color: #d6bd77;
  color: var(--warn);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid var(--line);
}

.badge {
  display: inline-block;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  background: #e7dfd0;
  color: var(--ink);
}

.badge.error { background: #f2d8d3; color: var(--bad); }
.badge.ok { background: #d8e8df; color: var(--accent); }

@media (max-width: 900px) {
  .shell { grid-template-columns: 1fr; }
  .rail { max-height: 46vh; border-right: 0; border-bottom: 1px solid var(--line); }
  .summary, .config-grid { grid-template-columns: 1fr 1fr; }
  .split { grid-template-columns: 1fr; }
  .list-pane { border-right: 0; border-bottom: 1px solid var(--line); max-height: 280px; }
}

@media (max-width: 560px) {
  .summary, .config-grid { grid-template-columns: 1fr; }
  .topbar, .editor-head { align-items: flex-start; flex-direction: column; }
}
`;

export const APP_JS = `const state = {
  sessions: [],
  selectedId: null,
  detail: null,
  detailTab: "rounds",
  selectedItem: null,
  config: null,
};

const $ = (id) => document.getElementById(id);

function setStatus(text) {
  $("statusText").textContent = text;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

function formatDate(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function shortId(value) {
  return value ? String(value).slice(0, 8) + "..." + String(value).slice(-6) : "";
}

async function refreshAll() {
  setStatus("Loading");
  const [config, sessions] = await Promise.all([
    api("/api/config"),
    api("/api/sessions"),
  ]);
  state.config = config;
  state.sessions = sessions.sessions;
  $("storageRoot").textContent = config.storage.root;
  renderSessions();
  renderConfig();
  await loadPrompt();
  if (!state.selectedId && state.sessions[0]) state.selectedId = state.sessions[0].session_id;
  if (state.selectedId) await loadSession(state.selectedId);
  setStatus("Ready");
}

function renderSessions() {
  $("sessionList").innerHTML = state.sessions.map((session) => {
    const active = session.session_id === state.selectedId ? " active" : "";
    const status = renderSessionStatus(session);
    return '<button class="session-item' + active + '" data-session="' + escapeHtml(session.session_id) + '">' +
      '<div class="session-id">' + escapeHtml(session.session_id) + '</div>' +
      '<div class="session-meta">' +
      '<span>rounds ' + escapeHtml(session.rounds_completed ?? 0) + '</span>' +
      '<span>rollup ' + escapeHtml(session.last_rollup_round ?? 0) + '</span>' +
      status +
      '</div>' +
      '<div class="session-meta">' + escapeHtml(formatDate(session.last_seen_at)) + '</div>' +
      '</button>';
  }).join("");

  document.querySelectorAll("[data-session]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedId = button.getAttribute("data-session");
      state.selectedItem = null;
      renderSessions();
      await loadSession(state.selectedId);
    });
  });
}

function renderSessionStatus(session) {
  const oldErrors = Number(session.errors_count || 0);
  const oldErrorBadge = oldErrors > 0 ? '<span class="badge">old errors ' + escapeHtml(oldErrors) + '</span>' : "";
  if (session.latest_trace_status === "error") return '<span class="badge error">latest error</span>' + oldErrorBadge;
  if (session.latest_trace_status === "ok") return '<span class="badge ok">latest ok</span>' + oldErrorBadge;
  if (oldErrors > 0) return '<span class="badge">old errors ' + escapeHtml(oldErrors) + '</span>';
  return '<span class="badge ok">ok</span>';
}

async function loadSession(sessionId) {
  setStatus("Loading session");
  state.detail = await api("/api/sessions/" + encodeURIComponent(sessionId));
  renderSession();
  setStatus("Ready");
}

function renderSession() {
  const detail = state.detail;
  if (!detail) {
    $("sessionSummary").innerHTML = "";
    $("sessionDetail").innerHTML = '<div class="doc">No session selected.</div>';
    return;
  }

  $("sessionSummary").innerHTML = [
    metric("Rounds", detail.rounds.length),
    metric("Rollup", detail.meta?.last_rollup_round ?? 0),
    metric("Pending", detail.pending.length),
    metric("Traces", detail.traces.length),
    metric("Errors", detail.errors.length),
  ].join("");
  renderDetailTab();
}

function metric(label, value) {
  return '<div class="metric"><b>' + escapeHtml(value) + '</b><span>' + escapeHtml(label) + '</span></div>';
}

function renderDetailTab() {
  document.querySelectorAll(".detail-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.detail === state.detailTab);
  });
  const detail = state.detail;
  if (!detail) return;

  if (state.detailTab === "rounds") renderRounds(detail);
  if (state.detailTab === "traces") renderTraces(detail);
  if (state.detailTab === "rules") renderDoc(detail.active_rules_markdown || "No active rules.");
  if (state.detailTab === "context") renderDoc(detail.micat_context || "No Micat context.");
  if (state.detailTab === "errors") renderJsonList(detail.errors, "No errors.");
}

function renderRounds(detail) {
  const rounds = detail.rounds;
  const selected = state.selectedItem ?? Math.max(0, rounds.length - 1);
  state.selectedItem = selected;
  $("sessionDetail").innerHTML = '<div class="toolbar"><div><span class="badge">' + escapeHtml(detail.meta?.cwd || "no cwd") + '</span></div>' +
    '<button id="runRollupBtn" class="primary">Run rollup</button></div>' +
    '<div class="split"><div class="list-pane">' +
    rounds.map((round, index) => '<div class="row' + (index === selected ? " active" : "") + '" data-item="' + index + '">' +
      '<div class="row-title">Round ' + (index + 1) + '</div>' +
      '<div class="row-sub">' + escapeHtml(round.user_prompt) + '</div>' +
      '</div>').join("") +
    '</div><div class="viewer-pane"><pre>' + escapeHtml(JSON.stringify(rounds[selected] || {}, null, 2)) + '</pre></div></div>';
  wireRows();
  $("runRollupBtn").addEventListener("click", runSelectedRollup);
}

function renderTraces(detail) {
  const traces = detail.traces;
  const selected = state.selectedItem ?? Math.max(0, traces.length - 1);
  state.selectedItem = selected;
  $("sessionDetail").innerHTML = '<div class="toolbar"><div><span class="badge">rollup trace</span></div>' +
    '<button id="runRollupBtn" class="primary">Run rollup</button></div>' +
    '<div class="split"><div class="list-pane">' +
    traces.map((trace, index) => '<div class="row' + (index === selected ? " active" : "") + '" data-item="' + index + '">' +
      '<div class="row-title">' + escapeHtml(trace.reason) + ' - ' + escapeHtml(trace.status) + '</div>' +
      '<div class="row-sub">rounds ' + escapeHtml(trace.batch?.from_round) + '-' + escapeHtml(trace.batch?.to_round) + ' - ' + escapeHtml(formatDate(trace.finished_at)) + '</div>' +
      '</div>').join("") +
    '</div><div class="viewer-pane"><pre>' + escapeHtml(JSON.stringify(traces[selected] || {}, null, 2)) + '</pre></div></div>';
  wireRows();
  $("runRollupBtn").addEventListener("click", runSelectedRollup);
}

function renderDoc(text) {
  $("sessionDetail").innerHTML = '<div class="doc">' + escapeHtml(text) + '</div>';
}

function renderJsonList(items, empty) {
  $("sessionDetail").innerHTML = '<pre>' + escapeHtml(items.length ? JSON.stringify(items, null, 2) : empty) + '</pre>';
}

function wireRows() {
  document.querySelectorAll("[data-item]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedItem = Number(row.getAttribute("data-item"));
      renderDetailTab();
    });
  });
}

async function runSelectedRollup() {
  if (!state.selectedId) return;
  setStatus("Running rollup");
  try {
    const result = await api("/api/sessions/" + encodeURIComponent(state.selectedId) + "/rollup", { method: "POST" });
    await refreshAll();
    state.selectedId = result.session_id || state.selectedId;
    await loadSession(state.selectedId);
    state.detailTab = "traces";
    state.selectedItem = null;
    renderDetailTab();
    setStatus("Rollup batches " + result.batches);
  } catch (error) {
    setStatus(error.message);
  }
}

async function loadPrompt() {
  const prompt = await api("/api/prompt");
  $("promptPath").textContent = prompt.path;
  $("promptEditor").value = prompt.content;
}

async function savePrompt() {
  setStatus("Saving prompt");
  await api("/api/prompt", {
    method: "PUT",
    body: JSON.stringify({ content: $("promptEditor").value }),
  });
  setStatus("Prompt saved");
}

function renderConfig() {
  if (!state.config) return;
  $("configPath").textContent = state.config.config_path;
  const fields = [
    ["base_url", "Base URL", state.config.model.base_url],
    ["model", "Model", state.config.model.model],
    ["reasoning_effort", "Reasoning effort", state.config.model.reasoning_effort || ""],
    ["timeout_ms", "Timeout ms", state.config.model.timeout_ms],
    ["rounds", "Rounds per batch", state.config.rollup.rounds],
    ["max_backfill_rounds", "Max backfill rounds", state.config.rollup.max_backfill_rounds],
    ["max_injected_chars", "Max injected chars", state.config.rollup.max_injected_chars],
    ["precompact_timeout_ms", "Precompact timeout ms", state.config.rollup.precompact_timeout_ms],
  ];
  $("configForm").innerHTML = fields.map(([name, label, value]) =>
    '<div class="field"><label for="cfg-' + name + '">' + label + '</label>' +
    '<input id="cfg-' + name + '" name="' + name + '" value="' + escapeHtml(value) + '"></div>'
  ).join("") + '<div class="field"><label>API key</label><input value="' + (state.config.model.api_key_configured ? "(configured)" : "(missing)") + '" disabled></div>';
}

async function saveConfig() {
  const form = new FormData($("configForm"));
  setStatus("Saving config");
  await api("/api/config", {
    method: "PUT",
    body: JSON.stringify({
      base_url: form.get("base_url"),
      model: form.get("model"),
      reasoning_effort: form.get("reasoning_effort"),
      timeout_ms: Number(form.get("timeout_ms")),
      rounds: Number(form.get("rounds")),
      max_backfill_rounds: Number(form.get("max_backfill_rounds")),
      max_injected_chars: Number(form.get("max_injected_chars")),
      precompact_timeout_ms: Number(form.get("precompact_timeout_ms")),
    }),
  });
  state.config = await api("/api/config");
  renderConfig();
  setStatus("Config saved");
}

function setLlmTestResult(kind, html) {
  const target = $("llmTestResult");
  target.className = "test-result" + (kind ? " " + kind : "");
  target.innerHTML = html;
}

async function testLlm() {
  setStatus("Testing LLM");
  setLlmTestResult("pending", "<b>Testing</b>Sending: 你好");
  try {
    const result = await api("/api/llm-test", { method: "POST" });
    setLlmTestResult("ok",
      "<b>LLM reachable</b>" +
      "Sent: 你好\\n" +
      "Reply: " + escapeHtml(result.reply) + "\\n" +
      "Model: " + escapeHtml(result.model) + "\\n" +
      "Base URL: " + escapeHtml(result.base_url) + "\\n" +
      "Elapsed: " + escapeHtml(result.elapsed_ms) + " ms"
    );
    setStatus("LLM test ok");
  } catch (error) {
    setLlmTestResult("error", "<b>LLM test failed</b>" + escapeHtml(error.message));
    setStatus("LLM test failed");
  }
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    $(button.dataset.view + "View").classList.add("active");
  });
});

document.querySelectorAll(".detail-tab").forEach((button) => {
  button.addEventListener("click", () => {
    state.detailTab = button.dataset.detail;
    state.selectedItem = null;
    renderDetailTab();
  });
});

$("refreshBtn").addEventListener("click", refreshAll);
$("savePromptBtn").addEventListener("click", savePrompt);
$("saveConfigBtn").addEventListener("click", saveConfig);
$("testLlmBtn").addEventListener("click", testLlm);

refreshAll().catch((error) => setStatus(error.message));
`;
