export type WorkspaceActivityRow = {
  id: string;
  kind: "chat" | "terminal";
  title: string;
  subtitle: string;
  updatedAt: string | null;
};

export function workspaceActivityRows(input: {
  chats: Array<{ id: string; title: string; place: string; updatedAt: string }>;
  terminals: Array<{ id: string; title: string; subtitle: string }>;
}): WorkspaceActivityRow[] {
  const chats = input.chats
    .filter((row) => row.id.trim().length > 0)
    .map((row) => ({
      id: row.id,
      kind: "chat" as const,
      title: row.title,
      subtitle: row.place,
      updatedAt: row.updatedAt,
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
    }];
  });
  return [...chats, ...terminals];
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
