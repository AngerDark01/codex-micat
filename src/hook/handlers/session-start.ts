import type { MicatConfig } from "../../config/defaults.js";
import { ensureSidecar } from "../../sidecar/autostart.js";
import { resolveCwd, resolveTranscriptPath } from "../../session/resolver.js";
import { buildAdditionalContext } from "../../session/injector.js";
import { SessionStore } from "../../session/store.js";
import type { CodexHookPayload, HookOutput } from "../../types/codex-hook.js";

export async function handleSessionStart(
  config: MicatConfig,
  store: SessionStore,
  payload: CodexHookPayload,
): Promise<HookOutput> {
  await store.updateMeta({
    cwd: resolveCwd(payload),
    transcript_path: resolveTranscriptPath(payload),
    compact: payload.source === "compact",
  });
  await ensureSidecar(store);
  const activeRules = await store.readActiveRulesMarkdown();
  return buildAdditionalContext("SessionStart", activeRules, config.rollup.max_injected_chars);
}
