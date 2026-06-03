import { createHash } from "node:crypto";
import type { MicatConfig } from "../config/defaults.js";
import { nowIso } from "../fs/paths.js";
import { loadPrompt } from "../llm/prompt-loader.js";
import { runChatCompletion } from "../llm/openai-compatible.js";
import { mergeActiveRules } from "./rule-merge.js";
import { parseRollupOutput } from "./output-schema.js";
import type { SessionStore } from "../session/store.js";
import type { RollupInput, RollupReason } from "../types/rollup.js";

export async function runRollup(
  config: MicatConfig,
  store: SessionStore,
  reason: RollupReason,
): Promise<boolean> {
  return runRollupBatch(config, store, reason, { force: reason !== "scheduled" });
}

export async function runAllPendingRollups(
  config: MicatConfig,
  store: SessionStore,
  reason: RollupReason,
): Promise<number> {
  let updated = 0;
  while (await runRollupBatch(config, store, reason, { force: true })) {
    updated += 1;
  }
  return updated;
}

async function runRollupBatch(
  config: MicatConfig,
  store: SessionStore,
  reason: RollupReason,
  options: { force: boolean },
): Promise<boolean> {
  return store.withLock(async () => {
    const rounds = await store.readRounds();
    const cursors = await store.readCursors();
    const batchSize = Math.max(1, Math.floor(config.rollup.rounds));
    const rollupStart = await applyBackfillLimit(config, store, rounds.length, cursors.rounds_rollup_completed);
    const pendingRounds = rounds.slice(rollupStart);
    if (pendingRounds.length === 0) return false;
    if (!options.force && pendingRounds.length < batchSize) return false;
    const recentRounds = pendingRounds.slice(0, batchSize);
    const batchStart = rollupStart;
    const startedAt = nowIso();

    const previousContext = await store.readMicatContext();
    const previousRules = await store.readActiveRules();
    const prompt = await loadPrompt(config.prompts.rollup);
    const input: RollupInput = {
      previous_micat_context: previousContext,
      previous_active_rules: previousRules,
      recent_rounds: recentRounds,
      rollup_reason: reason,
    };
    let raw: string | undefined;
    try {
      raw = await runChatCompletion(config, prompt, input);
      const output = parseRollupOutput(raw);
      const mergedRules = mergeActiveRules(previousRules, output.active_rules_patch);
      await store.writeMicatContext(output.micat_context);
      await store.writeActiveRules(mergedRules);
      await store.markRollupComplete(batchStart + recentRounds.length);
      await store.appendTrace({
        id: traceId(store.sessionId, startedAt, reason, batchStart, recentRounds.length),
        type: "rollup",
        reason,
        status: "ok",
        started_at: startedAt,
        finished_at: nowIso(),
        batch: {
          from_round: batchStart + 1,
          to_round: batchStart + recentRounds.length,
          count: recentRounds.length,
        },
        input,
        raw_output: raw,
        parsed_output: output,
        merged_rules: mergedRules,
      });
      return true;
    } catch (error) {
      await store.appendTrace({
        id: traceId(store.sessionId, startedAt, reason, batchStart, recentRounds.length),
        type: "rollup",
        reason,
        status: "error",
        started_at: startedAt,
        finished_at: nowIso(),
        batch: {
          from_round: batchStart + 1,
          to_round: batchStart + recentRounds.length,
          count: recentRounds.length,
        },
        input,
        ...(raw ? { raw_output: raw } : {}),
        error: normalizeError(error),
      });
      throw error;
    }
  });
}

async function applyBackfillLimit(
  config: MicatConfig,
  store: SessionStore,
  roundsLength: number,
  currentCursor: number,
): Promise<number> {
  const maxBackfillRounds = Math.max(1, Math.floor(config.rollup.max_backfill_rounds));
  const oldestAllowedRound = Math.max(0, roundsLength - maxBackfillRounds);
  const nextCursor = Math.max(currentCursor, oldestAllowedRound);
  if (nextCursor !== currentCursor) {
    await store.markRollupComplete(nextCursor);
  }
  return nextCursor;
}

function traceId(
  sessionId: string,
  startedAt: string,
  reason: RollupReason,
  batchStart: number,
  count: number,
): string {
  return createHash("sha256")
    .update(`${sessionId}:${startedAt}:${reason}:${batchStart}:${count}`)
    .digest("hex")
    .slice(0, 24);
}

function normalizeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  return {
    name: "Error",
    message: String(error),
  };
}
