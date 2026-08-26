/** Shared helpers for PR/Issue timeline grouping (commits + cross-references). */

import { isTimelineCrossReferencedItem } from "./timeline-refs";

export type TimelineCommitLike = {
  event?: string;
  type?: string;
  sha?: string;
  commit_sha?: string;
  commit_id?: string;
  body?: string;
  message?: string;
  messageHeadline?: string;
  createdAt?: string;
  created_at?: string;
  author?: {
    login?: string;
    name?: string;
    avatar_url?: string;
    avatarUrl?: string;
    is_bot?: boolean;
  };
  actor?: { login?: string; avatar_url?: string; avatarUrl?: string };
};

export type GroupedTimelineEntry<T> =
  | { kind: "item"; item: T; index: number }
  | { kind: "commits"; commits: T[]; startIndex: number }
  | { kind: "cross-referenced"; items: T[]; startIndex: number };

export function isTimelineCommitItem(item: {
  event?: string;
  type?: string;
}): boolean {
  return item.event === "committed" || item.type === "commit";
}

/**
 * Fold consecutive committed events into a GitHub-style "added N commits"
 * group, and consecutive `cross-referenced` events into "This was referenced".
 */
export function groupConsecutiveTimelineCommits<T extends TimelineCommitLike>(
  items: T[],
): GroupedTimelineEntry<T>[] {
  const result: GroupedTimelineEntry<T>[] = [];
  let i = 0;
  while (i < items.length) {
    const current = items[i];
    if (isTimelineCommitItem(current)) {
      const startIndex = i;
      const commits: T[] = [];
      while (i < items.length && isTimelineCommitItem(items[i])) {
        commits.push(items[i]);
        i += 1;
      }
      result.push({ kind: "commits", commits, startIndex });
    } else if (isTimelineCrossReferencedItem(current)) {
      const startIndex = i;
      const refs: T[] = [];
      while (i < items.length && isTimelineCrossReferencedItem(items[i])) {
        refs.push(items[i]);
        i += 1;
      }
      result.push({ kind: "cross-referenced", items: refs, startIndex });
    } else {
      result.push({ kind: "item", item: current, index: i });
      i += 1;
    }
  }
  return result;
}

export function getTimelineCommitSha(item: TimelineCommitLike): string {
  return item.sha || item.commit_sha || item.commit_id || "";
}

export function getTimelineCommitSubject(item: TimelineCommitLike): string {
  return item.body || item.message || item.messageHeadline || "";
}

export function getTimelineCommitAuthor(item: TimelineCommitLike): {
  login: string;
  avatarUrl?: string;
} {
  const author = item.author ?? item.actor;
  const login =
    author?.login ||
    (author as { name?: string } | undefined)?.name ||
    "unknown";
  const avatarUrl =
    author?.avatar_url ||
    author?.avatarUrl ||
    (login !== "unknown"
      ? `https://github.com/${login.replace("[bot]", "")}.png?size=32`
      : undefined);
  return { login, avatarUrl };
}
