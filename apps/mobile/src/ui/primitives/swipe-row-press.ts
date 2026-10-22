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

export function swipeRowWellColor(offset: number, background: string) {
  "worklet";
  return Math.abs(offset) > 0.5 ? background : "transparent";
}

export function swipeRowOpenChrome(
  revealed: boolean,
  colors: { background: string; secondaryBackground: string },
) {
  const offset = revealed ? -SWIPE_ROW_OPEN_DISTANCE : 0;
  const frame = swipeRowCardFrame(offset);
  return {
    ...frame,
    cardBackground: revealed ? colors.secondaryBackground : "transparent",
    wellBackground: swipeRowWellColor(offset, colors.background),
  };
}
