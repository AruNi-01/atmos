export const HISTORY_COLUMN_IDS = [
  "graph",
  "description",
  "date",
  "author",
  "commit",
] as const;

export type HistoryColumnId = (typeof HISTORY_COLUMN_IDS)[number];

export type HistoryColumnWidths = Record<HistoryColumnId, number>;

export const HISTORY_COLUMN_DEFAULTS: HistoryColumnWidths = {
  graph: 56,
  description: 360,
  date: 132,
  author: 110,
  commit: 96,
};

export const HISTORY_COLUMN_MINS: HistoryColumnWidths = {
  graph: 56,
  description: 160,
  date: 88,
  author: 72,
  commit: 72,
};

export const HISTORY_RESIZE_COLUMNS = [
  "graph",
  "description",
  "date",
  "author",
] as const satisfies readonly HistoryColumnId[];

export function clampHistoryColumnWidth(
  id: HistoryColumnId,
  width: number,
  graphMin = HISTORY_COLUMN_MINS.graph,
): number {
  const min =
    id === "graph" ? Math.max(HISTORY_COLUMN_MINS.graph, graphMin) : HISTORY_COLUMN_MINS[id];
  return Math.max(min, Math.round(width));
}

export function historyTableWidth(widths: HistoryColumnWidths): number {
  return (
    widths.graph +
    widths.description +
    widths.date +
    widths.author +
    widths.commit
  );
}

export function historyGridTemplate(widths: HistoryColumnWidths): string {
  return `${widths.graph}px ${widths.description}px ${widths.date}px ${widths.author}px ${widths.commit}px`;
}

export function historyColumnDividerOffsets(
  widths: HistoryColumnWidths,
): Record<(typeof HISTORY_RESIZE_COLUMNS)[number], number> {
  let offset = 0;
  return HISTORY_RESIZE_COLUMNS.reduce(
    (offsets, id) => {
      offset += widths[id];
      offsets[id] = offset;
      return offsets;
    },
    {} as Record<(typeof HISTORY_RESIZE_COLUMNS)[number], number>,
  );
}

export function applyHistoryColumnResize(
  widths: HistoryColumnWidths,
  id: HistoryColumnId,
  nextWidth: number,
  graphMin = HISTORY_COLUMN_MINS.graph,
): HistoryColumnWidths {
  const next = clampHistoryColumnWidth(id, nextWidth, graphMin);
  if (next === widths[id]) return widths;
  return { ...widths, [id]: next };
}

export function resolveHistoryColumnWidths(
  widths: HistoryColumnWidths,
  options: {
    graphMin: number;
    containerWidth: number;
    descriptionPinned: boolean;
  },
): HistoryColumnWidths {
  const graph = clampHistoryColumnWidth("graph", widths.graph, options.graphMin);
  const date = clampHistoryColumnWidth("date", widths.date);
  const author = clampHistoryColumnWidth("author", widths.author);
  const commit = clampHistoryColumnWidth("commit", widths.commit);
  const description = options.descriptionPinned || options.containerWidth <= 0
    ? clampHistoryColumnWidth("description", widths.description)
    : Math.max(
        HISTORY_COLUMN_MINS.description,
        options.containerWidth - graph - date - author - commit,
      );
  return { graph, description, date, author, commit };
}
