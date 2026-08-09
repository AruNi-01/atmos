/** Minimal session shape for idle dismissal matching (avoids heavy store imports in tests). */
export type IdleDismissableSession = {
  state: string;
  session_id: string;
  pane_id?: string | null;
  source_pane_id?: string | null;
};

export type AgentPaneState = "idle" | "running" | "permission_request";

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

/**
 * Pure helper: aggregate live agent state for one stable pane id.
 * Matches map key / session_id / pane_id, but not source_pane_id (side-chats).
 */
export function resolveAgentStateForPaneId(
  sessions:
    | ReadonlyMap<string, IdleDismissableSession>
    | Iterable<[string, IdleDismissableSession]>,
  paneId: string,
): AgentPaneState {
  const id = paneId?.trim();
  if (!id) return "idle";
  const entries = sessions instanceof Map ? sessions.entries() : sessions;
  let hasRunning = false;
  for (const [key, session] of entries) {
    if (key !== id && session.session_id !== id && session.pane_id !== id) {
      continue;
    }
    if (session.state === "permission_request") return "permission_request";
    if (session.state === "running") hasRunning = true;
  }
  return hasRunning ? "running" : "idle";
}
