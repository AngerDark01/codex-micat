import type { ActiveRule, Round } from "./micat-state.js";

export type RollupReason = "scheduled" | "precompact" | "manual";

export interface RollupInput {
  previous_micat_context: string;
  previous_active_rules: ActiveRule[];
  recent_rounds: Round[];
  rollup_reason: RollupReason;
}

export interface ActiveRulesPatchItem {
  type: string;
  rule: string;
  evidence: string;
  confidence: number;
}

export interface RollupOutput {
  micat_context: string;
  active_rules_patch: ActiveRulesPatchItem[];
}

export interface RollupTrace {
  id: string;
  type: "rollup";
  reason: RollupReason;
  status: "ok" | "error";
  started_at: string;
  finished_at: string;
  batch: {
    from_round: number;
    to_round: number;
    count: number;
  };
  input: RollupInput;
  raw_output?: string;
  parsed_output?: RollupOutput;
  merged_rules?: ActiveRule[];
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}
