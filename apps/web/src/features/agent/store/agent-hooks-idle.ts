/** Minimal session shape for idle dismissal matching (avoids heavy store imports in tests). */
export type IdleDismissableSession = {
  state: string;
  session_id: string;
  pane_id?: string | null;
  source_pane_id?: string | null;
};

/** Pure helper: idle session map keys that belong to a stable pane id. */
export function collectIdleSessionIdsForPane(
  sessions:
    | ReadonlyMap<string, IdleDismissableSession>
    | Iterable<[string, IdleDismissableSession]>,
  stablePaneId: string,
): string[] {
  const paneId = stablePaneId?.trim();
  if (!paneId) return [];
  const entries = sessions instanceof Map ? sessions.entries() : sessions;
  const toRemove: string[] = [];
  for (const [id, session] of entries) {
    if (session.state !== "idle") continue;
    if (
      id === paneId ||
      session.session_id === paneId ||
      session.pane_id === paneId ||
      session.source_pane_id === paneId
    ) {
      toRemove.push(id);
    }
  }
  return toRemove;
}
