export const TERMINAL_DRAG_THRESHOLD_PX = 8;

/** Same cap as the web TUI wheel multiplier (APP-054). */
export const TUI_FINGER_WHEEL_MAX_REPORTS = 12;

export type FingerScrollTarget = "application" | "local";

/**
 * opencode / group and other mouse-tracking TUIs scroll by wheel reports.
 * Alt-screen apps without tracking (vim) use xterm's wheel-to-arrow path.
 * An idle shell keeps xterm's own scrollback.
 */
export function fingerScrollTarget(input: {
  bufferType: string;
  mouseTrackingMode: string;
}): FingerScrollTarget {
  if (input.mouseTrackingMode !== "none" || input.bufferType === "alternate") return "application";
  return "local";
}

/**
 * Finger distance already converted to whole rows.
 * Positive `lines` is a downward drag, which looks at earlier content (wheel up).
 */
export function fingerWheelReports(
  lines: number,
  maxReports = TUI_FINGER_WHEEL_MAX_REPORTS,
): { appliedLines: number; count: number; deltaY: -1 | 1 } | null {
  if (lines === 0) return null;
  const appliedLines = Math.max(-maxReports, Math.min(maxReports, lines));
  return {
    appliedLines,
    count: Math.abs(appliedLines),
    deltaY: appliedLines > 0 ? -1 : 1,
  };
}

/** Toolbar sits on the handle last dragged, falling back to the other end. */
export function selectionToolbarHandle<T>(
  start: T | null,
  end: T | null,
  edge: "start" | "end",
): T | null {
  return edge === "end" ? end ?? start : start ?? end;
}

export function pointerMovedFarEnough(dx: number, dy: number, threshold = TERMINAL_DRAG_THRESHOLD_PX): boolean {
  return dx * dx + dy * dy >= threshold * threshold;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Viewport cell under a point, as `[column, bufferRow]`. */
export function terminalCellFromPoint(input: {
  cellHeight: number;
  cellWidth: number;
  clientX: number;
  clientY: number;
  cols: number;
  originX: number;
  originY: number;
  rows: number;
  viewportY: number;
}): [number, number] | null {
  if (input.cellWidth <= 0 || input.cellHeight <= 0 || input.cols <= 0 || input.rows <= 0) return null;
  const col = clamp(Math.floor((input.clientX - input.originX) / input.cellWidth), 0, input.cols - 1);
  const row = clamp(Math.floor((input.clientY - input.originY) / input.cellHeight), 0, input.rows - 1);
  return [col, row + input.viewportY];
}

/**
 * xterm treats the end column as exclusive. Extend it by one so the cell under
 * the finger is included, including a drag that stays inside a single cell.
 */
export function terminalSelectionEnd(
  start: [number, number],
  end: [number, number],
  cols: number,
): [number, number] {
  const forward = end[1] > start[1] || (end[1] === start[1] && end[0] >= start[0]);
  if (!forward) return end;
  return [Math.min(cols, end[0] + 1), end[1]];
}

const WORD_CHAR = /[\w@./\\:+~-]/;

/** Column span of the word under `column`. `end` is exclusive. */
export function wordSpanInLine(line: string, column: number): { start: number; end: number } {
  if (!line.length) return { start: Math.max(0, column), end: Math.max(0, column) + 1 };
  const index = Math.max(0, Math.min(column, line.length - 1));
  const char = line[index] ?? "";
  if (!WORD_CHAR.test(char)) return { start: index, end: index + 1 };
  let start = index;
  let end = index + 1;
  while (start > 0 && WORD_CHAR.test(line[start - 1] ?? "")) start -= 1;
  while (end < line.length && WORD_CHAR.test(line[end] ?? "")) end += 1;
  return { start, end };
}
