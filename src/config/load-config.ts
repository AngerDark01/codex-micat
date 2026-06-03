import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defaultConfig, type MicatConfig } from "./defaults.js";
import { codexHome, expandHome } from "../fs/paths.js";

type MutableConfig = Record<string, Record<string, string | number | boolean>>;

function parseScalar(raw: string): string | number | boolean {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value === "true") return true;
  if (value === "false") return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && value !== "" ? numeric : value;
}

function parseSimpleToml(text: string): MutableConfig {
  const parsed: MutableConfig = {};
  let section = "";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;

    const sectionMatch = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      parsed[section] ??= {};
      continue;
    }

    const eq = line.indexOf("=");
    if (eq === -1 || !section) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    parsed[section][key] = parseScalar(value);
  }

  return parsed;
}

export async function loadConfig(configPath?: string): Promise<MicatConfig> {
  const config = defaultConfig();
  const path = configPath ? expandHome(configPath) : defaultConfigPath();

  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return config;
    throw error;
  }

  const parsed = parseSimpleToml(text);
  return {
    model: { ...config.model, ...parsed.model },
    rollup: { ...config.rollup, ...parsed.rollup },
    prompts: { ...config.prompts, ...parsed.prompts },
    storage: { ...config.storage, ...parsed.storage },
  } as MicatConfig;
}

export function defaultConfigPath(): string {
  return resolve(codexHome(), "micat", "config.toml");
}
