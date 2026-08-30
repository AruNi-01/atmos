import type { MentionFileCandidate } from "@/features/welcome/lib/welcome-page-helpers";

/** Max rows returned for the composer `@` mention popover (keeps keyboard nav cheap). */
export const MENTION_FILE_RESULT_LIMIT = 100;

/**
 * When many exact/prefix hits exist, still keep this many slots for suffix/mid
 * contains matches so `*query*` never looks prefix-only under the result cap.
 */
export const MENTION_CONTAINS_RESERVE = 3;

/** Case-insensitive substring split for UI highlight. */
export type HighlightPart = { text: string; match: boolean };

/**
 * Split `text` so every occurrence of `query` (case-insensitive) is a match
 * part. Empty query returns the whole string as a non-match.
 */
export function splitHighlightParts(text: string, rawQuery: string): HighlightPart[] {
  const query = rawQuery.trim();
  if (!query) return [{ text, match: false }];

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: HighlightPart[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const index = lowerText.indexOf(lowerQuery, cursor);
    if (index < 0) {
      parts.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (index > cursor) {
      parts.push({ text: text.slice(cursor, index), match: false });
    }
    parts.push({ text: text.slice(index, index + query.length), match: true });
    cursor = index + query.length;
  }

  return parts.length > 0 ? parts : [{ text, match: false }];
}

type RankedMentionFile = MentionFileCandidate & {
  /** Lower is better. */
  score: number;
  matchIndex: number;
};

/** Scores below this are exact or prefix (see `rankNameMatch`). */
const PREFIX_OR_EXACT_SCORE_MAX = 15;

/**
 * Score a name against a lowercase query.
 * Matching is case-insensitive **contains** (`*query*`) — left and right of the
 * keyword may be anything. Prefix / exact only affect ranking, not eligibility.
 */
function rankNameMatch(name: string, queryLower: string): RankedMentionFile["score"] | null {
  const lower = name.toLowerCase();
  const matchIndex = lower.indexOf(queryLower);
  if (matchIndex < 0) return null;

  // Exact name (ignoring common single extension) ranks highest.
  if (lower === queryLower) return 0;
  const dot = lower.lastIndexOf(".");
  if (dot > 0 && lower.slice(0, dot) === queryLower) return 1;

  // Prefix match — still contains, just better rank.
  if (matchIndex === 0) return 10 + name.length * 0.001;

  // Suffix match (…query or …query.ext)
  if (lower.endsWith(queryLower)) return 20 + matchIndex * 0.01;
  if (dot > matchIndex && lower.slice(0, dot).endsWith(queryLower)) {
    return 21 + matchIndex * 0.01;
  }

  // Mid-string contains — left and right both free (`*query*`).
  return 30 + matchIndex * 0.01 + name.length * 0.0001;
}

function mentionListingBucket(item: MentionFileCandidate) {
  return item.isHidden ? 2 : item.isDir ? 1 : 0;
}

function sortMentionListing(items: MentionFileCandidate[]): MentionFileCandidate[] {
  return [...items].sort((a, b) => {
    const bucketDiff = mentionListingBucket(a) - mentionListingBucket(b);
    if (bucketDiff !== 0) return bucketDiff;
    return a.relativePath.localeCompare(b.relativePath);
  });
}

function sortRankedMentionFiles(items: RankedMentionFile[]) {
  return [...items].sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;

    const bucketDiff = mentionListingBucket(a) - mentionListingBucket(b);
    if (bucketDiff !== 0) return bucketDiff;

    return a.relativePath.localeCompare(b.relativePath);
  });
}

/**
 * First-level files and folders under `directoryPrefix`.
 * Empty prefix = project/workspace root. `pages/` = entries one segment deeper.
 */
function firstLevelUnderPrefix(
  entries: MentionFileCandidate[],
  directoryPrefix: string,
): MentionFileCandidate[] {
  const lowerPrefix = directoryPrefix.toLowerCase();
  const prefixLen = directoryPrefix.length;
  return entries.filter((item) => {
    if (prefixLen === 0) return !item.relativePath.includes("/");
    const lowerPath = item.relativePath.toLowerCase();
    if (!lowerPath.startsWith(lowerPrefix)) return false;
    const rest = item.relativePath.slice(prefixLen);
    return rest.length > 0 && !rest.includes("/");
  });
}

function takeMentionListing(
  entries: MentionFileCandidate[],
  directoryPrefix: string,
): MentionFileCandidate[] {
  return sortMentionListing(firstLevelUnderPrefix(entries, directoryPrefix)).slice(
    0,
    MENTION_FILE_RESULT_LIMIT,
  );
}

/** Empty `@` or a trailing `dir/` prefix should list immediately (no debounce). */
export function isImmediateMentionListingQuery(rawQuery: string): boolean {
  const query = rawQuery.trim().replace(/\\/g, "/");
  if (!query) return true;
  const slashIndex = query.lastIndexOf("/");
  return slashIndex >= 0 && query.slice(slashIndex + 1).trim().length === 0;
}

function stripRank(item: RankedMentionFile): MentionFileCandidate {
  const { score: _score, matchIndex: _matchIndex, ...rest } = item;
  return rest;
}

/**
 * Cap ranked results while preserving left/right contains hits.
 *
 * A naive `sort + slice(limit)` with prefix-first scoring drops every mid-string
 * match once prefix hits fill the cap (the daily-quality regression). Reserve a
 * few slots for suffix/mid so `*query*` stays visible under the budget.
 */
function takeMentionResults(ranked: RankedMentionFile[]): MentionFileCandidate[] {
  const sorted = sortRankedMentionFiles(ranked);
  if (sorted.length <= MENTION_FILE_RESULT_LIMIT) {
    return sorted.map(stripRank);
  }

  const preferred = sorted.filter((item) => item.score < PREFIX_OR_EXACT_SCORE_MAX);
  const contains = sorted.filter((item) => item.score >= PREFIX_OR_EXACT_SCORE_MAX);

  if (contains.length === 0) {
    return preferred.slice(0, MENTION_FILE_RESULT_LIMIT).map(stripRank);
  }

  const reservedForContains = Math.min(MENTION_CONTAINS_RESERVE, contains.length);
  const preferredTake = Math.min(
    preferred.length,
    MENTION_FILE_RESULT_LIMIT - reservedForContains,
  );
  const containsTake = Math.min(
    contains.length,
    MENTION_FILE_RESULT_LIMIT - preferredTake,
  );

  // Keep display order: exact/prefix first, then best contains.
  return [
    ...preferred.slice(0, preferredTake),
    ...contains.slice(0, containsTake),
  ].map(stripRank);
}

/**
 * Filter project file/folder candidates for the composer `@` mention popover.
 *
 * Matching rules:
 * - Empty query lists the **first-level** files and folders of the current
 *   project/workspace (both files and directories).
 * - Only the file/folder **name** is searched (not the full relative path).
 * - Case-insensitive **contains** match (`*keyword*`) — characters on either
 *   side of the keyword are allowed; prefix is not required.
 * - Hidden files/folders (names starting with `.`) are included when present
 *   in the candidate list (caller loads the tree with `showHidden: true`).
 * - A trailing path prefix (`dir/`) lists first-level files and folders under
 *   that directory; a name after the last `/` is matched against descendants.
 * - Results are capped at {@link MENTION_FILE_RESULT_LIMIT}, with a few slots
 *   reserved for non-prefix contains hits so ranking does not look prefix-only.
 */
export function filterMentionFileCandidates(
  entries: MentionFileCandidate[],
  rawQuery: string,
): MentionFileCandidate[] {
  const query = rawQuery.trim().replace(/\\/g, "/");
  if (!query) return takeMentionListing(entries, "");

  let searchEntries = entries;
  let searchQuery = query;
  const slashIndex = query.lastIndexOf("/");
  if (slashIndex >= 0) {
    const directoryPrefix = query.slice(0, slashIndex + 1);
    const lowerDirectoryPrefix = directoryPrefix.toLowerCase();
    searchEntries = entries.filter((item) => {
      const lowerRelativePath = item.relativePath.toLowerCase();
      return (
        lowerRelativePath.startsWith(lowerDirectoryPrefix) &&
        lowerRelativePath.length > lowerDirectoryPrefix.length
      );
    });
    searchQuery = query.slice(slashIndex + 1).trim();
    if (!searchQuery) {
      return takeMentionListing(entries, directoryPrefix);
    }
  }

  const queryLower = searchQuery.toLowerCase();
  const ranked: RankedMentionFile[] = [];
  for (const item of searchEntries) {
    const score = rankNameMatch(item.name, queryLower);
    if (score === null) continue;
    ranked.push({
      ...item,
      score,
      matchIndex: item.name.toLowerCase().indexOf(queryLower),
    });
  }

  return takeMentionResults(ranked);
}
