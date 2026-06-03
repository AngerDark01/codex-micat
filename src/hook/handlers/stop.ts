import type { MicatConfig } from "../../config/defaults.js";
import { shouldScheduleRollup } from "../../rollup/planner.js";
import { runRollup } from "../../rollup/runner.js";
import { resolveCwd, resolveTranscriptPath, resolveTurnId } from "../../session/resolver.js";
import { SessionStore } from "../../session/store.js";
import { readLatestFinalAnswer } from "../../session/transcript-reader.js";
import type { CodexHookPayload, HookOutput } from "../../types/codex-hook.js";

export async function handleStop(
  config: MicatConfig,
  store: SessionStore,
  payload: CodexHookPayload,
): Promise<HookOutput> {
  await store.updateMeta({
    cwd: resolveCwd(payload),
    transcript_path: resolveTranscriptPath(payload),
  });

  const final = await readLatestFinalAnswer(resolveTranscriptPath(payload));
  if (!final) return undefined;

  await store.completeRound(final.message, resolveTurnId(payload) ?? final.turn_id);
  if (await shouldScheduleRollup(config, store)) {
    try {
      await runRollup(config, store, "scheduled");
    } catch (error) {
      await store.logError(error, "scheduled-rollup");
    }
  }
  return undefined;
}
