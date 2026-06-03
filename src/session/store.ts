import { mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { MicatConfig } from "../config/defaults.js";
import { atomicWriteFile, atomicWriteJson } from "../fs/atomic-write.js";
import { withFileLock } from "../fs/file-lock.js";
import { appendJsonl, readJsonl } from "../fs/jsonl.js";
import { nowIso } from "../fs/paths.js";
import type { ActiveRule, Cursors, PendingUserPrompt, Round, SessionMeta } from "../types/micat-state.js";
import type { RollupTrace } from "../types/rollup.js";

export class SessionStore {
  readonly sessionId: string;
  readonly dir: string;

  constructor(
    readonly config: MicatConfig,
    sessionId: string,
  ) {
    this.sessionId = sessionId;
    this.dir = resolve(config.storage.root, "sessions", sessionId);
  }

  path(name: string): string {
    return resolve(this.dir, name);
  }

  async ensure(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  async withLock<T>(action: () => Promise<T>): Promise<T> {
    await this.ensure();
    return withFileLock(this.path("lock"), action);
  }

  async updateMeta(input: {
    cwd?: string | null;
    transcript_path?: string | null;
    compact?: boolean;
  }): Promise<SessionMeta> {
    await this.ensure();
    const existing = await this.readJson<SessionMeta | null>("meta.json", null);
    const now = nowIso();
    const meta: SessionMeta = {
      session_id: this.sessionId,
      cwd: input.cwd ?? existing?.cwd ?? null,
      transcript_path: input.transcript_path ?? existing?.transcript_path ?? null,
      created_at: existing?.created_at ?? now,
      last_seen_at: now,
      last_compact_at: input.compact ? now : (existing?.last_compact_at ?? null),
      rounds_completed: existing?.rounds_completed ?? 0,
      last_rollup_round: existing?.last_rollup_round ?? 0,
    };
    await atomicWriteJson(this.path("meta.json"), meta);
    return meta;
  }

  async appendPendingUser(prompt: Omit<PendingUserPrompt, "id" | "created_at" | "session_id">): Promise<void> {
    const pending: PendingUserPrompt = {
      id: createHash("sha256")
        .update(`${this.sessionId}:${prompt.turn_id ?? ""}:${prompt.prompt}`)
        .digest("hex")
        .slice(0, 24),
      session_id: this.sessionId,
      turn_id: prompt.turn_id,
      prompt: prompt.prompt,
      created_at: nowIso(),
    };
    await appendJsonl(this.path("pending-user.jsonl"), pending);
  }

  async completeRound(finalAnswer: string, turnId: string | null): Promise<Round | null> {
    return this.withLock(async () => {
      const pending = await this.readPendingUsers();
      const cursors = await this.readCursors();
      const user = pending[cursors.pending_user_consumed] ?? pending[pending.length - 1];
      if (!user) return null;

      const round: Round = {
        id: createHash("sha256")
          .update(`${this.sessionId}:${user.id}:${finalAnswer}`)
          .digest("hex")
          .slice(0, 24),
        session_id: this.sessionId,
        turn_id: turnId ?? user.turn_id,
        user_prompt: user.prompt,
        assistant_final_answer: finalAnswer,
        created_at: nowIso(),
      };

      const existing = await this.readRounds();
      if (existing.some((item) => item.id === round.id)) return null;

      await appendJsonl(this.path("rounds.jsonl"), round);
      cursors.pending_user_consumed = Math.min(cursors.pending_user_consumed + 1, pending.length);
      await this.writeCursors(cursors);
      await this.updateRoundsCompleted(existing.length + 1);
      return round;
    });
  }

  async readPendingUsers(): Promise<PendingUserPrompt[]> {
    return readJsonl<PendingUserPrompt>(this.path("pending-user.jsonl"));
  }

  async readRounds(): Promise<Round[]> {
    return readJsonl<Round>(this.path("rounds.jsonl"));
  }

  async readUnrolledRounds(): Promise<Round[]> {
    const cursors = await this.readCursors();
    const rounds = await this.readRounds();
    return rounds.slice(cursors.rounds_rollup_completed);
  }

  async readCursors(): Promise<Cursors> {
    return this.readJson<Cursors>("cursors.json", {
      pending_user_consumed: 0,
      rounds_rollup_completed: 0,
    });
  }

  async writeCursors(cursors: Cursors): Promise<void> {
    await atomicWriteJson(this.path("cursors.json"), cursors);
  }

  async markRollupComplete(roundCount: number): Promise<void> {
    const cursors = await this.readCursors();
    cursors.rounds_rollup_completed = roundCount;
    await this.writeCursors(cursors);
    const meta = await this.readJson<SessionMeta | null>("meta.json", null);
    if (meta) {
      meta.last_rollup_round = roundCount;
      meta.last_seen_at = nowIso();
      await atomicWriteJson(this.path("meta.json"), meta);
    }
  }

  async enqueueRollup(reason: string): Promise<void> {
    await appendJsonl(this.path("jobs.jsonl"), {
      type: "rollup",
      reason,
      created_at: nowIso(),
    });
  }

  async appendTrace(trace: RollupTrace): Promise<void> {
    await appendJsonl(this.path("traces.jsonl"), trace);
  }

  async readTraces(): Promise<RollupTrace[]> {
    return readJsonl<RollupTrace>(this.path("traces.jsonl"));
  }

  async readMicatContext(): Promise<string> {
    return this.readText("micat_context.md");
  }

  async writeMicatContext(content: string): Promise<void> {
    await atomicWriteFile(this.path("micat_context.md"), content.trim() ? `${content.trim()}\n` : "");
  }

  async readActiveRules(): Promise<ActiveRule[]> {
    return this.readJson<ActiveRule[]>("active_rules.json", []);
  }

  async writeActiveRules(rules: ActiveRule[]): Promise<void> {
    await atomicWriteJson(this.path("active_rules.json"), rules);
    const markdown = renderActiveRulesMarkdown(rules);
    await atomicWriteFile(this.path("active_rules.md"), markdown);
  }

  async readActiveRulesMarkdown(): Promise<string> {
    return this.readText("active_rules.md");
  }

  async logError(error: unknown, context: string): Promise<void> {
    await appendJsonl(this.path("errors.jsonl"), {
      context,
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
      created_at: nowIso(),
    });
  }

  private async readText(name: string): Promise<string> {
    try {
      return await readFile(this.path(name), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
  }

  private async readJson<T>(name: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await readFile(this.path(name), "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
      throw error;
    }
  }

  private async updateRoundsCompleted(count: number): Promise<void> {
    const meta = await this.readJson<SessionMeta | null>("meta.json", null);
    if (!meta) return;
    meta.rounds_completed = count;
    meta.last_seen_at = nowIso();
    await atomicWriteJson(this.path("meta.json"), meta);
  }
}

export function renderActiveRulesMarkdown(rules: ActiveRule[]): string {
  if (rules.length === 0) return "";
  return [
    "Micat extracted execution-strategy rules:",
    "",
    ...rules.map((rule, index) => `${index + 1}. [${renderRuleType(rule.type)}] ${rule.rule}`),
    "",
  ].join("\n");
}

function renderRuleType(type: string): string {
  if (type === "agent_behavior_strategy") return "agent behavior strategy";
  if (type === "project_correction_instruction") return "project correction instruction";
  if (type === "interaction_behavior_correction") return "interaction behavior correction";
  if (type === "execution_rule") return "execution rule";
  return type || "execution rule";
}
