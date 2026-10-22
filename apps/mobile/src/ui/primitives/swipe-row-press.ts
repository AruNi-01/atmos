import { radii } from "@/theme/radii";

/** Movement at or below this distance is a tap. Anything farther is a pan. */
export const SWIPE_TAP_SLOP_PX = 10;

export const SWIPE_ROW_OPEN_RADIUS = radii.cardNested;
export const SWIPE_ROW_OPEN_INSET = 8;
export const SWIPE_ROW_OPEN_GAP = 6;

/** Drag distance at which the open card reaches its full corner radius. */
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
  const inset = distance > 0 ? SWIPE_ROW_OPEN_INSET * progress : 0;
  return {
    marginBottom: SWIPE_ROW_OPEN_GAP * progress,
    marginLeft: Math.max(offset, 0) + inset,
    marginRight: Math.max(-offset, 0) + inset,
    marginTop: SWIPE_ROW_OPEN_GAP * progress,
    radius: SWIPE_ROW_OPEN_RADIUS * progress,
  };
}

export function swipeRowWellColor(offset: number, background: string) {
  "worklet";
  return Math.abs(offset) > 0.5 ? background : "transparent";
}

export function swipeRowOpenChrome(
  revealed: boolean,
  colors: { background: string; cardElevated: string },
) {
  const offset = revealed ? -SWIPE_ROW_OPEN_DISTANCE : 0;
  const frame = swipeRowCardFrame(offset);
  return {
    cardBackground: colors.cardElevated,
    radius: frame.radius,
    wellBackground: swipeRowWellColor(offset, colors.background),
  };
}
