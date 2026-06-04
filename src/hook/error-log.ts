import { resolve } from "node:path";
import { appendJsonl } from "../fs/jsonl.js";
import { defaultMicatRoot, nowIso } from "../fs/paths.js";
import type { CodexHookPayload } from "../types/codex-hook.js";

export async function logFallbackHookError(
  error: unknown,
  context: string,
  payload?: CodexHookPayload | Record<string, unknown>,
): Promise<void> {
  try {
    await appendJsonl(resolve(defaultMicatRoot(), "hook-errors.jsonl"), {
      context,
      error: normalizeError(error),
      payload: payload ? scrubPayload(payload) : undefined,
      created_at: nowIso(),
    });
  } catch {
    // Hook error logging must never make the hook fail.
  }
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

function scrubPayload(payload: CodexHookPayload | Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/key|token|secret|authorization|password/i.test(key)) {
      result[key] = "(redacted)";
    } else if (typeof value === "string" && value.length > 2000) {
      result[key] = `${value.slice(0, 2000)}...[truncated]`;
    } else {
      result[key] = value;
    }
  }
  return result;
}
