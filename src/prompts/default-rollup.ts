import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function bundledRollupPromptPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..", "prompts", "rollup.default.md");
}

export async function readBundledRollupPrompt(): Promise<string> {
  return readFile(bundledRollupPromptPath(), "utf8");
}
