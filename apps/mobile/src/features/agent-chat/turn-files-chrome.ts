/**
 * Web `AssistantTurnFileChanges`: `rounded-xl`, `border-border`, `bg-muted/40`.
 * `--radius` is 10px, so `rounded-xl` is 14px.
 * `--muted` is `oklch(0.9 0.004 286)` / `oklch(0.274 0.006 286.033)`, at 40%.
 * `--border` is black or white at 10%.
 */
export const TURN_FILES_RADIUS = 14;
export const TURN_FILES_FILL_LIGHT = "rgba(222, 222, 224, 0.4)";
export const TURN_FILES_FILL_DARK = "rgba(39, 39, 42, 0.4)";
export const TURN_FILES_BORDER_LIGHT = "rgba(0, 0, 0, 0.1)";
export const TURN_FILES_BORDER_DARK = "rgba(255, 255, 255, 0.1)";
/** Web file card `mt-3` (12). The assistant column does not add a second gap. */
export const TURN_FILES_MARGIN_TOP = 12;

export function turnFilesFill(isDark: boolean): string {
  return isDark ? TURN_FILES_FILL_DARK : TURN_FILES_FILL_LIGHT;
}

export function turnFilesBorder(isDark: boolean): string {
  return isDark ? TURN_FILES_BORDER_DARK : TURN_FILES_BORDER_LIGHT;
}
