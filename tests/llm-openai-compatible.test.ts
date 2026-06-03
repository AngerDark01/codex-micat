import test from "node:test";
import assert from "node:assert/strict";
import type { MicatConfig } from "../src/config/defaults.js";
import { buildChatCompletionRequestBody, runChatCompletion } from "../src/llm/openai-compatible.js";
import type { RollupInput } from "../src/types/rollup.js";

const baseConfig: MicatConfig = {
  model: {
    base_url: "https://llm.example.test/v1/",
    api_key: "",
    api_key_env: "MICAT_TEST_API_KEY",
    reasoning_effort: "",
    reasoning_effort_env: "OPENAI_REASONING_EFFORT",
    model: "gpt-5.4",
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
    rollup: "/tmp/micat-rollup.md",
  },
  storage: {
    root: "/tmp/micat",
  },
};

const input: RollupInput = {
  previous_micat_context: "",
  previous_active_rules: [],
  recent_rounds: [],
  rollup_reason: "precompact",
};

test("chat completion request body includes reasoning_effort from env", async () => {
  const originalFetch = globalThis.fetch;
  const previousEffort = process.env.OPENAI_REASONING_EFFORT;
  const previousApiKey = process.env.MICAT_TEST_API_KEY;
  let capturedBody: Record<string, unknown> | undefined;

  try {
    process.env.OPENAI_REASONING_EFFORT = "high";
    process.env.MICAT_TEST_API_KEY = "test-key";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(url), "https://llm.example.test/v1/chat/completions");
      assert.equal(init?.headers && typeof init.headers === "object" && "authorization" in init.headers, true);
      const rawBody = init?.body;
      assert.equal(typeof rawBody, "string");
      capturedBody = JSON.parse(rawBody as string);
      return new Response(JSON.stringify({ choices: [{ message: { content: "rollup-ok" } }] }), { status: 200 });
    }) as typeof fetch;

    const content = await runChatCompletion(baseConfig, "rollup prompt", input);

    console.log(`[micat-test] reasoning_effort body=${JSON.stringify(capturedBody)}`);
    assert.equal(content, "rollup-ok");
    assert.equal(capturedBody?.reasoning_effort, "high");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEffort === undefined) delete process.env.OPENAI_REASONING_EFFORT;
    else process.env.OPENAI_REASONING_EFFORT = previousEffort;
    if (previousApiKey === undefined) delete process.env.MICAT_TEST_API_KEY;
    else process.env.MICAT_TEST_API_KEY = previousApiKey;
  }
});

test("chat completion request uses api key and reasoning_effort from config before env", async () => {
  const originalFetch = globalThis.fetch;
  const previousEffort = process.env.OPENAI_REASONING_EFFORT;
  const previousApiKey = process.env.MICAT_TEST_API_KEY;
  let capturedAuthorization = "";
  let capturedBody: Record<string, unknown> | undefined;

  try {
    process.env.OPENAI_REASONING_EFFORT = "low";
    process.env.MICAT_TEST_API_KEY = "env-key";
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      capturedAuthorization = (init?.headers as Record<string, string>).authorization;
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ choices: [{ message: { content: "rollup-ok" } }] }), { status: 200 });
    }) as typeof fetch;

    await runChatCompletion({
      ...baseConfig,
      model: {
        ...baseConfig.model,
        api_key: "configured-key",
        reasoning_effort: "high",
      },
    }, "rollup prompt", input);

    console.log(`[micat-test] config auth=${capturedAuthorization} body=${JSON.stringify(capturedBody)}`);
    assert.equal(capturedAuthorization, "Bearer configured-key");
    assert.equal(capturedBody?.reasoning_effort, "high");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEffort === undefined) delete process.env.OPENAI_REASONING_EFFORT;
    else process.env.OPENAI_REASONING_EFFORT = previousEffort;
    if (previousApiKey === undefined) delete process.env.MICAT_TEST_API_KEY;
    else process.env.MICAT_TEST_API_KEY = previousApiKey;
  }
});

test("chat completion request body omits reasoning_effort when env is unset", () => {
  const previousEffort = process.env.OPENAI_REASONING_EFFORT;
  try {
    delete process.env.OPENAI_REASONING_EFFORT;
    const body = buildChatCompletionRequestBody(baseConfig, "rollup prompt", input);
    console.log(`[micat-test] reasoning_effort omitted=${!("reasoning_effort" in body)}`);
    assert.equal("reasoning_effort" in body, false);
  } finally {
    if (previousEffort !== undefined) process.env.OPENAI_REASONING_EFFORT = previousEffort;
  }
});
