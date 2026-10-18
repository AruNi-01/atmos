import { COMPOSER_GLASS_CONTROL_SIZE } from "./composer-glass";

/** Matches the pre-23964b7 compact dock (`BUTTON_SIZE + EDGE_INSET * 2`). */
export const COMPOSER_LINE_HEIGHT = 22;
export const COMPOSER_MAX_LINES = 6;
export const COMPOSER_DOCK_EXPAND_MS = 280;
export const COMPOSER_TOOLBAR_INSET = 8;
export const COMPOSER_DOCK_COMPACT_HEIGHT =
  COMPOSER_GLASS_CONTROL_SIZE + COMPOSER_TOOLBAR_INSET * 2;
export const COMPOSER_COMPACT_PAD_HORIZONTAL = 60;
export const COMPOSER_COMPACT_PAD_VERTICAL =
  (COMPOSER_DOCK_COMPACT_HEIGHT - COMPOSER_LINE_HEIGHT) / 2;
export const COMPOSER_EXPANDED_PAD_TOP = 14;
export const COMPOSER_EXPANDED_PAD_HORIZONTAL = 16;
export const COMPOSER_EXPANDED_PAD_BOTTOM =
  COMPOSER_TOOLBAR_INSET + COMPOSER_GLASS_CONTROL_SIZE + COMPOSER_TOOLBAR_INSET;
/** Same 1.7-line threshold `23964b7` used to treat wrapped text as stacked. */
export const COMPOSER_MULTILINE_HEIGHT_RATIO = 1.7;

export function composerDockExpanded(input: {
  focused: boolean;
  text: string;
  contentHeight: number;
  modelsOpen?: boolean;
  showQueue?: boolean;
  showSteer?: boolean;
}): boolean {
  if (
    input.focused ||
    input.modelsOpen === true ||
    input.showQueue === true ||
    input.showSteer === true
  ) {
    return true;
  }
  if (input.text.includes("\n")) return true;
  return input.contentHeight > COMPOSER_LINE_HEIGHT * COMPOSER_MULTILINE_HEIGHT_RATIO;
}

export function composerDockMinHeight(input: { expanded: boolean; contentHeight: number }): number {
  if (!input.expanded) return COMPOSER_DOCK_COMPACT_HEIGHT;
  const text = Math.min(
    Math.max(input.contentHeight, COMPOSER_LINE_HEIGHT),
    COMPOSER_LINE_HEIGHT * COMPOSER_MAX_LINES,
  );
  return COMPOSER_EXPANDED_PAD_TOP + text + COMPOSER_EXPANDED_PAD_BOTTOM;
}

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
