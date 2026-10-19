import { COMPOSER_GLASS_CONTROL_SIZE } from "./composer-glass";

export const COMPOSER_LINE_HEIGHT = 22;
export const COMPOSER_MAX_LINES = 6;
export const COMPOSER_DOCK_EXPAND_MS = 280;
export const COMPOSER_TOOLBAR_INSET = 8;
/** Matches the pre-23964b7 compact dock (`BUTTON_SIZE + EDGE_INSET * 2`). */
export const COMPOSER_DOCK_COMPACT_HEIGHT =
  COMPOSER_GLASS_CONTROL_SIZE + COMPOSER_TOOLBAR_INSET * 2;
export const COMPOSER_COMPACT_PAD_HORIZONTAL = 60;
export const COMPOSER_COMPACT_PAD_VERTICAL =
  (COMPOSER_DOCK_COMPACT_HEIGHT - COMPOSER_LINE_HEIGHT) / 2;
export const COMPOSER_EXPANDED_PAD_TOP = 14;
export const COMPOSER_EXPANDED_PAD_HORIZONTAL = 16;
export const COMPOSER_EXPANDED_PAD_BOTTOM =
  COMPOSER_TOOLBAR_INSET + COMPOSER_GLASS_CONTROL_SIZE + COMPOSER_TOOLBAR_INSET;

export function composerDockCompactInnerWidth(dockWidth: number): number {
  return Math.max(0, dockWidth - COMPOSER_COMPACT_PAD_HORIZONTAL * 2);
}

/** Lines at the compact inner width. Never uses the expanded field width. */
export function composerDockCompactLineCount(input: {
  measuredLines: number;
  text: string;
}): number {
  if (input.text.length === 0) return 1;
  return Math.max(1, input.measuredLines);
}

export function composerDockExpanded(input: {
  addOpen?: boolean;
  compactLineCount: number;
  focused: boolean;
  modelsOpen?: boolean;
  showQueue?: boolean;
  showSteer?: boolean;
  text: string;
}): boolean {
  if (
    input.focused ||
    input.modelsOpen === true ||
    input.addOpen === true ||
    input.showQueue === true ||
    input.showSteer === true
  ) {
    return true;
  }
  if (input.text.includes("\n")) return true;
  return input.compactLineCount >= 2;
}

export function composerDockLineHeight(text: string): number {
  if (text.length === 0) return COMPOSER_LINE_HEIGHT;
  return Math.min(text.split("\n").length, COMPOSER_MAX_LINES) * COMPOSER_LINE_HEIGHT;
}

/**
 * Field height in the expanded dock. Newlines are a floor so Enter can grow
 * the box even if `onContentSizeChange` is still reporting the compact line.
 * Soft-wrap uses `measured` once the input is allowed to lay out past one line.
 */
export function composerDockContentHeight(text: string, measured: number): number {
  if (text.length === 0) return COMPOSER_LINE_HEIGHT;
  return Math.min(
    Math.max(measured, composerDockLineHeight(text), COMPOSER_LINE_HEIGHT),
    COMPOSER_LINE_HEIGHT * COMPOSER_MAX_LINES,
  );
}

export function composerDockFieldHeight(input: {
  expanded: boolean;
  measuredHeight: number;
  text: string;
}): number {
  if (!input.expanded) return COMPOSER_LINE_HEIGHT;
  return composerDockContentHeight(input.text, input.measuredHeight);
}

export function composerDockMinHeight(input: { expanded: boolean; contentHeight: number }): number {
  if (!input.expanded) return COMPOSER_DOCK_COMPACT_HEIGHT;
  const text = Math.min(
    Math.max(input.contentHeight, COMPOSER_LINE_HEIGHT),
    COMPOSER_LINE_HEIGHT * COMPOSER_MAX_LINES,
  );
  return COMPOSER_EXPANDED_PAD_TOP + text + COMPOSER_EXPANDED_PAD_BOTTOM;
}

export const COMPOSER_DOCK_EXPANDED_MAX_HEIGHT = composerDockMinHeight({
  contentHeight: COMPOSER_LINE_HEIGHT * COMPOSER_MAX_LINES,
  expanded: true,
});

export function composerDockInputPadding(expanded: boolean): {
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
} {
  if (!expanded) {
    return {
      paddingBottom: COMPOSER_COMPACT_PAD_VERTICAL,
      paddingLeft: COMPOSER_COMPACT_PAD_HORIZONTAL,
      paddingRight: COMPOSER_COMPACT_PAD_HORIZONTAL,
      paddingTop: COMPOSER_COMPACT_PAD_VERTICAL,
    };
  }
  return {
    paddingBottom: COMPOSER_EXPANDED_PAD_BOTTOM,
    paddingLeft: COMPOSER_EXPANDED_PAD_HORIZONTAL,
    paddingRight: COMPOSER_EXPANDED_PAD_HORIZONTAL,
    paddingTop: COMPOSER_EXPANDED_PAD_TOP,
  };
}

export function composerDockMotionDuration(input: {
  expandedChanged: boolean;
  reduceMotion: boolean;
}): number {
  if (input.reduceMotion || !input.expandedChanged) return 0;
  return COMPOSER_DOCK_EXPAND_MS;
}
