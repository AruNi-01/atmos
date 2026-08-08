/** Geometry + pure helpers for MorphingTabs (no React). */

export const DRAG_THRESHOLD = 5;
/** Dense browser chrome scale of beui defaults (logic unchanged). */
export const TAB_WIDTH = 156;
export const TAB_HEIGHT = 28;
export const TAB_TOP = 2;
export const TAB_RADIUS = 10;
export const RAIL_HEIGHT = 30;
/** 0 = flush with panel edge so first active tab joins square TL (beui inset was 16). */
export const SURFACE_INSET = 0;
export const LIQUID_JOIN = 12;
/** How far the liquid fill dips into the content panel for corner morphs.
 *  Keep small — dense chrome toolbar sits right under the rail. */
export const PANEL_RADIUS = 8;
export const ADD_BUTTON_SIZE = 24;
export const ADD_BUTTON_GAP = 4;
/** Extra scroll room so active-tab liquid ears (bottom L/R) are not clipped by
 *  the scrollport edge — symmetric when the tab is not flush with the strip end. */
export const SCROLL_EDGE_PAD = LIQUID_JOIN + 4;

export function sameOrder(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function moveItem(order: string[], from: number, to: number) {
  if (from === to) return order.slice();
  const next = order.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Panel top edge only (full corner radii) — used when the active tab has
 *  scrolled fully out of the visible strip so the fill is not pinned at an edge. */
export function liquidPanelOnlyPath(surfaceWidth: number) {
  const panelLeft = SURFACE_INSET;
  const panelRight = Math.max(panelLeft + TAB_WIDTH, surfaceWidth - SURFACE_INSET);
  const bottom = RAIL_HEIGHT;
  const r = PANEL_RADIUS;
  return [
    `M${panelLeft} ${bottom + r}`,
    `V${bottom + r}`,
    `Q${panelLeft} ${bottom} ${panelLeft + r} ${bottom}`,
    `H${panelRight - r}`,
    `Q${panelRight} ${bottom} ${panelRight} ${bottom + r}`,
    `V${bottom + r}`,
    "Z",
  ].join(" ");
}

export function liquidTabPath(tabLeft: number, surfaceWidth: number) {
  const panelLeft = SURFACE_INSET;
  const panelRight = Math.max(panelLeft + TAB_WIDTH, surfaceWidth - SURFACE_INSET);
  // Viewport x of the active tab (track left − scroll). Do NOT clamp into the
  // panel — clamping pinned the silhouette at the left/right when scrolling.
  const left = tabLeft;
  const right = left + TAB_WIDTH;
  const top = RAIL_HEIGHT - TAB_HEIGHT;
  const bottom = RAIL_HEIGHT;

  // Fully off-screen → only the content top strip (no stuck edge tab fill).
  if (right < panelLeft || left > panelRight) {
    return liquidPanelOnlyPath(surfaceWidth);
  }

  const leftJoin = Math.max(panelLeft, left - LIQUID_JOIN);
  const rightJoin = Math.min(panelRight, right + LIQUID_JOIN);
  const leftDepth = Math.max(0, Math.min(LIQUID_JOIN, left - leftJoin));
  const rightDepth = Math.max(0, Math.min(LIQUID_JOIN, rightJoin - right));
  const leftControl = leftDepth * 0.55;
  const rightControl = rightDepth * 0.55;
  // Flush with content left only when the tab edge is at/near panelLeft.
  // Scrolled past the left edge → full radius (not square residual).
  const leftPanelRadius =
    left <= panelLeft
      ? Math.min(PANEL_RADIUS, Math.max(0, panelLeft - left))
      : Math.min(PANEL_RADIUS, Math.max(0, leftJoin - panelLeft));
  const rightPanelRadius =
    right >= panelRight
      ? Math.min(PANEL_RADIUS, Math.max(0, right - panelRight))
      : Math.min(PANEL_RADIUS, Math.max(0, panelRight - rightJoin));

  return [
    `M${panelLeft} ${bottom + PANEL_RADIUS}`,
    `V${bottom + leftPanelRadius}`,
    `Q${panelLeft} ${bottom} ${panelLeft + leftPanelRadius} ${bottom}`,
    `H${leftJoin}`,
    `C${leftJoin + leftControl} ${bottom} ${left} ${bottom - leftDepth + leftControl} ${left} ${bottom - leftDepth}`,
    `V${top + TAB_RADIUS}`,
    `Q${left} ${top} ${left + TAB_RADIUS} ${top}`,
    `H${right - TAB_RADIUS}`,
    `Q${right} ${top} ${right} ${top + TAB_RADIUS}`,
    `V${bottom - rightDepth}`,
    `C${right} ${bottom - rightDepth + rightControl} ${rightJoin - rightControl} ${bottom} ${rightJoin} ${bottom}`,
    `H${panelRight - rightPanelRadius}`,
    `Q${panelRight} ${bottom} ${panelRight} ${bottom + rightPanelRadius}`,
    `V${bottom + PANEL_RADIUS}`,
    "Z",
  ].join(" ");
}

