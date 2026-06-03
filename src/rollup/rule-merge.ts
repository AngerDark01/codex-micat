import { createHash } from "node:crypto";
import { nowIso } from "../fs/paths.js";
import type { ActiveRule } from "../types/micat-state.js";
import type { ActiveRulesPatchItem } from "../types/rollup.js";

function normalizeRule(rule: string): string {
  return rule.toLowerCase().replace(/\s+/g, " ").trim();
}

function ruleId(rule: string): string {
  return createHash("sha256").update(normalizeRule(rule)).digest("hex").slice(0, 24);
}

export function mergeActiveRules(existing: ActiveRule[], patch: ActiveRulesPatchItem[]): ActiveRule[] {
  const byId = new Map(existing.map((rule) => [rule.id, rule]));
  const now = nowIso();

  for (const item of patch) {
    const rule = item.rule.trim();
    if (!rule) continue;
    const id = ruleId(rule);
    const current = byId.get(id);
    if (current) {
      byId.set(id, {
        ...current,
        evidence: item.evidence || current.evidence,
        confidence: Math.max(current.confidence, item.confidence || 0),
        updated_at: now,
      });
      continue;
    }
    byId.set(id, {
      id,
      type: item.type || "execution_rule",
      rule,
      evidence: item.evidence || "",
      confidence: Number.isFinite(item.confidence) ? item.confidence : 0.5,
      created_at: now,
      updated_at: now,
    });
  }

  return [...byId.values()].sort((a, b) => b.confidence - a.confidence || a.created_at.localeCompare(b.created_at));
}
