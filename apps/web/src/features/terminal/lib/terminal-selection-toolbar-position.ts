export type SelectionToolbarAnchor = { x: number; y: number };

export type SelectionToolbarPlacement = "above" | "below";

export interface ClampSelectionToolbarPositionInput {
  anchor: SelectionToolbarAnchor;
  toolbarWidth: number;
  toolbarHeight: number;
  containerWidth: number;
  containerHeight: number;
  /** Minimum inset from each container edge. */
  margin?: number;
  /** Gap between the anchor point and the toolbar. */
  gap?: number;
  preferredPlacement?: SelectionToolbarPlacement;
}

export interface ClampSelectionToolbarPositionResult {
  /** CSS `left` when the toolbar uses `translateX(-50%)` (center-aligned to this x). */
  left: number;
  top: number;
  placement: SelectionToolbarPlacement;
}

/**
 * Keep the terminal selection toolbar fully inside its positioned container.
 *
 * Horizontal: `left` is the toolbar center (pair with `translateX(-50%)`).
 * Vertical: prefer above the anchor; flip below when there is not enough room.
 */
export function clampSelectionToolbarPosition({
  anchor,
  toolbarWidth,
  toolbarHeight,
  containerWidth,
  containerHeight,
  margin = 8,
  gap = 8,
  preferredPlacement = "above",
}: ClampSelectionToolbarPositionInput): ClampSelectionToolbarPositionResult {
  const safeMargin = Math.max(0, margin);
  const safeGap = Math.max(0, gap);
  const width = Math.max(0, toolbarWidth);
  const height = Math.max(0, toolbarHeight);
  const boundsWidth = Math.max(0, containerWidth);
  const boundsHeight = Math.max(0, containerHeight);

  // Center-aligned left, clamped so left ± width/2 stays inside the margin.
  const halfWidth = width / 2;
  const minCenter = safeMargin + halfWidth;
  const maxCenter = boundsWidth - safeMargin - halfWidth;
  let left = Number.isFinite(anchor.x) ? anchor.x : boundsWidth / 2;
  if (maxCenter < minCenter) {
    // Toolbar wider than the usable area — pin to geometric center.
    left = boundsWidth / 2;
  } else {
    left = Math.min(Math.max(left, minCenter), maxCenter);
  }

  const aboveTop = (Number.isFinite(anchor.y) ? anchor.y : 0) - safeGap - height;
  const belowTop = (Number.isFinite(anchor.y) ? anchor.y : 0) + safeGap;
  const minTop = safeMargin;
  const maxTop = Math.max(minTop, boundsHeight - safeMargin - height);

  let placement: SelectionToolbarPlacement = preferredPlacement;
  let top: number;

  if (preferredPlacement === "above") {
    if (aboveTop >= minTop) {
      placement = "above";
      top = aboveTop;
    } else if (belowTop <= maxTop) {
      placement = "below";
      top = belowTop;
    } else {
      // Neither side fits cleanly — keep preferred side and clamp.
      placement = "above";
      top = Math.min(Math.max(aboveTop, minTop), maxTop);
    }
  } else if (belowTop <= maxTop) {
    placement = "below";
    top = belowTop;
  } else if (aboveTop >= minTop) {
    placement = "above";
    top = aboveTop;
  } else {
    placement = "below";
    top = Math.min(Math.max(belowTop, minTop), maxTop);
  }

  top = Math.min(Math.max(top, minTop), maxTop);

  return { left, top, placement };
}
