import type { GitHistoryCommit } from "@/api/ws-api-types";

/** Zed treats 7–40 hex chars as a SHA prefix query, not a message grep. */
export function isGitHistoryHashQuery(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length >= 7 && trimmed.length <= 40 && /^[0-9a-fA-F]+$/.test(trimmed);
}

function includesText(haystack: string, needle: string, caseSensitive: boolean): boolean {
  if (!needle) return false;
  if (caseSensitive) return haystack.includes(needle);
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

export function gitHistoryCommitMatches(
  commit: Pick<
    GitHistoryCommit,
    "hash" | "short_hash" | "subject" | "author_name" | "author_email" | "refs"
  >,
  rawQuery: string,
  caseSensitive: boolean,
): boolean {
  const query = rawQuery.trim();
  if (!query) return false;
  if (isGitHistoryHashQuery(query)) {
    return commit.hash.toLocaleLowerCase().startsWith(query.toLocaleLowerCase());
  }
  if (includesText(commit.subject, query, caseSensitive)) return true;
  if (includesText(commit.author_name, query, caseSensitive)) return true;
  if (includesText(commit.author_email, query, caseSensitive)) return true;
  if (includesText(commit.hash, query, caseSensitive)) return true;
  if (includesText(commit.short_hash, query, caseSensitive)) return true;
  return commit.refs.some((reference) => includesText(reference.label, query, caseSensitive));
}

export function collectGitHistoryMatchIndexes(
  commits: readonly Pick<
    GitHistoryCommit,
    "hash" | "short_hash" | "subject" | "author_name" | "author_email" | "refs"
  >[],
  query: string,
  caseSensitive: boolean,
): number[] {
  if (!query.trim()) return [];
  const indexes: number[] = [];
  for (let index = 0; index < commits.length; index++) {
    const commit = commits[index];
    if (commit && gitHistoryCommitMatches(commit, query, caseSensitive)) {
      indexes.push(index);
    }
  }
  return indexes;
}

export function splitHighlightedText(
  text: string,
  rawQuery: string,
  caseSensitive: boolean,
): { text: string; match: boolean }[] {
  const needle = rawQuery.trim();
  if (!needle || !text) return [{ text, match: false }];
  const flags = caseSensitive ? "g" : "gi";
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(escaped, flags);
  const parts: { text: string; match: boolean }[] = [];
  let lastIndex = 0;
  let match = matcher.exec(text);
  while (match) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), match: false });
    }
    parts.push({ text: match[0], match: true });
    lastIndex = match.index + match[0].length;
    if (match[0].length === 0) break;
    match = matcher.exec(text);
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), match: false });
  }
  return parts.length > 0 ? parts : [{ text, match: false }];
}
