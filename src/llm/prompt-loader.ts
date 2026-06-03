import { readFile } from "node:fs/promises";
import { expandHome } from "../fs/paths.js";
import { readBundledRollupPrompt } from "../prompts/default-rollup.js";

export async function loadPrompt(path: string): Promise<string> {
  try {
    return await readFile(expandHome(path), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return readBundledRollupPrompt();
  }
}
