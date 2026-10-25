import { radii } from "@/theme/radii";

/** Movement at or below this distance is a tap. Anything farther is a pan. */
export const SWIPE_TAP_SLOP_PX = 10;

/** Trailing (or leading) corner once the row is open. Large enough to read as a capsule end. */
export const SWIPE_ROW_TRAILING_RADIUS = radii.control;

/** Grouped list card corner. Closed first and last rows match it. */
export const SWIPE_ROW_CARD_RADIUS = radii.card;

/** Space between the outer button and the screen edge. */
export const SWIPE_ROW_BUTTON_EDGE = 12;

/** Space between the item and the nearest button. */
export const SWIPE_ROW_ITEM_INSET = 8;

/** Circular action diameter. */
export const SWIPE_ROW_ACTION_SIZE = 44;

/**
 * Smallest drawn scale for a swipe button.
 * Below this the circle fades out instead of shrinking into a speck.
 */
export const SWIPE_ROW_BUTTON_MIN_SCALE = 0.3;

/** Fade in or out once a button crosses the minimum scale. */
export const SWIPE_ROW_BUTTON_FADE_MS = 180;

/** Gap between two circular actions. */
export const SWIPE_ROW_ACTION_GAP = 12;

/** Drag distance at which the open corner reaches its full radius. */
export const SWIPE_ROW_OPEN_DISTANCE = 24;

/**
 * Offsets at or under this are still the closed row.
 * The open fill, the separator hide, and the action slot share it.
 */
export const SWIPE_ROW_CLOSED_EPSILON = 0.5;

export const swipeRowGestureConfig = {
  panActiveOffsetX: SWIPE_TAP_SLOP_PX,
  panFailOffsetY: 16,
  tapMaxDistance: SWIPE_TAP_SLOP_PX,
} as const;

/** How far a flick is projected when choosing open or closed. */
export const SWIPE_ROW_FLICK_SECONDS = 0.22;

/** Share of the button bay the projected offset must cross to stay open. */
export const SWIPE_ROW_OPEN_FRACTION = 0.35;

/** Extra travel past a fully open bay. The row resists instead of tracking the finger. */
export const SWIPE_ROW_RUBBER_LIMIT = 36;

/**
 * Release spring. Soft and overdamped, so a short one-button bay still
 * glides instead of snapping, and a flick does not bounce past the buttons.
 */
export const SWIPE_ROW_SETTLE_SPRING = {
  damping: 20,
  mass: 1,
  overshootClamping: true,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 8,
  stiffness: 56,
} as const;

/** Drag distance over which the open row fill fades in or back out. */
export const SWIPE_ROW_SURFACE_FADE = 72;

export type SwipeTouchKind = "tap" | "pan";
export type SwipeTouchAction = "navigate" | "close" | "ignore";
export type SwipeRowEdge = "leading" | "trailing";

export function gestureKindFromDisplacement(
  horizontal: number,
  slop = SWIPE_TAP_SLOP_PX,
): SwipeTouchKind {
  return Math.abs(horizontal) > slop ? "pan" : "tap";
}

/**
 * A pan never navigates, even when the finger ends near the start.
 * A tap navigates only while the action buttons are hidden.
 * A tap while they are showing only closes the row.
 */
export function resolveSwipeRowTouch(input: {
  kind: SwipeTouchKind;
  revealed: boolean;
}): SwipeTouchAction {
  if (input.kind === "pan") return "ignore";
  if (input.revealed) return "close";
  return "navigate";
}

export function swipeRowTouchAction(input: {
  horizontal: number;
  revealed: boolean;
  slop?: number;
}): SwipeTouchAction {
  return resolveSwipeRowTouch({
    kind: gestureKindFromDisplacement(input.horizontal, input.slop),
    revealed: input.revealed,
  });
}

export function applySwipeRowTouch(
  input: { kind: SwipeTouchKind; revealed: boolean },
  effects: { close: () => void; navigate: () => void },
): SwipeTouchAction {
  const action = resolveSwipeRowTouch(input);
  if (action === "navigate") effects.navigate();
  else if (action === "close") effects.close();
  return action;
}

/**
 * Row chrome for a drag offset.
 * The whole item translates by `offset`. It does not give up width, so the
 * title and subtitle keep their layout and are not ellipsized by the swipe.
 * Closed corners follow the grouped card. The open side eases to the cap.
 */
export function swipeRowCardFrame(offset: number, roundedTop?: boolean, roundedBottom?: boolean) {
  "worklet";
  const distance = Math.abs(offset);
  const progress = Math.min(distance / SWIPE_ROW_OPEN_DISTANCE, 1);
  const top = roundedTop === true ? SWIPE_ROW_CARD_RADIUS : 0;
  const bottom = roundedBottom === true ? SWIPE_ROW_CARD_RADIUS : 0;
  const openLeading = offset > 0 ? progress : 0;
  const openTrailing = offset < 0 ? progress : 0;
  return {
    borderWidth: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    radiusBottomLeft: bottom + (SWIPE_ROW_TRAILING_RADIUS - bottom) * openLeading,
    radiusBottomRight: bottom + (SWIPE_ROW_TRAILING_RADIUS - bottom) * openTrailing,
    radiusTopLeft: top + (SWIPE_ROW_TRAILING_RADIUS - top) * openLeading,
    radiusTopRight: top + (SWIPE_ROW_TRAILING_RADIUS - top) * openTrailing,
  };
}

/** True once the row has moved far enough to count as open for fill and separators. */
export function swipeRowIsOpen(offset: number) {
  "worklet";
  return Math.abs(offset) > SWIPE_ROW_CLOSED_EPSILON;
}

export type SwipeRowActionSlot = {
  /** 0 when closed, 1 when this edge is fully open. */
  scale: number;
  /** Layout width of the button slot. The row occupies whatever is left. */
  width: number;
};

/**
 * One edge's button slot.
 * Width is 0 while that edge is closed.
 * Otherwise it is the opened distance, capped at the bay.
 * Each button then grows inside its own slice of that width.
 */
export function swipeRowActionReveal(
  offset: number,
  bayWidth: number,
  edge: SwipeRowEdge,
): SwipeRowActionSlot {
  "worklet";
  if (!(bayWidth > 0) || !Number.isFinite(offset)) return { scale: 0, width: 0 };
  const opened = edge === "trailing" ? -offset : offset;
  if (!(opened > SWIPE_ROW_CLOSED_EPSILON)) return { scale: 0, width: 0 };
  const width = Math.min(opened, bayWidth);
  return { scale: width / bayWidth, width };
}

/**
 * Width of one button's slice, starting at the screen edge.
 * Index 0 is the outer button. It includes the screen inset and the gap
 * beside the item, so that gap grows with the first button on either side.
 * A later button only adds the space between circles.
 */
export function swipeRowButtonSpan(indexFromEdge: number, count: number) {
  "worklet";
  if (!(count > 0)) return 0;
  const button = SWIPE_ROW_ACTION_SIZE;
  const gap = SWIPE_ROW_ACTION_GAP;
  const screen = indexFromEdge <= 0 ? SWIPE_ROW_BUTTON_EDGE : 0;
  const between = indexFromEdge > 0 ? gap : 0;
  const item = indexFromEdge <= 0 ? SWIPE_ROW_ITEM_INSET : 0;
  return screen + between + button + item;
}

/** Full bay for `count` buttons. Matches the sum of `swipeRowButtonSpan`. */
export function swipeRowBayWidth(count: number) {
  "worklet";
  if (!(count > 0)) return 0;
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    total += swipeRowButtonSpan(index, count);
  }
  return total;
}

/**
 * One button's grow progress.
 * Earlier slices must finish before this button leaves 0, so two buttons
 * do not scale together.
 */
export function swipeRowButtonReveal(opened: number, indexFromEdge: number, count: number) {
  "worklet";
  if (!(count > 0) || !(opened > SWIPE_ROW_CLOSED_EPSILON)) return { scale: 0, width: 0 };
  let start = 0;
  const last = Math.min(indexFromEdge, count);
  for (let index = 0; index < last; index += 1) {
    start += swipeRowButtonSpan(index, count);
  }
  const span = swipeRowButtonSpan(indexFromEdge, count);
  if (!(span > 0)) return { scale: 0, width: 0 };
  const scale = Math.min(Math.max((opened - start) / span, 0), 1);
  return { scale, width: span * scale };
}

/**
 * Scale used to draw a button.
 * The circle follows the finger until the minimum, and holds there while it fades.
 * Layout width stays on the raw reveal scale.
 */
export function swipeRowButtonShownScale(scale: number) {
  "worklet";
  if (!Number.isFinite(scale) || !(scale > 0)) return 0;
  return Math.min(Math.max(scale, SWIPE_ROW_BUTTON_MIN_SCALE), 1);
}

function swipeRowRubber(extra: number) {
  "worklet";
  if (!(extra > 0)) return 0;
  const limit = SWIPE_ROW_RUBBER_LIMIT;
  return limit * (1 - 1 / (extra / limit + 1));
}

/**
 * Finger tracking for one drag frame.
 * Inside the button bay the row matches the finger.
 * Past a fully open bay, or toward an edge with no buttons, travel is resisted.
 */
export function swipeRowDragOffset(
  start: number,
  translationX: number,
  leadingWidth: number,
  trailingWidth: number,
) {
  "worklet";
  const raw = start + translationX;
  if (!Number.isFinite(raw)) return 0;
  if (raw >= 0) {
    if (!(leadingWidth > 0)) return 0;
    if (raw <= leadingWidth) return raw;
    return leadingWidth + swipeRowRubber(raw - leadingWidth);
  }
  if (!(trailingWidth > 0)) return 0;
  const opened = -raw;
  if (opened <= trailingWidth) return raw;
  return -(trailingWidth + swipeRowRubber(opened - trailingWidth));
}

/**
 * Rest position after the finger lifts.
 * The decision uses where the row would travel if it kept the release speed,
 * and a reverse flick only closes the side already open.
 */
export function swipeRowReleaseTarget(
  offset: number,
  velocityX: number,
  leadingWidth: number,
  trailingWidth: number,
) {
  const projected = offset + velocityX * SWIPE_ROW_FLICK_SECONDS;
  if (offset > SWIPE_ROW_CLOSED_EPSILON && leadingWidth > 0) {
    return projected > leadingWidth * SWIPE_ROW_OPEN_FRACTION ? leadingWidth : 0;
  }
  if (offset < -SWIPE_ROW_CLOSED_EPSILON && trailingWidth > 0) {
    return -projected > trailingWidth * SWIPE_ROW_OPEN_FRACTION ? -trailingWidth : 0;
  }
  if (velocityX > 0 && leadingWidth > 0 && projected > leadingWidth * SWIPE_ROW_OPEN_FRACTION) {
    return leadingWidth;
  }
  if (velocityX < 0 && trailingWidth > 0 && -projected > trailingWidth * SWIPE_ROW_OPEN_FRACTION) {
    return -trailingWidth;
  }
  return 0;
}

/**
 * Spring speed for the release. A raw flick across a one-button bay hits the
 * end in a single frame when overshoot is clamped, so the speed is limited
 * by how far the row still has to travel.
 */
export function swipeRowSettleVelocity(velocityX: number, distance: number) {
  if (!Number.isFinite(velocityX)) return 0;
  const cap = Math.max(Math.abs(distance) * 2.2, 320);
  if (velocityX > cap) return cap;
  if (velocityX < -cap) return -cap;
  return velocityX;
}

/** 0 while closed, 1 once the row has traveled `SWIPE_ROW_SURFACE_FADE`. */
export function swipeRowSurfaceOpacity(offset: number) {
  "worklet";
  const distance = Math.abs(offset);
  if (!(distance > SWIPE_ROW_CLOSED_EPSILON)) return 0;
  return Math.min(distance / SWIPE_ROW_SURFACE_FADE, 1);
}

/** Circles grow toward the row, anchored on the screen edge of the slot. */
export function swipeRowActionOrigin(edge: SwipeRowEdge) {
  "worklet";
  return edge === "leading" ? "left center" : "right center";
}

/** Separators above and below each open row. `separatorIndex` is the line before that row. Hiding them does not change tap versus pan. */
export function hiddenSwipeSeparatorIndexes(openIndexes: readonly number[]): number[] {
  const hidden = new Set<number>();
  for (const index of openIndexes) {
    if (index < 0) continue;
    hidden.add(index);
    hidden.add(index + 1);
  }
  return [...hidden].sort((left, right) => left - right);
}

export function swipeRowOpenChrome(revealed: boolean, colors: { secondaryBackground: string }) {
  const offset = revealed ? -SWIPE_ROW_OPEN_DISTANCE : 0;
  const frame = swipeRowCardFrame(offset);
  return {
    ...frame,
    // Closed stays transparent so the section corner radius stays visible.
    // Actions stay hidden because the slot width is 0 at rest, not because this fill is opaque.
    cardBackground: revealed ? colors.secondaryBackground : "transparent",
    // The button slot stays unpainted so the section's list fill shows through.
    wellBackground: "transparent" as const,
  };
}

/** One fill for the row. Open chrome wins over the press highlight, so the two never stack. */
export function swipeRowSurfaceColor(
  offset: number,
  pressed: boolean,
  colors: { mutedPressed: string; secondaryBackground: string },
) {
  "worklet";
  if (swipeRowIsOpen(offset)) return colors.secondaryBackground;
  if (pressed) return colors.mutedPressed;
  return "transparent";
}

/** Closed-row corners for a grouped card. Middle rows stay square. */
export function swipeRowClosedCorners(roundedTop: boolean, roundedBottom: boolean) {
  const frame = swipeRowCardFrame(0, roundedTop, roundedBottom);
  return {
    borderBottomLeftRadius: frame.radiusBottomLeft,
    borderBottomRightRadius: frame.radiusBottomRight,
    borderTopLeftRadius: frame.radiusTopLeft,
    borderTopRightRadius: frame.radiusTopRight,
    overflow: "hidden" as const,
  };
}
