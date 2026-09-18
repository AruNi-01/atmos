/** Cap above-composer overlay cards and the detail overlay at 80% of the column. */
export const SUBAGENT_OVERLAY_MAX_RATIO = 0.8;
/** Keep a small gap under the column top so the close control stays reachable. */
export const SUBAGENT_OVERLAY_TOP_GAP_PX = 8;
export const OVERLAY_CARD_MAX_HEIGHT_VAR = "--agent-overlay-card-max-height";
export const OVERLAY_CARD_MAX_HEIGHT_CLASS =
  "max-h-[var(--agent-overlay-card-max-height,80cqh)]";

/** Frame height for overlay cards / subagent detail above the composer. */
export function subagentOverlayFrameHeight(
  columnHeight: number,
  composerHeight: number,
): number {
  if (columnHeight <= 0) return 0;
  const byRatio = columnHeight * SUBAGENT_OVERLAY_MAX_RATIO;
  const byTopGap = columnHeight - composerHeight - SUBAGENT_OVERLAY_TOP_GAP_PX;
  return Math.max(0, Math.min(byRatio, byTopGap));
}
