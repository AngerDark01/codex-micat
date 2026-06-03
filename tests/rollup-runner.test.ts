import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import type { MicatConfig } from "../src/config/defaults.js";
import { runAllPendingRollups, runRollup } from "../src/rollup/runner.js";
import { SessionStore } from "../src/session/store.js";
import type { RollupInput } from "../src/types/rollup.js";

function testConfig(root: string, promptPath: string): MicatConfig {
  return {
    model: {
      base_url: "https://llm.example.test/v1",
      api_key: "test-key",
      api_key_env: "MICAT_TEST_API_KEY",
      reasoning_effort: "",
      reasoning_effort_env: "OPENAI_REASONING_EFFORT",
      model: "micat-test-model",
      timeout_ms: 1_000,
    },
    rollup: {
      rounds: 5,
      max_backfill_rounds: 100,
      max_input_chars: 30_000,
      max_injected_chars: 8_000,
      precompact_timeout_ms: 30_000,
    },
    prompts: {
      rollup: promptPath,
    },
    storage: {
      root,
    },
  };
}

async function addRounds(store: SessionStore, count: number): Promise<void> {
  for (let index = 1; index <= count; index += 1) {
    await store.appendPendingUser({
      turn_id: `turn-${index}`,
      prompt: `用户要求 ${index}`,
    });
    await store.completeRound(`助手回复 ${index}`, `turn-${index}`);
  }
}

test("scheduled rollup waits for the configured batch size", async () => {
  const root = await mkdtemp(join(tmpdir(), "micat-rollup-scheduled-"));
  const promptPath = join(root, "rollup.md");
  await mkdir(root, { recursive: true });
  await writeFile(promptPath, "rollup prompt", "utf8");
  const config = testConfig(root, promptPath);
  const store = new SessionStore(config, "session-scheduled");
  await addRounds(store, 4);

  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      fetchCalls += 1;
      const body = JSON.parse(init?.body as string) as { messages: Array<{ content: string }> };
      const input = JSON.parse(body.messages[1].content) as RollupInput;
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              micat_context: `ctx-${fetchCalls}-${input.recent_rounds.length}`,
              active_rules_patch: [],
            }),
          },
        }],
      }), { status: 200 });
    }) as typeof fetch;

    assert.equal(await runRollup(config, store, "scheduled"), false);
    assert.equal(fetchCalls, 0);

    await store.appendPendingUser({ turn_id: "turn-5", prompt: "用户要求 5" });
    await store.completeRound("助手回复 5", "turn-5");

    assert.equal(await runRollup(config, store, "scheduled"), true);
    assert.equal(fetchCalls, 1);
    assert.equal((await store.readCursors()).rounds_rollup_completed, 5);
    const traces = await store.readTraces();
    console.log(`[micat-test] scheduled traces=${JSON.stringify(traces.map((trace) => trace.batch))}`);
    assert.equal(traces.length, 1);
    assert.equal(traces[0].status, "ok");
    assert.deepEqual(traces[0].batch, { from_round: 1, to_round: 5, count: 5 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rollup backfill only traces the latest configured number of rounds", async () => {
  const root = await mkdtemp(join(tmpdir(), "micat-rollup-backfill-"));
  const promptPath = join(root, "rollup.md");
  await mkdir(root, { recursive: true });
  await writeFile(promptPath, "rollup prompt", "utf8");
  const config = {
    ...testConfig(root, promptPath),
    rollup: {
      ...testConfig(root, promptPath).rollup,
      max_backfill_rounds: 100,
    },
  };
  const store = new SessionStore(config, "session-backfill");
  await addRounds(store, 112);

  const captured: Array<{ first: string; last: string; count: number }> = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { messages: Array<{ content: string }> };
      const input = JSON.parse(body.messages[1].content) as RollupInput;
      captured.push({
        first: input.recent_rounds[0]?.user_prompt ?? "",
        last: input.recent_rounds.at(-1)?.user_prompt ?? "",
        count: input.recent_rounds.length,
      });
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              micat_context: `ctx-${captured.length}`,
              active_rules_patch: [],
            }),
          },
        }],
      }), { status: 200 });
    }) as typeof fetch;

    assert.equal(await runRollup(config, store, "scheduled"), true);
    assert.deepEqual(captured, [{ first: "用户要求 13", last: "用户要求 17", count: 5 }]);
    assert.equal((await store.readCursors()).rounds_rollup_completed, 17);
    const traces = await store.readTraces();
    console.log(`[micat-test] backfill trace=${JSON.stringify(traces.map((trace) => trace.batch))}`);
    assert.deepEqual(traces.map((trace) => trace.batch), [
      { from_round: 13, to_round: 17, count: 5 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("precompact drain rolls pending rounds in fixed-size context batches", async () => {
  const root = await mkdtemp(join(tmpdir(), "micat-rollup-drain-"));
  const promptPath = join(root, "rollup.md");
  await mkdir(root, { recursive: true });
  await writeFile(promptPath, "rollup prompt", "utf8");
  const config = testConfig(root, promptPath);
  const store = new SessionStore(config, "session-drain");
  await addRounds(store, 12);

  const captured: Array<{ previous: string; count: number; first: string; last: string }> = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { messages: Array<{ content: string }> };
      const input = JSON.parse(body.messages[1].content) as RollupInput;
      captured.push({
        previous: input.previous_micat_context.trim(),
        count: input.recent_rounds.length,
        first: input.recent_rounds[0]?.user_prompt ?? "",
        last: input.recent_rounds.at(-1)?.user_prompt ?? "",
      });
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              micat_context: `ctx-${captured.length}`,
              active_rules_patch: [{
                type: "execution_rule",
                rule: `第 ${captured.length} 批规则`,
                evidence: `batch-${captured.length}`,
                confidence: 0.7,
              }],
            }),
          },
        }],
      }), { status: 200 });
    }) as typeof fetch;

    const batches = await runAllPendingRollups(config, store, "precompact");
    assert.equal(batches, 3);
    assert.deepEqual(captured.map((item) => item.count), [5, 5, 2]);
    assert.deepEqual(captured.map((item) => item.previous), ["", "ctx-1", "ctx-2"]);
    assert.deepEqual(captured.map((item) => [item.first, item.last]), [
      ["用户要求 1", "用户要求 5"],
      ["用户要求 6", "用户要求 10"],
      ["用户要求 11", "用户要求 12"],
    ]);
    assert.equal((await store.readCursors()).rounds_rollup_completed, 12);
    assert.equal((await readFile(store.path("micat_context.md"), "utf8")).trim(), "ctx-3");
    assert.match(await readFile(store.path("active_rules.md"), "utf8"), /第 3 批规则/);
    const traces = await store.readTraces();
    console.log(`[micat-test] drain traces=${JSON.stringify(traces.map((trace) => trace.batch))}`);
    assert.deepEqual(traces.map((trace) => trace.batch), [
      { from_round: 1, to_round: 5, count: 5 },
      { from_round: 6, to_round: 10, count: 5 },
      { from_round: 11, to_round: 12, count: 2 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
