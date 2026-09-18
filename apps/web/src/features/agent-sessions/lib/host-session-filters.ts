import type { HostSessionListItem } from "@atmos/api-types/ws/dto/host-session";

export type HostSessionFilters = {
  providerId: string | null;
  project: string | null;
  dateFrom: string | null;
  dateTo: string | null;
};

export const EMPTY_HOST_SESSION_FILTERS: HostSessionFilters = {
  providerId: null,
  project: null,
  dateFrom: null,
  dateTo: null,
};

export const HOST_SESSION_QUICK_RANGES = [
  "today",
  "yesterday",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "lastYear",
] as const;

export type HostSessionQuickRange = (typeof HOST_SESSION_QUICK_RANGES)[number];

export function hostSessionProjectLabel(session: {
  cwd: string;
  project_name?: string | null;
}): string {
  const cwd = session.cwd.trim().replace(/[\\/]+$/, "");
  const last = cwd.split(/[\\/]+/).filter(Boolean).at(-1)?.trim();
  if (last) return last;
  return session.project_name?.trim() || "";
}

export function projectFilterValue(session: HostSessionListItem): string {
  return hostSessionProjectLabel(session);
}

export function filterHostSessions(
  sessions: readonly HostSessionListItem[],
  filters: HostSessionFilters,
): HostSessionListItem[] {
  const project = filters.project?.trim() ?? "";
  return sessions.filter((session) => {
    if (filters.providerId && session.provider_id !== filters.providerId) {
      return false;
    }
    if (project && projectFilterValue(session) !== project) {
      return false;
    }
    return true;
  });
}

export function uniqueProviderIds(sessions: readonly HostSessionListItem[]): string[] {
  return [...new Set(sessions.map((session) => session.provider_id))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function uniqueProjectValues(sessions: readonly HostSessionListItem[]): string[] {
  const values = new Set<string>();
  for (const session of sessions) {
    const value = projectFilterValue(session);
    if (value) values.add(value);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function hostSessionFilterCount(filters: HostSessionFilters): number {
  return (
    (filters.providerId ? 1 : 0) +
    (filters.project ? 1 : 0) +
    (filters.dateFrom || filters.dateTo ? 1 : 0)
  );
}

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function hostSessionDateBounds(filters: HostSessionFilters): {
  updatedAfter: string | null;
  updatedBefore: string | null;
} {
  const from = filters.dateFrom ? parseLocalDateKey(filters.dateFrom) : null;
  const to = filters.dateTo
    ? parseLocalDateKey(filters.dateTo)
    : from;
  if (!from && !to) {
    return { updatedAfter: null, updatedBefore: null };
  }
  const start = from ?? to;
  const end = to ?? from;
  if (!start || !end) {
    return { updatedAfter: null, updatedBefore: null };
  }
  const begin = start.getTime() <= end.getTime() ? start : end;
  const last = start.getTime() <= end.getTime() ? end : start;
  const exclusive = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
  return {
    updatedAfter: begin.toISOString(),
    updatedBefore: exclusive.toISOString(),
  };
}

export function hostSessionQuickRangeBounds(
  id: HostSessionQuickRange,
  now = new Date(),
): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const key = (date: Date) => toLocalDateKey(date);
  if (id === "today") return { from: key(today), to: key(today) };
  if (id === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { from: key(yesterday), to: key(yesterday) };
  }
  if (id === "lastWeek") {
    const from = new Date(today);
    from.setDate(from.getDate() - 7);
    const to = new Date(today);
    to.setDate(to.getDate() - 1);
    return { from: key(from), to: key(to) };
  }
  if (id === "thisMonth") {
    return {
      from: key(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: key(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    };
  }
  if (id === "lastMonth") {
    return {
      from: key(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: key(new Date(today.getFullYear(), today.getMonth(), 0)),
    };
  }
  if (id === "thisYear") {
    return {
      from: key(new Date(today.getFullYear(), 0, 1)),
      to: key(new Date(today.getFullYear(), 11, 31)),
    };
  }
  const year = today.getFullYear() - 1;
  return {
    from: key(new Date(year, 0, 1)),
    to: key(new Date(year, 11, 31)),
  };
}

export function matchHostSessionQuickRange(
  filters: HostSessionFilters,
  now = new Date(),
): HostSessionQuickRange | null {
  if (!filters.dateFrom || !filters.dateTo) return null;
  for (const id of HOST_SESSION_QUICK_RANGES) {
    const bounds = hostSessionQuickRangeBounds(id, now);
    if (bounds.from === filters.dateFrom && bounds.to === filters.dateTo) return id;
  }
  return null;
}

export function formatHostSessionBytes(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value >= 10 || exp === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}

export function hasAtmosChatTag(session: HostSessionListItem): boolean {
  return session.tags.includes("atmos_chat");
}

export function hostSessionHref(
  key?: string | null,
  locator?: { messageId?: string | null; seq?: number | null },
): string {
  if (!key) return "/agent-sessions";
  const params = new URLSearchParams();
  params.set("key", key);
  const messageId = locator?.messageId?.trim();
  if (messageId) params.set("mid", messageId);
  if (locator?.seq != null && Number.isInteger(locator.seq) && locator.seq >= 0) {
    params.set("seq", String(locator.seq));
  }
  return `/agent-sessions?${params.toString()}`;
}

function escapeHostSessionRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Longest-first terms: full query plus whitespace tokens, for FTS-style highlight. */
export function hostSessionSearchTerms(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return Array.from(
    new Map(
      [trimmed, ...trimmed.split(/\s+/)]
        .map((term) => term.trim())
        .filter(Boolean)
        .map((term) => [term.toLowerCase(), term] as const),
    ).values(),
  ).sort((a, b) => b.length - a.length);
}

export function hostSessionHighlightParts(
  text: string,
  query: string,
): { text: string; match: boolean }[] {
  const terms = hostSessionSearchTerms(query);
  if (terms.length === 0 || !text) return [{ text, match: false }];
  const pattern = new RegExp(`(${terms.map(escapeHostSessionRegExp).join("|")})`, "gi");
  const lowerTerms = terms.map((term) => term.toLowerCase());
  const parts: { text: string; match: boolean }[] = [];
  for (const part of text.split(pattern)) {
    if (!part) continue;
    parts.push({
      text: part,
      match: lowerTerms.includes(part.toLowerCase()),
    });
  }
  return parts.length > 0 ? parts : [{ text, match: false }];
}

export function hostSessionMessageIndex(
  messages: readonly { id: string }[],
  locator: { messageId?: string | null; seq?: number | null },
): number {
  const messageId = locator.messageId?.trim() ?? "";
  if (messageId) {
    const index = messages.findIndex((message) => message.id === messageId);
    if (index >= 0) return index;
  }
  if (
    locator.seq != null &&
    Number.isInteger(locator.seq) &&
    locator.seq >= 0 &&
    locator.seq < messages.length
  ) {
    return locator.seq;
  }
  return -1;
}
