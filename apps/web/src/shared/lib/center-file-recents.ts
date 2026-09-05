export const CENTER_FILE_RECENTS_LIMIT = 8;

export type CenterFileRecent = {
  path: string;
  name: string;
  openedAt: number;
};

export function fileRecentsEqual(
  left: readonly CenterFileRecent[],
  right: readonly CenterFileRecent[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (item, index) =>
      item.path === right[index]?.path &&
      item.name === right[index]?.name &&
      item.openedAt === right[index]?.openedAt,
  );
}

export function upsertFileRecents(
  current: readonly CenterFileRecent[],
  incoming: readonly CenterFileRecent[],
  limit: number = CENTER_FILE_RECENTS_LIMIT,
): CenterFileRecent[] {
  const byPath = new Map<string, CenterFileRecent>();
  for (const item of current) {
    byPath.set(item.path, item);
  }
  for (const item of incoming) {
    const existing = byPath.get(item.path);
    if (!existing || item.openedAt >= existing.openedAt) {
      byPath.set(item.path, item);
    }
  }
  return [...byPath.values()]
    .sort((left, right) => right.openedAt - left.openedAt || left.path.localeCompare(right.path))
    .slice(0, limit);
}
