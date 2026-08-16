export const GIT_HISTORY_ROW_OVERSCAN = 12;

export function visibleGitHistoryRowRange(
  scrollTop: number,
  viewportHeight: number,
  rowCount: number,
  rowHeight: number,
  overscan = GIT_HISTORY_ROW_OVERSCAN,
): { start: number; end: number } {
  if (rowCount <= 0 || rowHeight <= 0) return { start: 0, end: 0 };
  const safeHeight = Math.max(viewportHeight, rowHeight);
  const start = Math.min(
    rowCount,
    Math.max(0, Math.floor(Math.max(0, scrollTop) / rowHeight) - overscan),
  );
  const end = Math.min(
    rowCount,
    Math.max(
      start,
      Math.ceil((Math.max(0, scrollTop) + safeHeight) / rowHeight) + overscan,
    ),
  );
  return { start, end };
}

export function gitHistoryRowScrollTop(
  index: number,
  rowHeight: number,
  viewportHeight: number,
): number {
  return Math.max(0, index * rowHeight - Math.max(0, viewportHeight - rowHeight) / 2);
}
