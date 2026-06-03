import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readdir, readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { configInputFromLoaded, writeConfigFile } from "../config/configure.js";
import { type MicatConfig } from "../config/defaults.js";
import { defaultConfigPath, loadConfig } from "../config/load-config.js";
import { atomicWriteFile } from "../fs/atomic-write.js";
import { readJsonl } from "../fs/jsonl.js";
import { expandHome } from "../fs/paths.js";
import { readApiKey, runConnectivityCheck } from "../llm/openai-compatible.js";
import { runAllPendingRollups } from "../rollup/runner.js";
import { SessionStore } from "../session/store.js";
import type { ActiveRule, Cursors, PendingUserPrompt, Round, SessionMeta } from "../types/micat-state.js";
import type { RollupTrace } from "../types/rollup.js";
import { APP_CSS, APP_JS, INDEX_HTML } from "./static.js";

export interface WebServerHandle {
  url: string;
  close: () => Promise<void>;
}

export async function startWebServer(options: {
  host?: string;
  port?: number;
} = {}): Promise<WebServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port ?? 17877;
  const server = createServer((request, response) => {
    void handleRequest(request, response).catch((error) => {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });
  const port = await listen(server, host, requestedPort);
  return {
    url: `http://${host}:${port}`,
    close: () => new Promise((resolveClose, reject) => {
      server.close((error) => error ? reject(error) : resolveClose());
    }),
  };
}

async function listen(server: Server, host: string, requestedPort: number): Promise<number> {
  if (requestedPort === 0) {
    await listenOnce(server, host, 0);
    return (server.address() as AddressInfo).port;
  }
  for (let offset = 0; offset < 20; offset += 1) {
    const port = requestedPort + offset;
    try {
      await listenOnce(server, host, port);
      return port;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error(`No available port found starting at ${requestedPort}`);
}

function listenOnce(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolveListen, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/") return sendText(response, 200, INDEX_HTML, "text/html; charset=utf-8");
  if (request.method === "GET" && pathname === "/assets/app.css") return sendText(response, 200, APP_CSS, "text/css; charset=utf-8");
  if (request.method === "GET" && pathname === "/assets/app.js") return sendText(response, 200, APP_JS, "text/javascript; charset=utf-8");

  if (pathname === "/api/config" && request.method === "GET") return sendJson(response, 200, await getConfigPayload());
  if (pathname === "/api/config" && request.method === "PUT") return updateConfig(request, response);
  if (pathname === "/api/llm-test" && request.method === "POST") return sendJson(response, 200, await testLlmPayload());
  if (pathname === "/api/sessions" && request.method === "GET") return sendJson(response, 200, await listSessionsPayload());
  if (pathname === "/api/prompt" && request.method === "GET") return sendJson(response, 200, await getPromptPayload());
  if (pathname === "/api/prompt" && request.method === "PUT") return updatePrompt(request, response);

  const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)(?:\/([^/]+))?$/);
  if (sessionMatch) {
    const sessionId = decodeURIComponent(sessionMatch[1]);
    const action = sessionMatch[2] ? decodeURIComponent(sessionMatch[2]) : "";
    validateSessionId(sessionId);
    if (!action && request.method === "GET") return sendJson(response, 200, await getSessionPayload(sessionId));
    if (action === "traces" && request.method === "GET") {
      const config = await loadConfig();
      const store = new SessionStore(config, sessionId);
      return sendJson(response, 200, { traces: await store.readTraces() });
    }
    if (action === "rollup" && request.method === "POST") {
      const config = await loadConfig();
      const store = new SessionStore(config, sessionId);
      const batches = await runAllPendingRollups(config, store, "manual");
      return sendJson(response, 200, { session_id: sessionId, batches });
    }
  }

  sendJson(response, 404, { error: "Not found" });
}

async function getConfigPayload(): Promise<unknown> {
  const config = await loadConfig();
  return sanitizeConfig(config);
}

async function updateConfig(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody<Record<string, unknown>>(request);
  const current = await loadConfig();
  const next = configInputFromLoaded(current);
  if (typeof body.base_url === "string") next.base_url = body.base_url.trim();
  if (typeof body.model === "string") next.model = body.model.trim();
  if (typeof body.reasoning_effort === "string") next.reasoning_effort = body.reasoning_effort.trim();
  if (typeof body.timeout_ms === "number" && Number.isFinite(body.timeout_ms)) next.timeout_ms = Math.max(1, Math.floor(body.timeout_ms));
  if (typeof body.rounds === "number" && Number.isFinite(body.rounds)) next.rounds = Math.max(1, Math.floor(body.rounds));
  if (typeof body.max_backfill_rounds === "number" && Number.isFinite(body.max_backfill_rounds)) {
    next.max_backfill_rounds = Math.max(1, Math.floor(body.max_backfill_rounds));
  }
  if (typeof body.max_injected_chars === "number" && Number.isFinite(body.max_injected_chars)) next.max_injected_chars = Math.max(1, Math.floor(body.max_injected_chars));
  if (typeof body.precompact_timeout_ms === "number" && Number.isFinite(body.precompact_timeout_ms)) {
    next.precompact_timeout_ms = Math.max(1, Math.floor(body.precompact_timeout_ms));
  }
  await writeConfigFile({ config: next });
  sendJson(response, 200, await getConfigPayload());
}

async function testLlmPayload(): Promise<unknown> {
  const config = await loadConfig();
  const startedAt = Date.now();
  const reply = await runConnectivityCheck(config);
  return {
    ok: true,
    prompt: "你好",
    reply,
    elapsed_ms: Date.now() - startedAt,
    model: config.model.model,
    base_url: config.model.base_url,
  };
}

async function listSessionsPayload(): Promise<{ sessions: Array<Record<string, unknown>> }> {
  const config = await loadConfig();
  const sessionsRoot = resolve(config.storage.root, "sessions");
  let entries: string[];
  try {
    entries = (await readdir(sessionsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { sessions: [] };
    throw error;
  }

  const sessions = await Promise.all(entries.map(async (sessionId) => {
    const store = new SessionStore(config, sessionId);
    const meta = await readJsonFile<SessionMeta | null>(store.path("meta.json"), null);
    const errors = await readJsonl<unknown>(store.path("errors.jsonl"));
    const traces = await store.readTraces();
    const latestTrace = traces.at(-1);
    return {
      session_id: sessionId,
      cwd: meta?.cwd ?? null,
      last_seen_at: meta?.last_seen_at ?? null,
      rounds_completed: meta?.rounds_completed ?? 0,
      last_rollup_round: meta?.last_rollup_round ?? 0,
      errors_count: errors.length,
      traces_count: traces.length,
      latest_trace_status: latestTrace?.status ?? null,
      latest_trace_at: latestTrace?.finished_at ?? null,
    };
  }));
  sessions.sort((a, b) => String(b.last_seen_at ?? "").localeCompare(String(a.last_seen_at ?? "")));
  return { sessions };
}

async function getSessionPayload(sessionId: string): Promise<unknown> {
  const config = await loadConfig();
  const store = new SessionStore(config, sessionId);
  return {
    session_id: sessionId,
    meta: await readJsonFile<SessionMeta | null>(store.path("meta.json"), null),
    cursors: await readJsonFile<Cursors | null>(store.path("cursors.json"), null),
    pending: await readJsonl<PendingUserPrompt>(store.path("pending-user.jsonl")),
    rounds: await readJsonl<Round>(store.path("rounds.jsonl")),
    micat_context: await readOptionalText(store.path("micat_context.md")),
    active_rules_markdown: await readOptionalText(store.path("active_rules.md")),
    active_rules: await readJsonFile<ActiveRule[]>(store.path("active_rules.json"), []),
    errors: await readJsonl<unknown>(store.path("errors.jsonl")),
    traces: await readJsonl<RollupTrace>(store.path("traces.jsonl")),
  };
}

async function getPromptPayload(): Promise<{ path: string; content: string }> {
  const config = await loadConfig();
  const path = expandHome(config.prompts.rollup);
  return {
    path,
    content: await readOptionalText(path),
  };
}

async function updatePrompt(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody<{ content?: unknown }>(request);
  if (typeof body.content !== "string") throw new Error("Missing string content");
  const config = await loadConfig();
  const path = expandHome(config.prompts.rollup);
  await mkdir(dirname(path), { recursive: true });
  await atomicWriteFile(path, body.content.endsWith("\n") ? body.content : `${body.content}\n`);
  sendJson(response, 200, await getPromptPayload());
}

function sanitizeConfig(config: MicatConfig): unknown {
  return {
    config_path: defaultConfigPath(),
    storage: {
      root: config.storage.root,
    },
    model: {
      base_url: config.model.base_url,
      model: config.model.model,
      api_key_configured: Boolean(readApiKey(config)),
      reasoning_effort: config.model.reasoning_effort,
      timeout_ms: config.model.timeout_ms,
    },
    rollup: config.rollup,
    prompts: config.prompts,
  };
}

async function readOptionalText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

function validateSessionId(sessionId: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(sessionId)) {
    throw new Error("Invalid session id");
  }
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 2_000_000) throw new Error("Request body too large");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return (text ? JSON.parse(text) : {}) as T;
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  sendText(response, statusCode, JSON.stringify(value, null, 2), "application/json; charset=utf-8");
}

function sendText(response: ServerResponse, statusCode: number, value: string, contentType: string): void {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  response.end(value);
}
