#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runConfigWizard } from "../config/configure.js";
import { loadConfig } from "../config/load-config.js";
import { runDoctor } from "../doctor/doctor.js";
import { dispatchHook } from "../hook/dispatch.js";
import { installNativeHooks, uninstallNativeHooks } from "../native-hooks/install.js";
import { runAllPendingRollups } from "../rollup/runner.js";
import { SessionStore } from "../session/store.js";
import type { CodexHookPayload } from "../types/codex-hook.js";
import { startWebServer } from "../web/server.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const entryPath = fileURLToPath(import.meta.url);

  if (command === "hook") {
    const input = await readStdin();
    const payload = JSON.parse(input || "{}") as CodexHookPayload;
    const output = await dispatchHook(payload);
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
    return;
  }

  if (command === "doctor") {
    process.stdout.write(`${await runDoctor(entryPath)}\n`);
    return;
  }

  if (command === "serve") {
    const host = readArg(args, "--host") ?? "127.0.0.1";
    const port = Number(readArg(args, "--port") ?? "17877");
    const server = await startWebServer({ host, port: Number.isFinite(port) ? port : 17877 });
    process.stdout.write(`Micat console: ${server.url}\n`);
    await new Promise(() => undefined);
    return;
  }

  if (command === "config") {
    const report = await runConfigWizard({ configPath: readArg(args, "--config") ?? undefined });
    process.stdout.write(formatConfigReport("config", report));
    return;
  }

  if (command === "init") {
    const report = await runConfigWizard({ configPath: readArg(args, "--config") ?? undefined });
    process.stdout.write(formatConfigReport("config", report));
    const hookReport = await installNativeHooks({
      entryPath,
      hooksPath: readArg(args, "--hooks-file") ?? undefined,
      dryRun: args.includes("--dry-run"),
    });
    process.stdout.write(formatNativeHookReport("install-native-hooks", hookReport));
    return;
  }

  if (command === "rollup") {
    const session = readArg(args, "--session");
    if (!session) throw new Error("Missing --session <session_id>");
    const config = await loadConfig();
    const store = new SessionStore(config, session);
    const batches = await runAllPendingRollups(config, store, "manual");
    process.stdout.write(`rollup: ${batches > 0 ? `updated batches=${batches}` : "no-pending-rounds"}\n`);
    return;
  }

  if (command === "inspect-session") {
    const session = args[0];
    if (!session) throw new Error("Missing session id");
    const config = await loadConfig();
    const store = new SessionStore(config, session);
    const metaPath = store.path("meta.json");
    process.stdout.write(await readFile(metaPath, "utf8"));
    return;
  }

  if (command === "sessions") {
    const config = await loadConfig();
    process.stdout.write(await listSessions(config.storage.root));
    return;
  }

  if (command === "rules") {
    const session = args[0] ?? readArg(args, "--session");
    if (!session) throw new Error("Missing session id");
    const config = await loadConfig();
    const store = new SessionStore(config, session);
    process.stdout.write(await readFile(store.path("active_rules.md"), "utf8"));
    return;
  }

  if (command === "context") {
    const session = args[0] ?? readArg(args, "--session");
    if (!session) throw new Error("Missing session id");
    const config = await loadConfig();
    const store = new SessionStore(config, session);
    process.stdout.write(await readFile(store.path("micat_context.md"), "utf8"));
    return;
  }

  if (command === "install") {
    const report = await installNativeHooks({
      entryPath,
      hooksPath: readArg(args, "--hooks-file") ?? undefined,
      dryRun: args.includes("--dry-run"),
    });
    process.stdout.write(formatNativeHookReport("install-native-hooks", report));
    return;
  }

  if (command === "install-native-hooks") {
    const report = await installNativeHooks({
      entryPath,
      hooksPath: readArg(args, "--hooks-file") ?? undefined,
      dryRun: args.includes("--dry-run"),
    });
    process.stdout.write(formatNativeHookReport("install-native-hooks", report));
    return;
  }

  if (command === "uninstall-native-hooks") {
    const report = await uninstallNativeHooks({
      entryPath,
      hooksPath: readArg(args, "--hooks-file") ?? undefined,
      dryRun: args.includes("--dry-run"),
    });
    process.stdout.write(formatNativeHookReport("uninstall-native-hooks", report));
    return;
  }

  process.stdout.write([
    "Micat commands:",
    "  micat init [--dry-run] [--config <path>] [--hooks-file <path>]",
    "  micat config [--config <path>]",
    "  micat hook",
    "  micat serve [--host 127.0.0.1] [--port 17877]",
    "  micat doctor",
    "  micat install [--dry-run] [--hooks-file <path>]",
    "  micat install-native-hooks [--dry-run] [--hooks-file <path>]",
    "  micat uninstall-native-hooks [--dry-run] [--hooks-file <path>]",
    "  micat rollup --session <session_id>",
    "  micat sessions",
    "  micat rules <session_id>",
    "  micat context <session_id>",
    "  micat inspect-session <session_id>",
  ].join("\n") + "\n");
}

function readArg(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function formatNativeHookReport(command: string, report: {
  path: string;
  configPath: string;
  changed: boolean;
  configChanged: boolean;
  installed: boolean;
  trusted: boolean;
  events: string[];
  command: string;
  dryRun: boolean;
}): string {
  return [
    `Micat ${command}`,
    `hooks.path: ${report.path}`,
    `codex_config.path: ${report.configPath}`,
    `dry_run: ${report.dryRun ? "yes" : "no"}`,
    `hooks.changed: ${report.changed ? "yes" : "no"}`,
    `codex_config.changed: ${report.configChanged ? "yes" : "no"}`,
    `installed: ${report.installed ? "yes" : "no"}`,
    `trusted: ${report.trusted ? "yes" : "no"}`,
    `events: ${report.events.join(", ")}`,
    `hook.command: ${report.command}`,
    "",
  ].join("\n");
}

function formatConfigReport(command: string, report: {
  path: string;
  base_url: string;
  model: string;
  has_api_key: boolean;
  reasoning_effort: string;
}): string {
  return [
    `Micat ${command}`,
    `config.path: ${report.path}`,
    `model.base_url: ${report.base_url}`,
    `model.model: ${report.model}`,
    `model.api_key: ${report.has_api_key ? "(configured)" : "(missing)"}`,
    `model.reasoning_effort: ${report.reasoning_effort || "(unset)"}`,
    "",
  ].join("\n");
}

async function listSessions(storageRoot: string): Promise<string> {
  const sessionsRoot = resolve(storageRoot, "sessions");
  let entries: string[];
  try {
    entries = (await readdir(sessionsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "No Micat sessions.\n";
    throw error;
  }
  if (entries.length === 0) return "No Micat sessions.\n";

  const lines = ["Micat sessions:"];
  for (const sessionId of entries) {
    const metaPath = resolve(sessionsRoot, sessionId, "meta.json");
    try {
      const meta = JSON.parse(await readFile(metaPath, "utf8")) as {
        last_seen_at?: string;
        rounds_completed?: number;
        last_rollup_round?: number;
      };
      lines.push(`${sessionId}\trounds=${meta.rounds_completed ?? 0}\trollup=${meta.last_rollup_round ?? 0}\tlast_seen=${meta.last_seen_at ?? "unknown"}`);
    } catch {
      lines.push(`${sessionId}\tmeta=missing`);
    }
  }
  return `${lines.join("\n")}\n`;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
