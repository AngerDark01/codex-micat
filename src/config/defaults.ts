import { resolve } from "node:path";
import { defaultMicatRoot } from "../fs/paths.js";

export interface MicatConfig {
  model: {
    base_url: string;
    api_key: string;
    api_key_env: string;
    reasoning_effort: string;
    reasoning_effort_env: string;
    model: string;
    timeout_ms: number;
  };
  rollup: {
    rounds: number;
    max_backfill_rounds: number;
    max_input_chars: number;
    max_injected_chars: number;
    precompact_timeout_ms: number;
  };
  prompts: {
    rollup: string;
  };
  storage: {
    root: string;
  };
}

export function defaultConfig(): MicatConfig {
  const root = defaultMicatRoot();
  return {
    model: {
      base_url: "mock:",
      api_key: "",
      api_key_env: "MICAT_API_KEY",
      reasoning_effort: "",
      reasoning_effort_env: "OPENAI_REASONING_EFFORT",
      model: "micat-mock",
      timeout_ms: 300_000,
    },
    rollup: {
      rounds: 5,
      max_backfill_rounds: 100,
      max_input_chars: 30_000,
      max_injected_chars: 8_000,
      precompact_timeout_ms: 300_000,
    },
    prompts: {
      rollup: resolve(root, "prompts", "rollup.md"),
    },
    storage: {
      root,
    },
  };
}
