import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { dispatchHook } from "../src/hook/dispatch.js";

test("hook flow captures a round, rolls up, and injects active rules", async () => {
  const root = await mkdtemp(join(tmpdir(), "micat-test-"));
  console.log(`[micat-test] CODEX_HOME=${root}`);
  process.env.CODEX_HOME = root;
  await mkdir(join(root, "micat"), { recursive: true });
  await writeFile(
    join(root, "micat", "config.toml"),
    [
      "[model]",
      'base_url = "mock:"',
      'api_key_env = "MICAT_API_KEY"',
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
      "[storage]",
      `root = "${join(root, "micat").replaceAll("\\", "\\\\")}"`,
      "",
    ].join("\n"),
    "utf8",
  );

  const transcriptPath = join(root, "rollout.jsonl");
  await dispatchHook({
    hook_event_name: "SessionStart",
    session_id: "session-1",
    source: "startup",
    cwd: root,
    transcript_path: transcriptPath,
  });

  const initialPromptOutput = await dispatchHook({
    hook_event_name: "UserPromptSubmit",
    session_id: "session-1",
    turn_id: "turn-1",
    cwd: root,
    transcript_path: transcriptPath,
    prompt: "以后 compact 相关问题优先检查 SessionStart(source=compact) 注入。",
  });
  assert.equal(initialPromptOutput, undefined);

  await writeFile(
    transcriptPath,
    `${JSON.stringify({
      type: "event_msg",
      payload: {
        type: "agent_message",
        phase: "final_answer",
        message: "已记录这个 compact 注入设计点。",
      },
    })}\n`,
    "utf8",
  );

  await dispatchHook({
    hook_event_name: "Stop",
    session_id: "session-1",
    turn_id: "turn-1",
    cwd: root,
    transcript_path: transcriptPath,
  });

  await dispatchHook({
    hook_event_name: "PreCompact",
    session_id: "session-1",
    cwd: root,
    transcript_path: transcriptPath,
    trigger: "manual",
  });

  const activeRules = await readFile(join(root, "micat", "sessions", "session-1", "active_rules.md"), "utf8");
  console.log(`[micat-test] active_rules.md=${JSON.stringify(activeRules.trim())}`);
  assert.match(activeRules, /SessionStart\(source=compact\)/);

  const compactOutput = await dispatchHook({
    hook_event_name: "SessionStart",
    session_id: "session-1",
    source: "compact",
    cwd: root,
    transcript_path: transcriptPath,
  });

  console.log(`[micat-test] compact additionalContext=${JSON.stringify(compactOutput)}`);
  const expectedInjectedContext = [
    "Micat execution-strategy rules:",
    "",
    "Micat is not a general memory system. It only preserves narrow rules extracted from the user's corrections, preferences, and constraints about how the agent should execute work in this session.",
    "Use these rules as execution guidance when relevant. Do not treat them as comprehensive project memory, factual source material, or a replacement for current user/system/developer instructions.",
    "",
    activeRules.trim(),
  ].join("\n");
  assert.deepEqual(compactOutput, {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: expectedInjectedContext,
    },
  });
});

test("hook flow accepts camelCase Codex payload fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "micat-camel-test-"));
  console.log(`[micat-test] camel CODEX_HOME=${root}`);
  process.env.CODEX_HOME = root;
  await mkdir(join(root, "micat"), { recursive: true });
  await writeFile(
    join(root, "micat", "config.toml"),
    [
      "[model]",
      'base_url = "mock:"',
      'model = "micat-mock"',
      "",
      "[rollup]",
      "rounds = 5",
      "",
      "[storage]",
      `root = "${join(root, "micat").replaceAll("\\", "\\\\")}"`,
      "",
    ].join("\n"),
    "utf8",
  );

  const transcriptPath = join(root, "camel-rollout.jsonl");
  await dispatchHook({
    hookEventName: "SessionStart",
    sessionId: "camel-session",
    source: "startup",
    cwd: root,
    transcriptPath,
  });

  await dispatchHook({
    hookEventName: "UserPromptSubmit",
    sessionId: "camel-session",
    turnId: "turn-camel",
    cwd: root,
    transcriptPath,
    prompt: "camelCase payload should be captured",
  });

  await writeFile(
    transcriptPath,
    `${JSON.stringify({
      type: "event_msg",
      payload: {
        type: "agent_message",
        phase: "final_answer",
        message: "camelCase response captured",
      },
    })}\n`,
    "utf8",
  );

  await dispatchHook({
    hookEventName: "Stop",
    sessionId: "camel-session",
    turnId: "turn-camel",
    cwd: root,
    transcriptPath,
  });

  const rounds = await readFile(join(root, "micat", "sessions", "camel-session", "rounds.jsonl"), "utf8");
  console.log(`[micat-test] camel rounds=${rounds.trim()}`);
  assert.match(rounds, /camelCase payload should be captured/);
  assert.match(rounds, /camelCase response captured/);
});
