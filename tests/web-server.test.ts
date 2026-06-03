import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { startWebServer } from "../src/web/server.js";
import { loadConfig } from "../src/config/load-config.js";
import { SessionStore } from "../src/session/store.js";

test("web server exposes sessions, prompt editing, and manual rollup traces", async () => {
  const root = await mkdtemp(join(tmpdir(), "micat-web-test-"));
  process.env.CODEX_HOME = root;
  await mkdir(join(root, "micat", "prompts"), { recursive: true });
  const promptPath = join(root, "micat", "prompts", "rollup.md");
  await writeFile(promptPath, "web rollup prompt", "utf8");
  await writeFile(
    join(root, "micat", "config.toml"),
    [
      "[model]",
      'base_url = "mock:"',
      'model = "micat-mock"',
      "timeout_ms = 20000",
      "",
      "[rollup]",
      "rounds = 1",
      "max_backfill_rounds = 100",
      "max_input_chars = 30000",
      "max_injected_chars = 8000",
      "precompact_timeout_ms = 30000",
      "",
      "[prompts]",
      `rollup = "${promptPath.replaceAll("\\", "\\\\")}"`,
      "",
      "[storage]",
      `root = "${join(root, "micat").replaceAll("\\", "\\\\")}"`,
      "",
    ].join("\n"),
    "utf8",
  );

  const config = await loadConfig();
  const store = new SessionStore(config, "web-session");
  await store.updateMeta({ cwd: root, transcript_path: join(root, "rollout.jsonl") });
  await store.appendPendingUser({ turn_id: "turn-1", prompt: "web prompt rule" });
  await store.completeRound("web final answer", "turn-1");

  const server = await startWebServer({ port: 0 });
  try {
    const sessions = await jsonFetch(`${server.url}/api/sessions`) as { sessions: Array<{ session_id: string }> };
    console.log(`[micat-test] web sessions=${JSON.stringify(sessions.sessions)}`);
    assert.equal(sessions.sessions.some((session) => session.session_id === "web-session"), true);

    const prompt = await jsonFetch(`${server.url}/api/prompt`) as { path: string; content: string };
    assert.equal(prompt.path, promptPath);
    assert.equal(prompt.content, "web rollup prompt");

    await jsonFetch(`${server.url}/api/prompt`, {
      method: "PUT",
      body: JSON.stringify({ content: "updated prompt" }),
    });
    assert.equal(await readFile(promptPath, "utf8"), "updated prompt\n");

    const updatedConfig = await jsonFetch(`${server.url}/api/config`, {
      method: "PUT",
      body: JSON.stringify({ base_url: "mock:", model: "micat-mock", rounds: 1, max_backfill_rounds: 75, timeout_ms: 15000 }),
    }) as { rollup: { rounds: number; max_backfill_rounds: number }; model: { timeout_ms: number } };
    assert.equal(updatedConfig.rollup.rounds, 1);
    assert.equal(updatedConfig.rollup.max_backfill_rounds, 75);
    assert.equal(updatedConfig.model.timeout_ms, 15000);

    const llmTest = await jsonFetch(`${server.url}/api/llm-test`, { method: "POST" }) as {
      ok: boolean;
      prompt: string;
      reply: string;
      model: string;
      base_url: string;
      elapsed_ms: number;
    };
    console.log(`[micat-test] llm test=${JSON.stringify(llmTest)}`);
    assert.equal(llmTest.ok, true);
    assert.equal(llmTest.prompt, "你好");
    assert.match(llmTest.reply, /你好/);
    assert.equal(llmTest.model, "micat-mock");
    assert.equal(llmTest.base_url, "mock:");
    assert.equal(Number.isFinite(llmTest.elapsed_ms), true);

    const rollup = await jsonFetch(`${server.url}/api/sessions/web-session/rollup`, { method: "POST" }) as { batches: number };
    assert.equal(rollup.batches, 1);

    const detail = await jsonFetch(`${server.url}/api/sessions/web-session`) as {
      traces: Array<{ status: string; batch: { count: number } }>;
      active_rules_markdown: string;
    };
    console.log(`[micat-test] web trace=${JSON.stringify(detail.traces)}`);
    assert.equal(detail.traces.length, 1);
    assert.equal(detail.traces[0].status, "ok");
    assert.equal(detail.traces[0].batch.count, 1);
    assert.match(detail.active_rules_markdown, /web prompt rule/);
  } finally {
    await server.close();
  }
});

async function jsonFetch(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}
