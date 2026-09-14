export const RESIZE_CLICK_SLOP_PX = 5;

export type ResizeClickAxis = "vertical" | "horizontal";

/** True when the pointer never moved far enough across the seam to count as a drag. */
export function isResizeClickGesture(
  start: { x: number; y: number },
  point: { x: number; y: number },
  axis: ResizeClickAxis = "vertical",
  slopPx = RESIZE_CLICK_SLOP_PX,
): boolean {
  const delta =
    axis === "vertical" ? Math.abs(point.x - start.x) : Math.abs(point.y - start.y);
  return delta <= slopPx;
}
