import type { MicatConfig } from "../../config/defaults.js";
import { runAllPendingRollups } from "../../rollup/runner.js";
import { resolveCwd, resolveTranscriptPath } from "../../session/resolver.js";
import { SessionStore } from "../../session/store.js";
import type { CodexHookPayload, HookOutput } from "../../types/codex-hook.js";

export async function handlePreCompact(
  config: MicatConfig,
  store: SessionStore,
  payload: CodexHookPayload,
): Promise<HookOutput> {
  await store.updateMeta({
    cwd: resolveCwd(payload),
    transcript_path: resolveTranscriptPath(payload),
  });

  try {
    await withTimeout(runAllPendingRollups(config, store, "precompact"), config.rollup.precompact_timeout_ms);
  } catch (error) {
    await store.logError(error, "precompact-rollup");
  }
  return { continue: true };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
