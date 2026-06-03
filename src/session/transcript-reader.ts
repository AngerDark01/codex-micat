export interface FinalAnswer {
  message: string;
  turn_id: string | null;
}

interface TranscriptEvent {
  type?: string;
  turn_id?: string;
  payload?: {
    type?: string;
    phase?: string;
    message?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export async function readLatestFinalAnswer(transcriptPath: string | null | undefined): Promise<FinalAnswer | null> {
  if (!transcriptPath) return null;
  const { readFile } = await import("node:fs/promises");
  let text = "";
  try {
    text = await readFile(transcriptPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  let latest: FinalAnswer | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: TranscriptEvent;
    try {
      event = JSON.parse(line) as TranscriptEvent;
    } catch {
      continue;
    }
    if (
      event.type === "event_msg" &&
      event.payload?.type === "agent_message" &&
      event.payload.phase === "final_answer" &&
      typeof event.payload.message === "string"
    ) {
      latest = {
        message: event.payload.message,
        turn_id: event.turn_id ?? null,
      };
    }
  }
  return latest;
}
