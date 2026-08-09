/**
 * Bi-directional sync between the free-form GitHub search box and structured
 * filters (state / assignees / labels). Repositories stay UI-only and are never
 * written into the search string.
 */

import type {
  TaskGithubFilters,
  TaskGithubStateFilter,
} from "@/features/task/components/TaskGithubFilterMenu";
import type { TaskGithubSortParam } from "@/shared/lib/nuqs/searchParams";

export type ManagedGithubFilters = Pick<
  TaskGithubFilters,
  "state" | "assignees" | "labels"
>;

/** Tokens we own in the search box (everything else is freeform). */
const MANAGED_TOKEN_RE =
  /(?:^|\s)(?:is:(?:open|closed|merged)|assignee:(?:"[^"]*"|[^\s]+)|label:(?:"[^"]*"|[^\s]+))/gi;

function needsQuote(value: string): boolean {
  return /[\s:]/.test(value);
}

function formatToken(key: "assignee" | "label", value: string): string {
  const v = value.trim();
  if (!v) return "";
  return needsQuote(v) ? `${key}:"${v.replace(/"/g, "")}"` : `${key}:${v}`;
}

function unquote(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    return t.slice(1, -1);
  }
  return t;
}

/** Drop managed tokens; keep freeform (sort:, author:, text, …). */
export function stripManagedTokens(query: string): string {
  return query
    .replace(MANAGED_TOKEN_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ParsedManagedGithubFilters = ManagedGithubFilters & {
  /** True when the query contained an explicit `is:open|closed|merged` token. */
  stateExplicit: boolean;
};

/** Read state / assignees / labels from a GitHub search string. */
export function parseManagedFromQuery(query: string): ParsedManagedGithubFilters {
  const assignees: string[] = [];
  const labels: string[] = [];
  let state: TaskGithubStateFilter = "all";
  let stateExplicit = false;

  const re =
    /(?:^|\s)(is|assignee|label):(?:"([^"]*)"|([^\s]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(query)) !== null) {
    const key = match[1].toLowerCase();
    const value = unquote(match[2] ?? match[3] ?? "");
    if (!value) continue;
    if (key === "is") {
      const v = value.toLowerCase();
      if (v === "closed" || v === "merged") {
        state = "closed";
        stateExplicit = true;
      } else if (v === "open") {
        state = "open";
        stateExplicit = true;
      }
    } else if (key === "assignee") {
      if (!assignees.includes(value)) assignees.push(value);
    } else if (key === "label") {
      if (!labels.includes(value)) labels.push(value);
    }
  }

  return {
    state,
    stateExplicit,
    assignees,
    labels,
  };
}

/**
 * Rewrite managed tokens from filters into `query`, preserving freeform text.
 * Does not touch `repo:` (repos stay outside the search box).
 * State `all` omits `is:open` / `is:closed` so every status is returned.
 */
export function applyManagedToQuery(
  query: string,
  managed: ManagedGithubFilters,
): string {
  const rest = stripManagedTokens(query);
  const parts: string[] = [];
  if (rest) parts.push(rest);
  if (managed.state === "closed") {
    parts.push("is:closed");
  } else if (managed.state === "open") {
    parts.push("is:open");
  }
  // `all` → no state token
  for (const a of managed.assignees) {
    const token = formatToken("assignee", a);
    if (token) parts.push(token);
  }
  for (const l of managed.labels) {
    const token = formatToken("label", l);
    if (token) parts.push(token);
  }
  return parts.join(" ").trim();
}

export function managedFiltersEqual(
  a: ManagedGithubFilters,
  b: ManagedGithubFilters,
): boolean {
  if (a.state !== b.state) return false;
  if (a.assignees.length !== b.assignees.length) return false;
  if (a.labels.length !== b.labels.length) return false;
  const aA = [...a.assignees].sort();
  const bA = [...b.assignees].sort();
  const aL = [...a.labels].sort();
  const bL = [...b.labels].sort();
  return aA.every((v, i) => v === bA[i]) && aL.every((v, i) => v === bL[i]);
}

const SORT_VALUES: TaskGithubSortParam[] = [
  "created-desc",
  "created-asc",
  "comments-desc",
  "comments-asc",
  "updated-desc",
  "updated-asc",
  "best-match",
];

/** Drop any `sort:` token from freeform. */
export function stripSortTokens(query: string): string {
  return query
    .replace(/(?:^|\s)sort:[^\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Write `sort:` into the search string (visible in the box + sent to the API).
 * Best match keeps an explicit `sort:best-match` marker for the backend.
 */
export function applySortToQuery(query: string, sort: TaskGithubSortParam): string {
  const rest = stripSortTokens(query);
  const token = `sort:${sort}`;
  return rest ? `${rest} ${token}` : token;
}

/** Read `sort:` from freeform when present and valid. */
export function parseSortFromQuery(query: string): TaskGithubSortParam | null {
  const match = query.match(/(?:^|\s)sort:([^\s]+)/i);
  if (!match?.[1]) return null;
  const value = match[1].toLowerCase() as TaskGithubSortParam;
  return SORT_VALUES.includes(value) ? value : null;
}
