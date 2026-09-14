export type ResizeFollowAxis = "vertical" | "horizontal";
export type ResizeFollowSide = "start" | "end";

export type ResizeFollowRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Visual borders the capsule hugs, as px offsets from the handle origin toward end. */
export type ResizeFollowSeam = {
  start: number;
  end: number;
};

/** Capsule thickness for the short resize mark. */
export const RESIZE_FOLLOW_MARK_THICKNESS_PX = 3;
/** Capsule length along the pointer axis. */
export const RESIZE_FOLLOW_MARK_LENGTH_PX = 36;
/** Gap between the visual border and the mark, toward the approach side. */
export const RESIZE_FOLLOW_MARK_GAP_PX = 3;

export const RESIZE_FOLLOW_SEAM_AT_ORIGIN: ResizeFollowSeam = { start: 0, end: 0 };

/** One shared border, shifted from the handle origin toward end (e.g. a card gutter). */
export function resizeFollowSeamAt(offsetPx: number): ResizeFollowSeam {
  return { start: offsetPx, end: offsetPx };
}

/** Two pane borders separated by `gapPx` on each side of the handle origin. */
export function resizeFollowSeamFromGap(gapPx: number): ResizeFollowSeam {
  return { start: -gapPx, end: gapPx };
}

export function resolveResizeApproachSide(
  axis: ResizeFollowAxis,
  pointer: { x: number; y: number },
  host: ResizeFollowRect,
): ResizeFollowSide {
  if (axis === "vertical") {
    return pointer.x < host.left + host.width / 2 ? "start" : "end";
  }
  return pointer.y < host.top + host.height / 2 ? "start" : "end";
}

export function clampResizeFollowAlongPx(
  alongPx: number,
  hostLength: number,
  markLength = RESIZE_FOLLOW_MARK_LENGTH_PX,
): number {
  const half = markLength / 2;
  const max = Math.max(half, hostLength - half);
  return Math.min(max, Math.max(half, alongPx));
}

export function resolveResizeFollowMark({
  axis,
  pointer,
  host,
  lockedSide,
}: {
  axis: ResizeFollowAxis;
  pointer: { x: number; y: number };
  host: ResizeFollowRect;
  lockedSide: ResizeFollowSide | null;
}): { side: ResizeFollowSide; alongPx: number } {
  const side = lockedSide ?? resolveResizeApproachSide(axis, pointer, host);
  const alongPx =
    axis === "vertical"
      ? clampResizeFollowAlongPx(pointer.y - host.top, host.height)
      : clampResizeFollowAlongPx(pointer.x - host.left, host.width);
  return { side, alongPx };
}

export function followMarkCrossOffsetPx(
  side: ResizeFollowSide,
  seam: ResizeFollowSeam = RESIZE_FOLLOW_SEAM_AT_ORIGIN,
): number {
  const seamPx = side === "start" ? seam.start : seam.end;
  if (side === "start") {
    return seamPx - RESIZE_FOLLOW_MARK_THICKNESS_PX - RESIZE_FOLLOW_MARK_GAP_PX;
  }
  return seamPx + RESIZE_FOLLOW_MARK_GAP_PX;
}

export function followMarkTransform(
  axis: ResizeFollowAxis,
  side: ResizeFollowSide,
  alongPx: number,
  seam: ResizeFollowSeam = RESIZE_FOLLOW_SEAM_AT_ORIGIN,
): string {
  const half = RESIZE_FOLLOW_MARK_LENGTH_PX / 2;
  const cross = followMarkCrossOffsetPx(side, seam);
  if (axis === "vertical") {
    return `translate3d(${cross}px, ${alongPx - half}px, 0)`;
  }
  return `translate3d(${alongPx - half}px, ${cross}px, 0)`;
}

export function paintResizeFollowMark(
  mark: HTMLElement,
  axis: ResizeFollowAxis,
  pointer: { x: number; y: number },
  host: ResizeFollowRect,
  lockedSide: ResizeFollowSide | null,
  seam: ResizeFollowSeam = RESIZE_FOLLOW_SEAM_AT_ORIGIN,
): ResizeFollowSide {
  const next = resolveResizeFollowMark({ axis, pointer, host, lockedSide });
  mark.style.transform = followMarkTransform(axis, next.side, next.alongPx, seam);
  mark.dataset.side = next.side;
  mark.dataset.show = "";
  return next.side;
}

export function hideResizeFollowMark(mark: HTMLElement) {
  delete mark.dataset.show;
  delete mark.dataset.side;
}
