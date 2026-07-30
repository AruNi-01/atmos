import type { MentionFileCandidate } from "@/features/welcome/lib/welcome-page-helpers";

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

function sortRankedMentionFiles(items: RankedMentionFile[]) {
  return [...items].sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;

    const bucket = (item: MentionFileCandidate) =>
      item.isHidden ? 2 : item.isDir ? 1 : 0;
    const bucketDiff = bucket(a) - bucket(b);
    if (bucketDiff !== 0) return bucketDiff;

    return a.relativePath.localeCompare(b.relativePath);
  });
}

/**
 * Filter project file/folder candidates for the composer `@` mention popover.
 *
 * Matching rules:
 * - Only the file/folder **name** is searched (not the full relative path).
 * - Case-insensitive **contains** match (`*keyword*`) — characters on either
 *   side of the keyword are allowed; prefix is not required.
 * - Hidden files/folders (names starting with `.`) are included when present
 *   in the candidate list (caller loads the tree with `showHidden: true`).
 * - A trailing path prefix (`dir/`) still scopes results under that directory;
 *   the segment after the last `/` is matched against names only.
 */
export function filterMentionFileCandidates(
  entries: MentionFileCandidate[],
  rawQuery: string,
): MentionFileCandidate[] {
  const query = rawQuery.trim().replace(/\\/g, "/");
  if (!query) return [];

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
      return [...searchEntries].sort((a, b) => {
        const bucket = (item: MentionFileCandidate) =>
          item.isHidden ? 2 : item.isDir ? 1 : 0;
        const bucketDiff = bucket(a) - bucket(b);
        if (bucketDiff !== 0) return bucketDiff;
        return a.relativePath.localeCompare(b.relativePath);
      });
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

  return sortRankedMentionFiles(ranked).map(
    ({ score: _score, matchIndex: _matchIndex, ...item }) => item,
  );
}
