/** Minimal session shape for idle dismissal matching (avoids heavy store imports in tests). */
export type IdleDismissableSession = {
  state: string;
  session_id: string;
  pane_id?: string | null;
  source_pane_id?: string | null;
  surface?: "terminal" | "chat" | null;
  surface_id?: string | null;
};

export type AgentPaneState = "idle" | "running" | "permission_request";

export type CollectSessionIdsForPaneOptions = {
  /** Default true. Idle-only is used when focusing a pane to drop stale idle rows. */
  idleOnly?: boolean;
  /**
   * Default true. Pane destroy should also drop side-chat sessions sourced
   * from this pane. Title-based agent-exit cleanup should leave those alone.
   */
  includeSource?: boolean;
};

function sessionBelongsToPane(
  mapKey: string,
  session: IdleDismissableSession,
  paneId: string,
  includeSource: boolean,
): boolean {
  if (
    mapKey === paneId ||
    session.session_id === paneId ||
    session.pane_id === paneId
  ) {
    return true;
  }
  return includeSource && session.source_pane_id === paneId;
}

/**
 * Session map keys attributed to a stable pane id (`{context}:{tmuxWindowName}`).
 * Matches map key / session_id / pane_id, and optionally source_pane_id.
 */
export function collectSessionIdsForPane(
  sessions:
    | ReadonlyMap<string, IdleDismissableSession>
    | Iterable<[string, IdleDismissableSession]>,
  stablePaneId: string,
  options: CollectSessionIdsForPaneOptions = {},
): string[] {
  const paneId = stablePaneId?.trim();
  if (!paneId) return [];
  const idleOnly = options.idleOnly === true;
  const includeSource = options.includeSource !== false;
  const entries = sessions instanceof Map ? sessions.entries() : sessions;
  const toRemove: string[] = [];
  for (const [id, session] of entries) {
    if (idleOnly && session.state !== "idle") continue;
    if (sessionBelongsToPane(id, session, paneId, includeSource)) {
      toRemove.push(id);
    }
  }
  return toRemove;
}

/** Pure helper: idle session map keys that belong to a stable pane id. */
export function collectIdleSessionIdsForPane(
  sessions:
    | ReadonlyMap<string, IdleDismissableSession>
    | Iterable<[string, IdleDismissableSession]>,
  stablePaneId: string,
): string[] {
  return collectSessionIdsForPane(sessions, stablePaneId, {
    idleOnly: true,
    includeSource: true,
  });
}

/** First session whose map key / session_id / pane_id matches a stable pane id. */
export function findSessionForPaneId<T extends IdleDismissableSession>(
  sessions: ReadonlyMap<string, T> | Iterable<[string, T]>,
  stablePaneId: string,
): T | undefined {
  const paneId = stablePaneId?.trim();
  if (!paneId) return undefined;
  if (sessions instanceof Map) {
    const direct = sessions.get(paneId);
    if (direct) return direct;
  }
  const entries = sessions instanceof Map ? sessions.entries() : sessions;
  for (const [id, session] of entries) {
    if (sessionBelongsToPane(id, session, paneId, false)) {
      return session;
    }
  }
  return undefined;
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

/** Aggregate live agent state for one Agent Chat id (`chat:{id}` or surface_id). */
export function resolveAgentStateForChatId(
  sessions:
    | ReadonlyMap<string, IdleDismissableSession>
    | Iterable<[string, IdleDismissableSession]>,
  chatId: string,
): AgentPaneState {
  const id = chatId?.trim();
  if (!id) return "idle";
  const sessionId = `chat:${id}`;
  const entries = sessions instanceof Map ? sessions.entries() : sessions;
  let hasRunning = false;
  for (const [key, session] of entries) {
    const isChat =
      key === sessionId ||
      session.session_id === sessionId ||
      session.surface_id === id ||
      (session.surface === "chat" && session.surface_id === id);
    if (!isChat) continue;
    if (session.state === "permission_request") return "permission_request";
    if (session.state === "running") hasRunning = true;
  }
  return hasRunning ? "running" : "idle";
}
