import { createInterface } from "node:readline/promises";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import { loadConfig, defaultConfigPath } from "./load-config.js";
import type { MicatConfig } from "./defaults.js";
import { atomicWriteFile } from "../fs/atomic-write.js";
import { expandHome } from "../fs/paths.js";

const VALID_REASONING_EFFORTS = new Set(["", "none", "minimal", "low", "medium", "high", "xhigh"]);

export interface ConfigWriteInput {
  base_url: string;
  api_key: string;
  model: string;
  reasoning_effort: string;
  timeout_ms: number;
  rounds: number;
  max_backfill_rounds: number;
  max_input_chars: number;
  max_injected_chars: number;
  precompact_timeout_ms: number;
  rollup_prompt: string;
  storage_root: string;
}

export interface ConfigWriteReport {
  path: string;
  base_url: string;
  model: string;
  has_api_key: boolean;
  reasoning_effort: string;
}

export async function runConfigWizard(options: {
  configPath?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
} = {}): Promise<ConfigWriteReport> {
  const current = await loadConfig(options.configPath);
  const input = options.input ?? defaultInput;
  const output = options.output ?? defaultOutput;
  const ask = await createAskFunction(input, output);

  try {
    const baseUrl = await ask("Base URL", current.model.base_url === "mock:" ? "https://api.openai.com/v1" : current.model.base_url);
    const model = await ask("Model", current.model.model === "micat-mock" ? "gpt-5.4" : current.model.model);
    const apiKey = await ask("API key", current.model.api_key);
    const effort = await ask("Reasoning effort (empty/none/minimal/low/medium/high/xhigh)", current.model.reasoning_effort);
    const normalizedEffort = effort.trim();
    if (!VALID_REASONING_EFFORTS.has(normalizedEffort)) {
      throw new Error("Invalid reasoning effort. Use empty, none, minimal, low, medium, high, or xhigh.");
    }

    return writeConfigFile({
      configPath: options.configPath,
      config: {
        base_url: baseUrl.trim(),
        api_key: apiKey.trim(),
        model: model.trim(),
        reasoning_effort: normalizedEffort,
        timeout_ms: current.model.timeout_ms,
        rounds: current.rollup.rounds,
        max_backfill_rounds: current.rollup.max_backfill_rounds,
        max_input_chars: current.rollup.max_input_chars,
        max_injected_chars: current.rollup.max_injected_chars,
        precompact_timeout_ms: current.rollup.precompact_timeout_ms,
        rollup_prompt: current.prompts.rollup,
        storage_root: current.storage.root,
      },
    });
  } finally {
    if ("close" in ask && typeof ask.close === "function") ask.close();
  }
}

export async function writeConfigFile(options: {
  configPath?: string;
  config: ConfigWriteInput;
}): Promise<ConfigWriteReport> {
  const path = options.configPath ? expandHome(options.configPath) : defaultConfigPath();
  const effort = options.config.reasoning_effort.trim();
  if (!VALID_REASONING_EFFORTS.has(effort)) {
    throw new Error("Invalid reasoning effort. Use empty, none, minimal, low, medium, high, or xhigh.");
  }
  await atomicWriteFile(path, renderConfigToml({ ...options.config, reasoning_effort: effort }), 0o600);
  return {
    path,
    base_url: options.config.base_url,
    model: options.config.model,
    has_api_key: Boolean(options.config.api_key.trim()),
    reasoning_effort: effort,
  };
}

export function configInputFromLoaded(config: MicatConfig): ConfigWriteInput {
  return {
    base_url: config.model.base_url,
    api_key: config.model.api_key,
    model: config.model.model,
    reasoning_effort: config.model.reasoning_effort,
    timeout_ms: config.model.timeout_ms,
    rounds: config.rollup.rounds,
    max_backfill_rounds: config.rollup.max_backfill_rounds,
    max_input_chars: config.rollup.max_input_chars,
    max_injected_chars: config.rollup.max_injected_chars,
    precompact_timeout_ms: config.rollup.precompact_timeout_ms,
    rollup_prompt: config.prompts.rollup,
    storage_root: config.storage.root,
  };
}

export function renderConfigToml(config: ConfigWriteInput): string {
  return [
    "[model]",
    `base_url = ${tomlString(config.base_url)}`,
    `api_key = ${tomlString(config.api_key)}`,
    `api_key_env = ${tomlString("MICAT_API_KEY")}`,
    `reasoning_effort = ${tomlString(config.reasoning_effort)}`,
    `reasoning_effort_env = ${tomlString("OPENAI_REASONING_EFFORT")}`,
    `model = ${tomlString(config.model)}`,
    `timeout_ms = ${config.timeout_ms}`,
    "",
    "[rollup]",
    `rounds = ${config.rounds}`,
    `max_backfill_rounds = ${config.max_backfill_rounds}`,
    `max_input_chars = ${config.max_input_chars}`,
    `max_injected_chars = ${config.max_injected_chars}`,
    `precompact_timeout_ms = ${config.precompact_timeout_ms}`,
    "",
    "[prompts]",
    `rollup = ${tomlString(config.rollup_prompt)}`,
    "",
    "[storage]",
    `root = ${tomlString(config.storage_root)}`,
    "",
  ].join("\n");
}

interface AskFunction {
  (label: string, defaultValue: string): Promise<string>;
  close?: () => void;
}

async function createAskFunction(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<AskFunction> {
  if (!isTty(input)) {
    const answers = (await readAll(input)).split(/\r?\n/);
    return async (label: string, defaultValue: string) => {
      const answer = answers.shift() ?? "";
      output.write(promptText(label, defaultValue));
      return answer.trim() ? answer : defaultValue;
    };
  }

  const rl = createInterface({ input, output });
  const ask: AskFunction = async (label: string, defaultValue: string) => {
    const answer = await rl.question(promptText(label, defaultValue));
    return answer.trim() ? answer : defaultValue;
  };
  ask.close = () => rl.close();
  return ask;
}

function promptText(label: string, defaultValue: string): string {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  return `${label}${suffix}: `;
}

async function readAll(input: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isTty(input: NodeJS.ReadableStream): boolean {
  return Boolean((input as NodeJS.ReadableStream & { isTTY?: boolean }).isTTY);
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}
