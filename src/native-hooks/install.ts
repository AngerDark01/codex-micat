import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { atomicWriteFile } from "../fs/atomic-write.js";
import { atomicWriteJson } from "../fs/atomic-write.js";
import { codexHome } from "../fs/paths.js";

const MICAT_STATUS = "Micat session memory";
const PRECOMPACT_HOOK_TIMEOUT_SECONDS = 300;
const MICAT_TRUST_BLOCK_START = "# Micat-owned Codex hook trust state";
const MICAT_TRUST_BLOCK_END = "# End Micat-owned Codex hook trust state";
const EVENT_KEY_LABELS: Record<string, string> = {
  SessionStart: "session_start",
  UserPromptSubmit: "user_prompt_submit",
  Stop: "stop",
  PreCompact: "pre_compact",
};

interface CommandHook {
  type: "command";
  command: string;
  timeout?: number;
  statusMessage?: string;
  [key: string]: unknown;
}

interface HookGroup {
  matcher?: string;
  hooks: CommandHook[];
  [key: string]: unknown;
}

interface NativeHooksFile {
  state?: unknown;
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
}

export interface NativeHookReport {
  path: string;
  configPath: string;
  changed: boolean;
  configChanged: boolean;
  installed: boolean;
  trusted: boolean;
  events: string[];
  command: string;
  dryRun: boolean;
}

export function defaultHooksPath(): string {
  return resolve(codexHome(), "hooks.json");
}

export function defaultCodexConfigPath(): string {
  return resolve(codexHome(), "config.toml");
}

export function buildNativeHookCommand(entryPath: string): string {
  return `"${process.execPath}" "${entryPath}" hook`;
}

export async function installNativeHooks(options: {
  hooksPath?: string;
  codexConfigPath?: string;
  entryPath: string;
  dryRun?: boolean;
}): Promise<NativeHookReport> {
  const hooksPath = options.hooksPath ?? defaultHooksPath();
  const configPath = options.codexConfigPath ?? defaultCodexConfigPath();
  const command = buildNativeHookCommand(options.entryPath);
  const file = await readHooksFile(hooksPath);
  const hooks = file.hooks ?? {};
  const before = JSON.stringify(hooks);

  for (const [event, group] of Object.entries(buildMicatGroups(command))) {
    const groups = removeMicatGroups(hooks[event] ?? [], command);
    groups.push(group);
    hooks[event] = groups;
  }

  file.hooks = hooks;
  const after = JSON.stringify(hooks);
  const changed = before !== after;
  if (changed && !options.dryRun) {
    await mkdir(dirname(hooksPath), { recursive: true });
    await atomicWriteJson(hooksPath, file);
  }
  const trustEntries = collectMicatTrustEntries(hooksPath, hooks, command);
  const configChanged = await installHookTrustState(configPath, trustEntries, Boolean(options.dryRun));

  return {
    path: hooksPath,
    configPath,
    changed,
    configChanged,
    installed: true,
    trusted: true,
    events: Object.keys(buildMicatGroups(command)),
    command,
    dryRun: Boolean(options.dryRun),
  };
}

export async function uninstallNativeHooks(options: {
  hooksPath?: string;
  codexConfigPath?: string;
  entryPath: string;
  dryRun?: boolean;
}): Promise<NativeHookReport> {
  const hooksPath = options.hooksPath ?? defaultHooksPath();
  const configPath = options.codexConfigPath ?? defaultCodexConfigPath();
  const command = buildNativeHookCommand(options.entryPath);
  const file = await readHooksFile(hooksPath);
  const hooks = file.hooks ?? {};
  const before = JSON.stringify(hooks);

  for (const event of Object.keys(buildMicatGroups(command))) {
    hooks[event] = removeMicatGroups(hooks[event] ?? [], command);
    if (hooks[event].length === 0) delete hooks[event];
  }

  file.hooks = hooks;
  const after = JSON.stringify(hooks);
  const changed = before !== after;
  if (changed && !options.dryRun) {
    await mkdir(dirname(hooksPath), { recursive: true });
    await atomicWriteJson(hooksPath, file);
  }
  const configChanged = await removeHookTrustState(configPath, Boolean(options.dryRun));

  return {
    path: hooksPath,
    configPath,
    changed,
    configChanged,
    installed: false,
    trusted: false,
    events: Object.keys(buildMicatGroups(command)),
    command,
    dryRun: Boolean(options.dryRun),
  };
}

export async function inspectNativeHooks(options: {
  hooksPath?: string;
  codexConfigPath?: string;
  entryPath: string;
}): Promise<NativeHookReport> {
  const hooksPath = options.hooksPath ?? defaultHooksPath();
  const configPath = options.codexConfigPath ?? defaultCodexConfigPath();
  const command = buildNativeHookCommand(options.entryPath);
  const file = await readHooksFile(hooksPath);
  const hooks = file.hooks ?? {};
  const events = Object.keys(buildMicatGroups(command));
  const installed = events.every((event) =>
    (hooks[event] ?? []).some((group) => isMicatGroup(group, command)),
  );
  const trustEntries = collectMicatTrustEntries(hooksPath, hooks, command);
  const trusted = installed && (await hasHookTrustState(configPath, trustEntries));
  return {
    path: hooksPath,
    configPath,
    changed: false,
    configChanged: false,
    installed,
    trusted,
    events,
    command,
    dryRun: false,
  };
}

async function readHooksFile(path: string): Promise<NativeHooksFile> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as NativeHooksFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { hooks: {} };
    throw error;
  }
}

function buildMicatGroups(command: string): Record<string, HookGroup> {
  return {
    SessionStart: {
      matcher: "startup|resume|compact",
      hooks: [{ type: "command", command, statusMessage: MICAT_STATUS }],
    },
    UserPromptSubmit: {
      hooks: [{ type: "command", command, statusMessage: MICAT_STATUS }],
    },
    Stop: {
      hooks: [{ type: "command", command, statusMessage: MICAT_STATUS }],
    },
    PreCompact: {
      hooks: [{ type: "command", command, timeout: PRECOMPACT_HOOK_TIMEOUT_SECONDS, statusMessage: MICAT_STATUS }],
    },
  };
}

function removeMicatGroups(groups: HookGroup[], command: string): HookGroup[] {
  return groups.filter((group) => !isMicatGroup(group, command));
}

function isMicatGroup(group: HookGroup, command: string): boolean {
  return group.hooks.some((hook) =>
    hook.statusMessage === MICAT_STATUS ||
    hook.command === command ||
    (hook.command.includes("micat.mjs") && hook.command.includes(" hook")),
  );
}

interface HookTrustEntry {
  key: string;
  trustedHash: string;
}

function collectMicatTrustEntries(
  hooksPath: string,
  hooks: Record<string, HookGroup[]>,
  command: string,
): HookTrustEntry[] {
  const entries: HookTrustEntry[] = [];
  for (const [event, groups] of Object.entries(hooks)) {
    const eventKey = EVENT_KEY_LABELS[event];
    if (!eventKey) continue;
    groups.forEach((group, groupIndex) => {
      group.hooks.forEach((hook, handlerIndex) => {
        if (!isMicatHook(hook, command)) return;
        entries.push({
          key: `${hooksPath}:${eventKey}:${groupIndex}:${handlerIndex}`,
          trustedHash: commandHookHash(eventKey, group, hook),
        });
      });
    });
  }
  return entries;
}

function isMicatHook(hook: CommandHook, command: string): boolean {
  return hook.statusMessage === MICAT_STATUS ||
    hook.command === command ||
    (hook.command.includes("micat.mjs") && hook.command.includes(" hook"));
}

function commandHookHash(eventName: string, group: HookGroup, hook: CommandHook): string {
  const normalizedHook: Record<string, unknown> = {
    async: false,
    command: hook.command,
    timeout: Math.max(1, Number(hook.timeout ?? 600)),
    type: "command",
  };
  if (hook.statusMessage !== undefined) normalizedHook.statusMessage = hook.statusMessage;
  const identity: Record<string, unknown> = {
    event_name: eventName,
    hooks: [normalizedHook],
  };
  if (group.matcher !== undefined) identity.matcher = group.matcher;
  const serialized = JSON.stringify(canonicalJson(identity));
  return `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    output[key] = canonicalJson(input[key]);
  }
  return output;
}

async function installHookTrustState(
  configPath: string,
  entries: HookTrustEntry[],
  dryRun: boolean,
): Promise<boolean> {
  if (entries.length === 0) return false;
  const before = await readOptionalText(configPath);
  const withoutPrevious = removeTrustBlock(before);
  const withoutDuplicateKeys = removeHookStateSections(withoutPrevious, entries.map((entry) => entry.key));
  const next = `${withoutDuplicateKeys.trimEnd()}\n\n${renderTrustBlock(entries)}\n`;
  const changed = before !== next;
  if (changed && !dryRun) await atomicWriteFile(configPath, next, 0o600);
  return changed;
}

async function removeHookTrustState(configPath: string, dryRun: boolean): Promise<boolean> {
  const before = await readOptionalText(configPath);
  if (!before) return false;
  const next = removeTrustBlock(before).trimEnd() + "\n";
  const changed = before !== next;
  if (changed && !dryRun) await atomicWriteFile(configPath, next, 0o600);
  return changed;
}

async function hasHookTrustState(configPath: string, entries: HookTrustEntry[]): Promise<boolean> {
  if (entries.length === 0) return false;
  const text = await readOptionalText(configPath);
  return entries.every((entry) => {
    const pattern = new RegExp(
      `\\[hooks\\.state\\.${escapeRegExp(tomlQuotedKey(entry.key))}\\]\\s+trusted_hash\\s*=\\s*${escapeRegExp(JSON.stringify(entry.trustedHash))}`,
      "m",
    );
    return pattern.test(text);
  });
}

async function readOptionalText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

function renderTrustBlock(entries: HookTrustEntry[]): string {
  return [
    MICAT_TRUST_BLOCK_START,
    ...entries.flatMap((entry) => [
      `[hooks.state.${tomlQuotedKey(entry.key)}]`,
      `trusted_hash = ${JSON.stringify(entry.trustedHash)}`,
      "",
    ]),
    MICAT_TRUST_BLOCK_END,
  ].join("\n").replace(/\n\n#/g, "\n#");
}

function removeTrustBlock(text: string): string {
  const pattern = new RegExp(
    `\\n?${escapeRegExp(MICAT_TRUST_BLOCK_START)}[\\s\\S]*?${escapeRegExp(MICAT_TRUST_BLOCK_END)}\\n?`,
    "g",
  );
  return text.replace(pattern, "\n");
}

function removeHookStateSections(text: string, keys: string[]): string {
  let next = text;
  for (const key of keys) {
    const header = `[hooks.state.${tomlQuotedKey(key)}]`;
    const pattern = new RegExp(
      `\\n?^${escapeRegExp(header)}\\n[\\s\\S]*?(?=^\\[|\\z)`,
      "gm",
    );
    next = next.replace(pattern, "\n");
  }
  return next;
}

function tomlQuotedKey(key: string): string {
  return JSON.stringify(key);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
