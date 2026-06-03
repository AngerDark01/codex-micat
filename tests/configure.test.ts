import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config/load-config.js";
import { writeConfigFile } from "../src/config/configure.js";

test("writeConfigFile writes toml config with direct api key and reasoning effort", async () => {
  const root = await mkdtemp(join(tmpdir(), "micat-config-test-"));
  const configPath = join(root, "config.toml");

  const report = await writeConfigFile({
    configPath,
    config: {
      base_url: "https://llm.example.test/v1",
      api_key: "configured-key",
      model: "gpt-5.4",
      reasoning_effort: "high",
      timeout_ms: 20_000,
      rounds: 5,
      max_backfill_rounds: 100,
      max_input_chars: 30_000,
      max_injected_chars: 8_000,
      precompact_timeout_ms: 30_000,
      rollup_prompt: "~/.codex/micat/prompts/rollup.md",
      storage_root: "~/.codex/micat",
    },
  });

  const loaded = await loadConfig(configPath);
  const mode = (await stat(configPath)).mode & 0o777;
  const text = await readFile(configPath, "utf8");

  console.log(`[micat-test] config report=${JSON.stringify(report)}`);
  console.log(`[micat-test] config mode=${mode.toString(8)}`);
  assert.match(text, /api_key = "configured-key"/);
  assert.equal(mode, 0o600);
  assert.equal(loaded.model.base_url, "https://llm.example.test/v1");
  assert.equal(loaded.model.api_key, "configured-key");
  assert.equal(loaded.model.reasoning_effort, "high");
  assert.equal(report.has_api_key, true);
});
