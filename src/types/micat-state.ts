export interface SessionMeta {
  session_id: string;
  cwd: string | null;
  transcript_path: string | null;
  created_at: string;
  last_seen_at: string;
  last_compact_at: string | null;
  rounds_completed: number;
  last_rollup_round: number;
}

export interface PendingUserPrompt {
  id: string;
  session_id: string;
  turn_id: string | null;
  prompt: string;
  created_at: string;
}

export interface Round {
  id: string;
  session_id: string;
  turn_id: string | null;
  user_prompt: string;
  assistant_final_answer: string;
  created_at: string;
}

export interface Cursors {
  pending_user_consumed: number;
  rounds_rollup_completed: number;
}

export interface ActiveRule {
  id: string;
  type: string;
  rule: string;
  evidence: string;
  confidence: number;
  created_at: string;
  updated_at: string;
}
