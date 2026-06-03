import type { SessionStore } from "../session/store.js";

export async function ensureSidecar(_store: SessionStore): Promise<void> {
  // v1 keeps sidecar optional. The hook path works without a daemon because
  // PreCompact can run rollup in-process. A real daemon can replace this no-op.
}
