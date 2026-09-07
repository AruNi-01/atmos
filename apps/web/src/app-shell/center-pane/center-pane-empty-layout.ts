/**
 * Empty-pane launcher layout — derived from the pane's current box.
 *
 * At most two tiles per row. Use a compact centered 2-col grid when the pane
 * is wide enough; otherwise a one-column list. Extra rows wrap and scroll.
 */

export type EmptyPaneLauncherMode = "list" | "grid";

export type EmptyPaneLauncherPlan = {
  mode: EmptyPaneLauncherMode;
  columns: number;
  paddingX: number;
  paddingY: number;
  gap: number;
  iconSize: number;
  cardMinHeight: number;
  cardPaddingY: number;
  gridMaxWidth: number;
  scroll: boolean;
};

/** `py-2` + `text-sm` list row. */
export const EMPTY_PANE_LIST_ROW_HEIGHT_PX = 36;
export const EMPTY_PANE_LIST_GAP_PX = 4;
export const EMPTY_PANE_LIST_MAX_WIDTH_PX = 384;

/** Smallest readable icon-over-name tile (label + padding). */
export const EMPTY_PANE_MIN_CARD_WIDTH_PX = 112;
/** Compact tile width for the centered 2-col cluster. */
export const EMPTY_PANE_PREFERRED_CARD_WIDTH_PX = 168;
/** One row never has more than two actions. */
export const EMPTY_PANE_MAX_COLUMNS = 2;
export const EMPTY_PANE_MIN_CARD_HEIGHT_PX = 72;
export const EMPTY_PANE_MAX_CARD_HEIGHT_PX = 96;
export const EMPTY_PANE_GRID_COLUMN_GAP_PX = 8;
export const EMPTY_PANE_GRID_ROW_GAP_PX = 8;
export const EMPTY_PANE_GRID_GAP_PX = EMPTY_PANE_GRID_ROW_GAP_PX;
export const EMPTY_PANE_MIN_PADDING_PX = 8;
export const EMPTY_PANE_MAX_PADDING_X_PX = 24;
export const EMPTY_PANE_MAX_LIST_PADDING_Y_PX = 32;
export const EMPTY_PANE_MAX_GRID_PADDING_Y_PX = 16;

export const UNMEASURED_EMPTY_PANE_LAUNCHER_PLAN: EmptyPaneLauncherPlan = {
  mode: "list",
  columns: 1,
  paddingX: 24,
  paddingY: 32,
  gap: EMPTY_PANE_LIST_GAP_PX,
  iconSize: 16,
  cardMinHeight: EMPTY_PANE_LIST_ROW_HEIGHT_PX,
  cardPaddingY: 8,
  gridMaxWidth: EMPTY_PANE_LIST_MAX_WIDTH_PX,
  scroll: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function emptyPaneListBlockHeightPx(
  itemCount: number,
  paddingY: number,
): number {
  if (itemCount <= 0) return paddingY * 2;
  return (
    paddingY * 2 +
    itemCount * EMPTY_PANE_LIST_ROW_HEIGHT_PX +
    (itemCount - 1) * EMPTY_PANE_LIST_GAP_PX
  );
}

export function emptyPaneColumnsFit(
  availableWidth: number,
  actionCount: number,
): number {
  if (actionCount <= 0) return 1;
  const raw = Math.floor(
    (availableWidth + EMPTY_PANE_GRID_COLUMN_GAP_PX) /
      (EMPTY_PANE_MIN_CARD_WIDTH_PX + EMPTY_PANE_GRID_COLUMN_GAP_PX),
  );
  return clamp(raw, 1, actionCount);
}

function listPaddingY(height: number): number {
  return clamp(
    Math.round(height * 0.05),
    EMPTY_PANE_MIN_PADDING_PX,
    EMPTY_PANE_MAX_LIST_PADDING_Y_PX,
  );
}

function gridPaddingY(height: number): number {
  return clamp(
    Math.round(height * 0.04),
    EMPTY_PANE_MIN_PADDING_PX,
    EMPTY_PANE_MAX_GRID_PADDING_Y_PX,
  );
}

function paddingX(width: number): number {
  return clamp(
    Math.round(width * 0.04),
    EMPTY_PANE_MIN_PADDING_PX,
    EMPTY_PANE_MAX_PADDING_X_PX,
  );
}

function gridRows(itemCount: number, columns: number): number {
  if (itemCount <= 0 || columns <= 0) return 0;
  return Math.ceil(itemCount / columns);
}

/** Close is another grid tile, so an odd action count fills the last-row gap. */
export function emptyPaneGridItemCount(
  actionCount: number,
  hasClose: boolean,
): number {
  return Math.max(0, actionCount) + (hasClose ? 1 : 0);
}

/** At most two columns; one column when the pane is too narrow. */
export function emptyPaneGridColumns(input: {
  actionCount: number;
  columnsFit: number;
}): number {
  const actionCount = Math.max(0, input.actionCount);
  if (actionCount <= 0) return 1;
  return clamp(
    Math.min(input.columnsFit, EMPTY_PANE_MAX_COLUMNS, actionCount),
    1,
    actionCount,
  );
}

function gridBlockHeightPx(input: {
  paddingY: number;
  rows: number;
  cardHeight: number;
  gap: number;
}): number {
  const tiles =
    input.rows * input.cardHeight +
    Math.max(0, input.rows - 1) * input.gap;
  return input.paddingY * 2 + tiles;
}

function cardHeightForRows(input: {
  height: number;
  paddingY: number;
  rows: number;
  gap: number;
}): number {
  if (input.rows <= 0) return EMPTY_PANE_MAX_CARD_HEIGHT_PX;
  const gaps = Math.max(0, input.rows - 1) * input.gap;
  const budget = input.height - input.paddingY * 2 - gaps;
  return clamp(
    Math.floor(budget / input.rows),
    EMPTY_PANE_MIN_CARD_HEIGHT_PX,
    EMPTY_PANE_MAX_CARD_HEIGHT_PX,
  );
}

function listPlan(input: {
  paddingX: number;
  paddingY: number;
  scroll: boolean;
}): EmptyPaneLauncherPlan {
  return {
    mode: "list",
    columns: 1,
    paddingX: input.paddingX,
    paddingY: input.paddingY,
    gap: EMPTY_PANE_LIST_GAP_PX,
    iconSize: 16,
    cardMinHeight: EMPTY_PANE_LIST_ROW_HEIGHT_PX,
    cardPaddingY: 8,
    gridMaxWidth: EMPTY_PANE_LIST_MAX_WIDTH_PX,
    scroll: input.scroll,
  };
}

function gridPlan(input: {
  width: number;
  height: number;
  actionCount: number;
  hasClose: boolean;
  columns: number;
  paddingX: number;
}): EmptyPaneLauncherPlan {
  const itemCount = emptyPaneGridItemCount(input.actionCount, input.hasClose);
  const columns = clamp(input.columns, 1, Math.max(1, itemCount));
  const rows = gridRows(itemCount, columns);
  const padY = gridPaddingY(input.height);
  const gap = EMPTY_PANE_GRID_ROW_GAP_PX;
  const cardMinHeight = cardHeightForRows({
    height: input.height,
    paddingY: padY,
    rows,
    gap,
  });
  const iconSize = clamp(Math.round(cardMinHeight * 0.28), 16, 24);
  const labelBox = 18;
  const iconGap = 6;
  const cardPaddingY = clamp(
    Math.floor((cardMinHeight - iconSize - labelBox - iconGap) / 2),
    6,
    14,
  );
  const block = gridBlockHeightPx({
    paddingY: padY,
    rows,
    cardHeight: cardMinHeight,
    gap,
  });
  const availableWidth = Math.max(0, input.width - input.paddingX * 2);
  const gridMaxWidth = Math.min(
    availableWidth,
    columns * EMPTY_PANE_PREFERRED_CARD_WIDTH_PX +
      Math.max(0, columns - 1) * EMPTY_PANE_GRID_COLUMN_GAP_PX,
  );

  return {
    mode: "grid",
    columns,
    paddingX: input.paddingX,
    paddingY: padY,
    gap,
    iconSize,
    cardMinHeight,
    cardPaddingY,
    gridMaxWidth: Math.max(0, gridMaxWidth),
    scroll: block > input.height,
  };
}

export function planEmptyPaneLauncher(input: {
  width: number;
  height: number;
  actionCount: number;
  hasClose?: boolean;
}): EmptyPaneLauncherPlan {
  const actionCount = input.actionCount;
  const hasClose = Boolean(input.hasClose);
  if (input.width <= 0 || input.height <= 0 || actionCount <= 0) {
    return UNMEASURED_EMPTY_PANE_LAUNCHER_PLAN;
  }

  const padX = paddingX(input.width);
  const listPadY = listPaddingY(input.height);
  const listCount = emptyPaneGridItemCount(actionCount, hasClose);
  const listFits =
    emptyPaneListBlockHeightPx(listCount, listPadY) <= input.height;
  const availableWidth = Math.max(0, input.width - padX * 2);
  const columnsFit = emptyPaneColumnsFit(availableWidth, listCount);

  const toGrid = (columns: number) =>
    gridPlan({
      width: input.width,
      height: input.height,
      actionCount,
      hasClose,
      columns,
      paddingX: padX,
    });

  if (columnsFit >= 2) {
    return toGrid(
      emptyPaneGridColumns({ actionCount: listCount, columnsFit }),
    );
  }

  if (listFits) {
    return listPlan({ paddingX: padX, paddingY: listPadY, scroll: false });
  }

  return toGrid(1);
}

export function emptyPaneLauncherPlansEqual(
  a: EmptyPaneLauncherPlan,
  b: EmptyPaneLauncherPlan,
): boolean {
  return (
    a.mode === b.mode &&
    a.columns === b.columns &&
    a.paddingX === b.paddingX &&
    a.paddingY === b.paddingY &&
    a.gap === b.gap &&
    a.iconSize === b.iconSize &&
    a.cardMinHeight === b.cardMinHeight &&
    a.cardPaddingY === b.cardPaddingY &&
    a.gridMaxWidth === b.gridMaxWidth &&
    a.scroll === b.scroll
  );
}
