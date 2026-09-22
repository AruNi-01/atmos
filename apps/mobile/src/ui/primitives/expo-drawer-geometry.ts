/** iOS 26 half-sheet gap from the display edge. Collapses to 0 at full height. */
export const DRAWER_EDGE_INSET = 12;
export const DRAWER_HALF_TOP_FRACTION = 0.46;
export const DRAWER_CORNER_RADIUS = 32;
/** Start melting the gap once the sheet is this close to the top. */
export const DRAWER_ATTACH_TOP_MAX = 88;
export const DRAWER_ATTACH_TOP_FRACTION = 0.1;

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function drawerHalfTop(windowHeight: number) {
  return Math.round(windowHeight * DRAWER_HALF_TOP_FRACTION);
}

export function drawerAttachTop(windowHeight: number) {
  return Math.min(DRAWER_ATTACH_TOP_MAX, Math.round(windowHeight * DRAWER_ATTACH_TOP_FRACTION));
}

/**
 * Map the sheet's top offset to screen-edge inset and corner radius.
 * `top = halfTop` is the resting half detent; `top = 0` is full-screen.
 * The floating gap stays until the sheet is nearly full, then eases flush.
 */
export function drawerChrome(top: number, windowHeight: number) {
  const halfTop = drawerHalfTop(windowHeight);
  const attachTop = drawerAttachTop(windowHeight);
  const t = clamp01(top / Math.max(attachTop, 1));
  const floating = t * t * (3 - 2 * t);
  return {
    attachTop,
    halfTop,
    inset: DRAWER_EDGE_INSET * floating,
    progress: 1 - floating,
    radius: DRAWER_CORNER_RADIUS * floating,
  };
}

export function nextDrawerSnap({
  halfTop,
  top,
  vy,
}: {
  halfTop: number;
  top: number;
  vy: number;
}): "dismiss" | "full" | "half" {
  if (vy < -1.05) return "full";
  if (vy > 1.05) return top >= halfTop ? "dismiss" : "half";
  if (top > halfTop + 64) return "dismiss";
  return top < halfTop / 2 ? "full" : "half";
}
