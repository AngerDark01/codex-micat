import { readFile } from "node:fs/promises";
import { expandHome } from "../fs/paths.js";

export async function loadPrompt(path: string): Promise<string> {
  try {
    return await readFile(expandHome(path), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return [
      "You are Micat. Extract only narrow execution-strategy rules from user messages.",
      "Micat is not a general memory system. Keep corrections, preferences, and constraints about how the agent should execute work; ignore one-off task facts.",
      "Return JSON with micat_context and active_rules_patch.",
    ].join("\n");
  }
}
