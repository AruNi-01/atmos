/** Cap the detail overlay at 80% of the agent-chat column. */
export const SUBAGENT_OVERLAY_MAX_RATIO = 0.8;
/** Keep a small gap under the column top so the close control stays reachable. */
export const SUBAGENT_OVERLAY_TOP_GAP_PX = 8;

/** Frame height for the subagent detail overlay above the composer. */
export function subagentOverlayFrameHeight(
  columnHeight: number,
  composerHeight: number,
): number {
  if (columnHeight <= 0) return 0;
  const byRatio = columnHeight * SUBAGENT_OVERLAY_MAX_RATIO;
  const byTopGap = columnHeight - composerHeight - SUBAGENT_OVERLAY_TOP_GAP_PX;
  return Math.max(0, Math.min(byRatio, byTopGap));
}
