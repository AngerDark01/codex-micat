export type HookEventName =
  | "SessionStart"
  | "UserPromptSubmit"
  | "Stop"
  | "PreCompact"
  | "PostCompact";

export interface CodexHookPayload {
  hook_event_name?: HookEventName | string;
  hookEventName?: HookEventName | string;
  event?: string;
  name?: string;
  session_id?: string;
  sessionId?: string;
  transcript_path?: string | null;
  transcriptPath?: string | null;
  cwd?: string;
  model?: string;
  turn_id?: string;
  turnId?: string;
  source?: "startup" | "resume" | "clear" | "compact" | string;
  trigger?: "manual" | "auto" | string;
  prompt?: string;
  user_prompt?: string;
  userPrompt?: string;
  [key: string]: unknown;
}

export interface HookAdditionalContextOutput {
  hookSpecificOutput: {
    hookEventName: string;
    additionalContext: string;
  };
}

export interface HookContinueOutput {
  continue?: boolean;
  stopReason?: string;
  systemMessage?: string;
}

export type HookOutput = HookAdditionalContextOutput | HookContinueOutput | undefined;
