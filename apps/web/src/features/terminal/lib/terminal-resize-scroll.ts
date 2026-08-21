/**
 * Scroll + row helpers for terminal resize.
 *
 * Width changes reflow wrapped lines, so a row-distance-from-bottom is not a
 * stable viewport. Pin the first visible line with a marker instead. When the
 * user was following output, stay on the bottom after the shell redraws the
 * prompt (often one extra wrapped line).
 */

export const XTERM_NEAR_BOTTOM_SLACK = 1;

export type XtermResizeScrollSnapshot =
  | { kind: "follow" }
  | { kind: "marker"; marker: XtermScrollMarker }
  | { kind: "offset"; distanceFromBottom: number };

export type XtermScrollMarker = {
  line: number;
  isDisposed?: boolean;
  dispose: () => void;
};

export type XtermScrollBuffer = {
  viewportY: number;
  baseY: number;
  cursorY: number;
};

export function isXtermNearBottom(
  viewportY: number,
  baseY: number,
  slack: number = XTERM_NEAR_BOTTOM_SLACK,
): boolean {
  return viewportY >= baseY - Math.max(0, slack);
}

export function clampProposedTerminalRows(
  rows: number,
  availableHeight: number,
  cellHeight: number,
): number {
  if (!Number.isFinite(rows) || rows < 1) return 1;
  if (!(cellHeight > 0) || !(availableHeight > 0)) return Math.max(1, Math.floor(rows));
  // Renderer cells can be a device-pixel taller than the metric FitAddon used,
  // which clips the last prompt row. Keep one extra pixel of slack.
  if (rows * cellHeight <= availableHeight - 1) return Math.floor(rows);
  return Math.max(1, Math.floor((availableHeight - 1) / cellHeight));
}

export function captureXtermResizeScroll(term: {
  buffer: { active: XtermScrollBuffer };
  registerMarker?: (cursorYOffset?: number) => XtermScrollMarker | undefined;
}): XtermResizeScrollSnapshot {
  const buf = term.buffer.active;
  if (isXtermNearBottom(buf.viewportY, buf.baseY)) {
    return { kind: "follow" };
  }
  const cursorAbs = buf.baseY + buf.cursorY;
  const marker = term.registerMarker?.(buf.viewportY - cursorAbs);
  if (marker) return { kind: "marker", marker };
  return {
    kind: "offset",
    distanceFromBottom: Math.max(0, buf.baseY - buf.viewportY),
  };
}

export function restoreXtermResizeScroll(
  term: {
    buffer: { active: Pick<XtermScrollBuffer, "baseY"> };
    scrollToLine: (line: number) => void;
  },
  snapshot: XtermResizeScrollSnapshot,
  jumpToBottom: () => void,
): boolean {
  if (snapshot.kind === "follow") {
    jumpToBottom();
    return true;
  }
  if (snapshot.kind === "marker") {
    const { marker } = snapshot;
    const line = !marker.isDisposed && marker.line >= 0 ? marker.line : -1;
    marker.dispose();
    if (line < 0) return false;
    term.scrollToLine(line);
    return false;
  }
  term.scrollToLine(Math.max(0, term.buffer.active.baseY - snapshot.distanceFromBottom));
  return false;
}
