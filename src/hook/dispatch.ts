import { loadConfig } from "../config/load-config.js";
import { resolveHookEventName, resolveSessionId } from "../session/resolver.js";
import { SessionStore } from "../session/store.js";
import type { CodexHookPayload, HookOutput } from "../types/codex-hook.js";
import { handlePreCompact } from "./handlers/pre-compact.js";
import { handleSessionStart } from "./handlers/session-start.js";
import { handleStop } from "./handlers/stop.js";
import { handleUserPromptSubmit } from "./handlers/user-prompt-submit.js";

export async function dispatchHook(payload: CodexHookPayload): Promise<HookOutput> {
  const config = await loadConfig();
  const sessionId = resolveSessionId(payload);
  const store = new SessionStore(config, sessionId);
  const hookEventName = resolveHookEventName(payload);

  try {
    switch (hookEventName) {
      case "SessionStart":
        return await handleSessionStart(config, store, payload);
      case "UserPromptSubmit":
        return await handleUserPromptSubmit(config, store, payload);
      case "Stop":
        return await handleStop(config, store, payload);
      case "PreCompact":
        return await handlePreCompact(config, store, payload);
      default:
        return undefined;
    }
  } catch (error) {
    await store.logError(error, `hook-${hookEventName || "unknown"}`);
    return undefined;
  }
}
