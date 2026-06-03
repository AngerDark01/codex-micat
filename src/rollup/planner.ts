import type { MicatConfig } from "../config/defaults.js";
import type { SessionStore } from "../session/store.js";

export async function shouldScheduleRollup(config: MicatConfig, store: SessionStore): Promise<boolean> {
  const rounds = await store.readRounds();
  const cursors = await store.readCursors();
  return rounds.length - cursors.rounds_rollup_completed >= config.rollup.rounds;
}
