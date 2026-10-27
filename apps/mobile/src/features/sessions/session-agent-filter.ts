import {
  recentSessionRows,
  sessionInboxCards,
  type SessionInboxCard,
  type SessionInboxRow,
} from "./session-inbox";

/** Rows that never reported a provider/tool share this filter id. */
export const SESSION_AGENT_NONE = "__none__";

export const SESSION_AGENT_FILTER_EMPTY = {
  message: "No sessions for this agent. Clear the filter to see every session.",
  title: "No matching sessions",
} as const;

export function sessionAgentId(row: Pick<SessionInboxRow, "agentId">): string {
  return row.agentId?.trim() || SESSION_AGENT_NONE;
}

export function sessionAgentLabel(id: string): string {
  if (id === SESSION_AGENT_NONE) return "Unknown";
  const leaf = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  const name = leaf
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return name || "Agent";
}

export function sessionAgentChoices(
  rows: readonly Pick<SessionInboxRow, "agentId">[],
  extraIds: readonly string[] = [],
): Array<{ id: string; label: string }> {
  const ids = new Set<string>();
  for (const row of rows) ids.add(sessionAgentId(row));
  for (const id of extraIds) {
    const trimmed = id.trim();
    if (trimmed) ids.add(trimmed);
  }
  return [...ids]
    .map((id) => ({ id, label: sessionAgentLabel(id) }))
    .sort((left, right) => {
      if (left.id === SESSION_AGENT_NONE) return 1;
      if (right.id === SESSION_AGENT_NONE) return -1;
      return left.label.localeCompare(right.label);
    });
}

export function filterSessionRowsByAgent(
  rows: readonly SessionInboxRow[],
  agentIds: readonly string[],
): SessionInboxRow[] {
  if (agentIds.length === 0) return [...rows];
  const selected = new Set(agentIds);
  return rows.filter((row) => selected.has(sessionAgentId(row)));
}

export function visibleSessionInbox({
  agentIds,
  cards,
  recent,
  rows,
}: {
  agentIds: readonly string[];
  cards: SessionInboxCard[];
  recent: SessionInboxRow[];
  rows: SessionInboxRow[];
}): {
  cards: SessionInboxCard[];
  filterActive: boolean;
  recent: SessionInboxRow[];
  rows: SessionInboxRow[];
} {
  if (agentIds.length === 0) {
    return { cards, filterActive: false, recent, rows };
  }
  const filtered = filterSessionRowsByAgent(rows, agentIds);
  return {
    cards: sessionInboxCards(filtered),
    filterActive: true,
    recent: recentSessionRows(filtered),
    rows: filtered,
  };
}
