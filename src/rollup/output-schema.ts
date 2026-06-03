import type { RollupOutput } from "../types/rollup.js";

export function parseRollupOutput(raw: string): RollupOutput {
  const jsonText = extractJson(raw);
  const parsed = JSON.parse(jsonText) as Partial<RollupOutput>;
  if (typeof parsed.micat_context !== "string") {
    throw new Error("Rollup output missing string micat_context");
  }
  if (!Array.isArray(parsed.active_rules_patch)) {
    throw new Error("Rollup output missing active_rules_patch array");
  }
  return {
    micat_context: parsed.micat_context,
    active_rules_patch: parsed.active_rules_patch.map((item) => ({
      type: String(item.type ?? "execution_rule"),
      rule: String(item.rule ?? ""),
      evidence: String(item.evidence ?? ""),
      confidence: Number(item.confidence ?? 0.5),
    })),
  };
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  throw new Error("Rollup output did not contain JSON");
}
