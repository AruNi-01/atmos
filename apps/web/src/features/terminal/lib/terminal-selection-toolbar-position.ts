export type SelectionToolbarAnchor = { x: number; y: number };

export type SelectionToolbarPlacement = "above" | "below";

export type SelectionToolbarAlign = "start" | "end";

export type SelectionToolbarDensity = "labeled" | "icon";

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
  /** CSS `left` of the toolbar's left edge (no horizontal translate). */
  left: number;
  top: number;
  placement: SelectionToolbarPlacement;
  /** `start` grows right from the anchor; `end` grows left. */
  align: SelectionToolbarAlign;
}

/**
 * Keep the terminal selection toolbar fully inside its positioned container.
 *
 * Horizontal: expand toward the side of the anchor with more room, then clamp
 * the left edge so the toolbar stays inside the margin. Pair with `left` as
 * the toolbar's left edge (do not use `translateX(-50%)` — that shrink-to-fits
 * against the remaining space and wraps CJK labels).
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

  const anchorX = Number.isFinite(anchor.x) ? anchor.x : boundsWidth / 2;
  const innerWidth = Math.max(0, boundsWidth - 2 * safeMargin);
  const minLeft = safeMargin;
  const maxLeft = boundsWidth - safeMargin - width;

  let left: number;
  let align: SelectionToolbarAlign;
  if (width >= innerWidth || maxLeft < minLeft) {
    left = minLeft;
    align = "start";
  } else {
    const spaceRight = boundsWidth - safeMargin - anchorX;
    const spaceLeft = anchorX - safeMargin;
    if (spaceRight >= spaceLeft) {
      align = "start";
      left = anchorX;
    } else {
      align = "end";
      left = anchorX - width;
    }
    left = Math.min(Math.max(left, minLeft), maxLeft);
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

  return { left, top, placement, align };
}

/** Use icon-only actions when labeled buttons cannot fit in the pane. */
export function selectionToolbarDensity({
  labeledWidth,
  containerWidth,
  margin = 8,
}: {
  labeledWidth: number;
  containerWidth: number;
  margin?: number;
}): SelectionToolbarDensity {
  if (!(labeledWidth > 0)) return "labeled";
  const available = Math.max(0, containerWidth - 2 * Math.max(0, margin));
  return labeledWidth > available ? "icon" : "labeled";
}
