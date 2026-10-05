export type WorkspaceActivityRow = {
  id: string;
  kind: "chat" | "terminal";
  title: string;
  subtitle: string;
  updatedAt: string | null;
  agentId: string | null;
  /** Agent-status catalog id. Pins use this so a terminal stays pinned when its pane id changes. */
  catalogId: string | null;
};

export type WorkspaceTerminalSnapshot = {
  session_id: string;
  surface?: string | null;
  surface_id?: string | null;
  context_id?: string | null;
  tool?: string | null;
  updated_at?: string | null;
};

export type WorkspaceTerminalCandidate = {
  id: string;
  cwd?: string | null;
  session_id?: string | null;
  tmux_window_name?: string | null;
  session_title?: string | null;
  dynamic_title?: string | null;
  terminal_name?: string | null;
  label?: string | null;
};

export function workspaceActivityRows(input: {
  chats: Array<{ id: string; title: string; place: string; updatedAt: string; providerId?: string | null }>;
  terminals: Array<{
    id: string;
    title: string;
    subtitle: string;
    agentId?: string | null;
    updatedAt?: string | null;
    catalogId?: string | null;
  }>;
}): WorkspaceActivityRow[] {
  const chats = input.chats
    .filter((row) => row.id.trim().length > 0)
    .map((row) => ({
      id: row.id,
      kind: "chat" as const,
      title: row.title,
      subtitle: row.place,
      updatedAt: row.updatedAt,
      agentId: row.providerId?.trim() || null,
      catalogId: null,
    }));
  const seen = new Set(chats.map((row) => row.id));
  const terminals = input.terminals.flatMap((row) => {
    const id = row.id.trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      kind: "terminal" as const,
      title: row.title.trim() || "Terminal",
      subtitle: row.subtitle,
      updatedAt: row.updatedAt?.trim() || null,
      agentId: row.agentId?.trim() || null,
      catalogId: row.catalogId?.trim() || null,
    }];
  });
  return [...chats, ...terminals].sort(byRecent);
}

/**
 * Terminal Agent rows for one workspace, from the same status list web shows.
 * A shell window that never became an agent session is not in that list.
 */
export function terminalActivityFromStatus(input: {
  workspaceId: string;
  snapshots: readonly WorkspaceTerminalSnapshot[];
  candidates: readonly WorkspaceTerminalCandidate[];
  placeLabel: (cwd: string | null | undefined) => string;
}): Array<{
  id: string;
  title: string;
  subtitle: string;
  agentId: string | null;
  updatedAt: string | null;
  catalogId: string;
}> {
  const rows = [];
  for (const snapshot of input.snapshots) {
    if (snapshot.surface && snapshot.surface !== "terminal") continue;
    const sessionId = snapshot.session_id.trim();
    if (!sessionId) continue;
    const contextId = snapshot.context_id?.trim() ?? "";
    if (contextId && contextId !== input.workspaceId) continue;
    const candidate = candidateForSnapshot(input.workspaceId, snapshot, input.candidates);
    if (!contextId && !candidate) continue;
    const cwd = candidate?.cwd?.trim() ?? "";
    const place = cwd ? input.placeLabel(cwd) : "Terminal";
    rows.push({
      id: candidate?.id ?? sessionId,
      catalogId: sessionId,
      title: terminalStatusTitle(sessionId, candidate),
      subtitle: place === "Thread" ? "Terminal" : place,
      agentId: snapshot.tool?.trim() || null,
      updatedAt: snapshot.updated_at?.trim() || null,
    });
  }
  return rows;
}

function byRecent(
  left: { updatedAt: string | null },
  right: { updatedAt: string | null },
): number {
  const leftTime = Date.parse(left.updatedAt ?? "");
  const rightTime = Date.parse(right.updatedAt ?? "");
  const leftOk = Boolean(left.updatedAt) && Number.isFinite(leftTime);
  const rightOk = Boolean(right.updatedAt) && Number.isFinite(rightTime);
  if (leftOk && rightOk && leftTime !== rightTime) return rightTime - leftTime;
  if (leftOk !== rightOk) return leftOk ? -1 : 1;
  return 0;
}

function candidateForSnapshot(
  workspaceId: string,
  snapshot: WorkspaceTerminalSnapshot,
  candidates: readonly WorkspaceTerminalCandidate[],
): WorkspaceTerminalCandidate | undefined {
  const sessionId = snapshot.session_id.trim();
  const surfaceId = snapshot.surface_id?.trim() ?? "";
  return candidates.find((candidate) => {
    const keys = new Set<string>();
    const session = candidate.session_id?.trim() ?? "";
    const id = candidate.id.trim();
    const windowName = candidate.tmux_window_name?.trim() ?? "";
    if (session) keys.add(session);
    if (id) keys.add(id);
    if (windowName) keys.add(`${workspaceId}:${windowName}`);
    return keys.has(sessionId) || (surfaceId.length > 0 && keys.has(surfaceId));
  });
}

function terminalStatusTitle(sessionId: string, candidate: WorkspaceTerminalCandidate | undefined): string {
  const fromCandidate = candidate
    ? cleanActivityTitle(candidate.session_title) ?? cleanActivityTitle(candidate.dynamic_title)
    : null;
  if (fromCandidate && !isIndexTitle(fromCandidate)) return fromCandidate;
  const named = candidate
    ? cleanActivityTitle(candidate.terminal_name) ?? cleanActivityTitle(candidate.label)
    : null;
  if (named && !isIndexTitle(named) && !isOpaqueId(named)) return named;
  const windowName = windowNameFromSessionId(sessionId);
  if (windowName && !isIndexTitle(windowName)) return windowName;
  return "Terminal";
}

function windowNameFromSessionId(sessionId: string): string {
  const colon = sessionId.indexOf(":");
  if (colon < 0) return sessionId.trim();
  return sessionId.slice(colon + 1).trim();
}

function isIndexTitle(value: string): boolean {
  return /^\d+$/.test(value);
}

function isOpaqueId(value: string): boolean {
  return /^[0-9a-f-]{16,}$/i.test(value);
}

function cleanActivityTitle(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function terminalAgentId(
  workspaceId: string,
  candidate: { id: string; session_id?: string | null; tmux_window_name?: string | null },
  sessions: ReadonlyArray<{ session_id: string; surface_id?: string | null; tool?: string | null }>,
): string | null {
  const keys = new Set<string>();
  const add = (value: string | null | undefined) => {
    const trimmed = value?.trim() ?? "";
    if (trimmed) keys.add(trimmed);
  };
  add(candidate.session_id);
  add(candidate.id);
  const windowName = candidate.tmux_window_name?.trim();
  if (windowName) add(`${workspaceId}:${windowName}`);
  if (keys.size === 0) return null;
  const match = sessions.find((session) =>
    keys.has(session.session_id) || (session.surface_id != null && keys.has(session.surface_id)),
  );
  const tool = match?.tool?.trim() ?? "";
  return tool.length > 0 ? tool : null;
}

export function terminalActivityTitle(candidate: {
  session_title?: string | null;
  dynamic_title?: string | null;
  terminal_name?: string | null;
  label?: string | null;
}): string {
  return (
    candidate.session_title?.trim()
    || candidate.dynamic_title?.trim()
    || candidate.terminal_name?.trim()
    || candidate.label?.trim()
    || "Terminal"
  );
}
