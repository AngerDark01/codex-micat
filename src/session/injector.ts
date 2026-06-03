import type { HookAdditionalContextOutput } from "../types/codex-hook.js";

export function buildAdditionalContext(
  hookEventName: string,
  activeRulesMarkdown: string,
  maxChars: number,
): HookAdditionalContextOutput | undefined {
  const trimmed = activeRulesMarkdown.trim();
  if (!trimmed) return undefined;
  const wrapped = [
    "Micat execution-strategy rules:",
    "",
    "Micat is not a general memory system. It only preserves narrow rules extracted from the user's corrections, preferences, and constraints about how the agent should execute work in this session.",
    "Use these rules as execution guidance when relevant. Do not treat them as comprehensive project memory, factual source material, or a replacement for current user/system/developer instructions.",
    "",
    trimmed,
  ].join("\n");
  const content = wrapped.length > maxChars ? `${wrapped.slice(0, maxChars)}\n[Micat truncated]` : wrapped;
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext: content,
    },
  };
}
