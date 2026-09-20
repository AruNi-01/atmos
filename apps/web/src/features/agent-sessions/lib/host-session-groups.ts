import type { HostSessionListItem } from "@atmos/api-types/ws/dto/host-session";
import { TERMINAL_AGENT_DEFINITIONS } from "@/features/agent/lib/terminal-agent-definitions";
import { hostSessionProjectLabel } from "@/features/agent-sessions/lib/host-session-filters";

export type HostSessionGroupMode = "all" | "agent" | "project";

export type HostSessionSortField = "started_at" | "updated_at" | "byte_size";
export type HostSessionSortOrder = "asc" | "desc";

export type HostSessionSort = {
  field: HostSessionSortField;
  order: HostSessionSortOrder;
};

export const DEFAULT_HOST_SESSION_SORT: HostSessionSort = {
  field: "updated_at",
  order: "desc",
};

export function isDefaultHostSessionSort(sort: HostSessionSort): boolean {
  return (
    sort.field === DEFAULT_HOST_SESSION_SORT.field &&
    sort.order === DEFAULT_HOST_SESSION_SORT.order
  );
}

export type HostSessionGroup = {
  key: string;
  label: string;
  providerId: string | null;
  sessions: HostSessionListItem[];
};

export type HostSessionVirtualRow =
  | { kind: "header"; group: HostSessionGroup }
  | { kind: "session"; session: HostSessionListItem; groupKey: string };

const HOST_PROVIDER_TO_TERMINAL_AGENT: Record<string, string> = {
  grok: "grok-build",
};

export function hostSessionAgentIconId(providerId: string): string {
  return HOST_PROVIDER_TO_TERMINAL_AGENT[providerId] ?? providerId;
}

export function hostSessionAgentLabel(providerId: string): string {
  const id = hostSessionAgentIconId(providerId);
  return TERMINAL_AGENT_DEFINITIONS.find((item) => item.id === id)?.label ?? providerId;
}

function sessionSortValue(session: HostSessionListItem, field: HostSessionSortField): number {
  if (field === "byte_size") return session.byte_size ?? -1;
  return Date.parse(field === "started_at" ? session.started_at : session.updated_at) || 0;
}

function compareSessions(
  a: HostSessionListItem,
  b: HostSessionListItem,
  sort: HostSessionSort,
): number {
  const dir = sort.order === "asc" ? 1 : -1;
  return (
    (sessionSortValue(a, sort.field) - sessionSortValue(b, sort.field)) * dir ||
    a.key.localeCompare(b.key)
  );
}

function sortSessions(
  sessions: HostSessionListItem[],
  sort: HostSessionSort,
): HostSessionListItem[] {
  return [...sessions].sort((a, b) => compareSessions(a, b, sort));
}

export function filterHostSessionsByQuery(
  sessions: readonly HostSessionListItem[],
  query: string,
): HostSessionListItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...sessions];
  return sessions.filter((session) => {
    const haystack = [
      session.title,
      session.native_id,
      session.provider_id,
      hostSessionAgentLabel(session.provider_id),
      hostSessionProjectLabel(session),
      session.cwd,
    ]
      .join("\n")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function groupHostSessions(
  sessions: readonly HostSessionListItem[],
  mode: Exclude<HostSessionGroupMode, "all">,
  unknownProjectLabel: string,
  sort: HostSessionSort = DEFAULT_HOST_SESSION_SORT,
): HostSessionGroup[] {
  const buckets = new Map<string, HostSessionGroup>();

  for (const session of sessions) {
    if (mode === "agent") {
      const key = session.provider_id;
      const existing = buckets.get(key);
      if (existing) {
        existing.sessions.push(session);
        continue;
      }
      buckets.set(key, {
        key,
        label: hostSessionAgentLabel(key),
        providerId: key,
        sessions: [session],
      });
      continue;
    }

    const label = hostSessionProjectLabel(session) || unknownProjectLabel;
    const key = `project:${label.toLowerCase()}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.sessions.push(session);
      continue;
    }
    buckets.set(key, {
      key,
      label,
      providerId: null,
      sessions: [session],
    });
  }

  return [...buckets.values()]
    .map((group) => ({ ...group, sessions: sortSessions(group.sessions, sort) }))
    .sort((a, b) => {
      if (mode === "agent") return a.label.localeCompare(b.label) || a.key.localeCompare(b.key);
      const firstA = a.sessions[0];
      const firstB = b.sessions[0];
      if (!firstA || !firstB) return a.label.localeCompare(b.label);
      return compareSessions(firstA, firstB, sort) || a.label.localeCompare(b.label);
    });
}

export function flattenHostSessionGroups(
  groups: readonly HostSessionGroup[],
  collapsed: Readonly<Record<string, boolean>>,
): HostSessionVirtualRow[] {
  const rows: HostSessionVirtualRow[] = [];
  for (const group of groups) {
    rows.push({ kind: "header", group });
    if (collapsed[group.key]) continue;
    for (const session of group.sessions) {
      rows.push({ kind: "session", session, groupKey: group.key });
    }
  }
  return rows;
}

export function flattenHostSessionRows(
  sessions: readonly HostSessionListItem[],
  mode: HostSessionGroupMode,
  unknownProjectLabel: string,
  sort: HostSessionSort,
  collapsed: Readonly<Record<string, boolean>>,
): HostSessionVirtualRow[] {
  if (mode === "all") {
    return sortSessions([...sessions], sort).map((session) => ({
      kind: "session" as const,
      session,
      groupKey: "all",
    }));
  }
  return flattenHostSessionGroups(
    groupHostSessions(sessions, mode, unknownProjectLabel, sort),
    collapsed,
  );
}
