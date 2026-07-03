import Fuse from "fuse.js";

import type { MentionFileCandidate } from "@/features/welcome/lib/welcome-page-helpers";

const MENTION_FILE_FUSE_OPTIONS = {
  keys: [
    { name: "name", weight: 0.68 },
    { name: "relativePath", weight: 0.32 },
  ],
  threshold: 0.32,
  ignoreLocation: true,
};

function sortMentionFileCandidates(items: MentionFileCandidate[]) {
  return [...items].sort((a, b) => {
    const bucket = (item: MentionFileCandidate) =>
      item.isHidden ? 2 : item.isDir ? 1 : 0;
    const bucketDiff = bucket(a) - bucket(b);
    if (bucketDiff !== 0) return bucketDiff;
    return a.relativePath.localeCompare(b.relativePath);
  });
}

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
    if (!searchQuery) return sortMentionFileCandidates(searchEntries).slice(0, 12);
  }

  const fuse = new Fuse(searchEntries, MENTION_FILE_FUSE_OPTIONS);
  return sortMentionFileCandidates(
    fuse.search(searchQuery, { limit: 60 }).map((r) => r.item),
  ).slice(0, 12);
}
