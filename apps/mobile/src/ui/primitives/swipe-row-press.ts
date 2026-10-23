import { radii } from "@/theme/radii";
import { spacing } from "@/theme/spacing";

/** Movement at or below this distance is a tap. Anything farther is a pan. */
export const SWIPE_TAP_SLOP_PX = 10;

/**
 * Screen padding. Past this distance the outer edge stays flush with the screen
 * and the row shrinks on the action side, so a short title is not carried off.
 */
export const SWIPE_ROW_SCREEN_BLEED = spacing.screenX;

/** Trailing (or leading) corner once the row is open. Large enough to read as a capsule end. */
export const SWIPE_ROW_TRAILING_RADIUS = radii.control;

/** Gap between the rounded cap and the first circular action, and between the last action and the screen edge of the button bay. */
export const SWIPE_ROW_BUTTON_EDGE = 16;

/** Drag distance at which the open corner reaches its full radius. */
export const SWIPE_ROW_OPEN_DISTANCE = 24;

/**
 * Offsets at or under this are still the closed row.
 * The open fill, the separator hide, and the action clip share it.
 */
export const SWIPE_ROW_CLOSED_EPSILON = 0.5;

export const swipeRowGestureConfig = {
  panActiveOffsetX: SWIPE_TAP_SLOP_PX,
  panFailOffsetY: 16,
  tapMaxDistance: SWIPE_TAP_SLOP_PX,
} as const;

export type SwipeTouchKind = "tap" | "pan";
export type SwipeTouchAction = "navigate" | "close" | "ignore";

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

export function swipeRowCardFrame(offset: number) {
  "worklet";
  const distance = Math.abs(offset);
  const progress = Math.min(distance / SWIPE_ROW_OPEN_DISTANCE, 1);
  const trailing = offset < 0 ? SWIPE_ROW_TRAILING_RADIUS * progress : 0;
  const leading = offset > 0 ? SWIPE_ROW_TRAILING_RADIUS * progress : 0;
  // Clamp the outer edge at the screen. A full-width shift hides short titles.
  const reveal = offset === 0 ? 0 : distance;
  const edge = Math.min(reveal, SWIPE_ROW_SCREEN_BLEED);
  let marginLeft = 0;
  let marginRight = 0;
  if (offset < 0) {
    marginLeft = -edge;
    marginRight = reveal;
  } else if (offset > 0) {
    marginLeft = reveal;
    marginRight = -edge;
  }
  return {
    borderWidth: 0,
    marginBottom: 0,
    marginLeft,
    marginRight,
    marginTop: 0,
    radiusBottomLeft: leading,
    radiusBottomRight: trailing,
    radiusTopLeft: leading,
    radiusTopRight: trailing,
  };
}

/** True once the row has moved far enough to count as open for fill and separators. */
export function swipeRowIsOpen(offset: number) {
  "worklet";
  return Math.abs(offset) > SWIPE_ROW_CLOSED_EPSILON;
}

/**
 * Paintable width of one action bay.
 * Zero while that edge is closed, so the circles cannot show through the transparent card.
 * Otherwise the positive gap `swipeRowCardFrame` opens on that edge, capped at the bay.
 * The trailing clip anchors to the right edge. The leading clip anchors to the left edge.
 */
export function swipeRowActionReveal(
  offset: number,
  bayWidth: number,
  edge: "leading" | "trailing",
) {
  "worklet";
  if (!(bayWidth > 0) || !Number.isFinite(offset)) return 0;
  const opened = edge === "trailing" ? -offset : offset;
  if (!(opened > SWIPE_ROW_CLOSED_EPSILON)) return 0;
  return Math.min(opened, bayWidth);
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
    // Actions stay hidden because swipeRowActionReveal is 0 at rest, not because this fill is opaque.
    cardBackground: revealed ? colors.secondaryBackground : "transparent",
    // The button bay stays unpainted so the section's list fill shows through.
    wellBackground: "transparent" as const,
  };
}
