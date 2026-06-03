import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { defaultConfigPath, loadConfig } from "../config/load-config.js";
import { readApiKey, readReasoningEffort } from "../llm/openai-compatible.js";
import { inspectNativeHooks } from "../native-hooks/install.js";

export async function runDoctor(entryPath: string): Promise<string> {
  const config = await loadConfig();
  await mkdir(config.storage.root, { recursive: true });
  await access(config.storage.root, constants.R_OK | constants.W_OK);
  const hooks = await inspectNativeHooks({ entryPath });
  const reasoningEffort = readReasoningEffort(config);
  const apiKey = readApiKey(config);
  return [
    "Micat doctor",
    `config.path: ${defaultConfigPath()}`,
    `storage.root: ${config.storage.root}`,
    `model.base_url: ${config.model.base_url}`,
    `model.model: ${config.model.model}`,
    `model.api_key: ${apiKey ? "(configured)" : "(missing)"}`,
    `model.reasoning_effort: ${reasoningEffort ?? "(unset)"}`,
    `native_hooks.path: ${hooks.path}`,
    `native_hooks.codex_config: ${hooks.configPath}`,
    `native_hooks.installed: ${hooks.installed ? "yes" : "no"}`,
    `native_hooks.trusted: ${hooks.trusted ? "yes" : "no"}`,
    `native_hooks.command: ${hooks.command}`,
    `native_hooks.events: ${hooks.events.join(", ")}`,
    "status: ok",
  ].join("\n");
}
