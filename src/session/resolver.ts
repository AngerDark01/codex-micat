import { createHash } from "node:crypto";
import type { CodexHookPayload } from "../types/codex-hook.js";

export function resolveHookEventName(payload: CodexHookPayload): string {
  return String(payload.hook_event_name ?? payload.hookEventName ?? payload.event ?? payload.name ?? "");
}

export function resolveSessionId(payload: CodexHookPayload): string {
  const sessionId = payload.session_id ?? payload.sessionId;
  if (sessionId && sessionId.trim()) return sessionId;
  const seed = `${resolveCwd(payload) ?? process.cwd()}:${resolveTranscriptPath(payload) ?? "no-transcript"}`;
  return `fallback-${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}

export function resolvePrompt(payload: CodexHookPayload): string {
  return payload.prompt ?? payload.user_prompt ?? payload.userPrompt ?? "";
}

export function resolveTranscriptPath(payload: CodexHookPayload): string | null {
  return payload.transcript_path ?? payload.transcriptPath ?? null;
}

export function resolveTurnId(payload: CodexHookPayload): string | null {
  return payload.turn_id ?? payload.turnId ?? null;
}

export function resolveCwd(payload: CodexHookPayload): string | null {
  return payload.cwd ?? null;
}
