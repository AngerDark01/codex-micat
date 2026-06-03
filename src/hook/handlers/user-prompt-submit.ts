import type { MicatConfig } from "../../config/defaults.js";
import { resolveCwd, resolvePrompt, resolveTranscriptPath, resolveTurnId } from "../../session/resolver.js";
import { buildAdditionalContext } from "../../session/injector.js";
import { SessionStore } from "../../session/store.js";
import type { CodexHookPayload, HookOutput } from "../../types/codex-hook.js";

export async function handleUserPromptSubmit(
  config: MicatConfig,
  store: SessionStore,
  payload: CodexHookPayload,
): Promise<HookOutput> {
  await store.updateMeta({
    cwd: resolveCwd(payload),
    transcript_path: resolveTranscriptPath(payload),
  });

  const prompt = resolvePrompt(payload);
  if (prompt.trim()) {
    await store.appendPendingUser({
      turn_id: resolveTurnId(payload),
      prompt,
    });
  }

  const activeRules = await store.readActiveRulesMarkdown();
  return buildAdditionalContext("UserPromptSubmit", activeRules, config.rollup.max_injected_chars);
}
