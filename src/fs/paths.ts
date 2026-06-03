import { homedir } from "node:os";
import { resolve } from "node:path";

export function expandHome(pathValue: string): string {
  if (pathValue === "~") return homedir();
  if (pathValue.startsWith("~/")) return resolve(homedir(), pathValue.slice(2));
  return pathValue;
}

export function codexHome(): string {
  return process.env.CODEX_HOME ? expandHome(process.env.CODEX_HOME) : resolve(homedir(), ".codex");
}

export function defaultMicatRoot(): string {
  return resolve(codexHome(), "micat");
}

export function nowIso(): string {
  return new Date().toISOString();
}
