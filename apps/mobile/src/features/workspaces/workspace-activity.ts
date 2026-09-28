export type WorkspaceActivityRow = {
  id: string;
  kind: "chat" | "terminal";
  title: string;
  subtitle: string;
  updatedAt: string | null;
  agentId: string | null;
};

export function workspaceActivityRows(input: {
  chats: Array<{ id: string; title: string; place: string; updatedAt: string; providerId?: string | null }>;
  terminals: Array<{ id: string; title: string; subtitle: string; agentId?: string | null }>;
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
    }))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
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
      updatedAt: null,
      agentId: row.agentId?.trim() || null,
    }];
  });
  return [...chats, ...terminals];
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
