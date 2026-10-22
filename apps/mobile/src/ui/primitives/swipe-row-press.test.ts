// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { darkColors, lightColors } from "@/theme/colors";
import { radii } from "@/theme/radii";
import {
  applySwipeRowTouch,
  resolveSwipeRowTouch,
  SWIPE_ROW_OPEN_RADIUS,
  SWIPE_TAP_SLOP_PX,
  swipeRowGestureConfig,
  swipeRowOpenChrome,
  swipeRowTouchAction,
} from "./swipe-row-press";

describe("swipe row press", () => {
  test("a stationary tap navigates", () => {
    expect(swipeRowTouchAction({ horizontal: 0, revealed: false })).toBe("navigate");
    expect(swipeRowTouchAction({ horizontal: SWIPE_TAP_SLOP_PX, revealed: false })).toBe(
      "navigate",
    );
    expect(swipeRowTouchAction({ horizontal: -SWIPE_TAP_SLOP_PX, revealed: false })).toBe(
      "navigate",
    );
    expect(resolveSwipeRowTouch({ kind: "tap", revealed: false })).toBe("navigate");
  });

  test("horizontal movement and a finished pan do not navigate", () => {
    expect(swipeRowTouchAction({ horizontal: SWIPE_TAP_SLOP_PX + 1, revealed: false })).toBe(
      "ignore",
    );
    expect(swipeRowTouchAction({ horizontal: -40, revealed: false })).toBe("ignore");
    expect(resolveSwipeRowTouch({ kind: "pan", revealed: false })).toBe("ignore");
    expect(resolveSwipeRowTouch({ kind: "pan", revealed: true })).toBe("ignore");
  });

  test("a tap on an open row only closes it", () => {
    expect(swipeRowTouchAction({ horizontal: 0, revealed: true })).toBe("close");
    expect(resolveSwipeRowTouch({ kind: "tap", revealed: true })).toBe("close");

    const calls: string[] = [];
    expect(
      applySwipeRowTouch(
        { kind: "tap", revealed: true },
        {
          close: () => calls.push("close"),
          navigate: () => calls.push("navigate"),
        },
      ),
    ).toBe("close");
    expect(
      applySwipeRowTouch(
        { kind: "pan", revealed: false },
        {
          close: () => calls.push("close"),
          navigate: () => calls.push("navigate"),
        },
      ),
    ).toBe("ignore");
    expect(
      applySwipeRowTouch(
        { kind: "tap", revealed: false },
        {
          close: () => calls.push("close"),
          navigate: () => calls.push("navigate"),
        },
      ),
    ).toBe("navigate");
    expect(calls).toEqual(["close", "navigate"]);
  });

  test("gesture config uses the tap slop", () => {
    expect(swipeRowGestureConfig.tapMaxDistance).toBe(SWIPE_TAP_SLOP_PX);
    expect(swipeRowGestureConfig.panActiveOffsetX).toBe(SWIPE_TAP_SLOP_PX);
  });

  test("an open row is a rounded card on a different fill in light and dark", () => {
    expect(SWIPE_ROW_OPEN_RADIUS).toBe(radii.cardNested);

    const light = swipeRowOpenChrome(true, lightColors);
    const dark = swipeRowOpenChrome(true, darkColors);
    expect(light.radius).toBe(radii.cardNested);
    expect(dark.radius).toBe(radii.cardNested);
    expect(light.cardBackground).toBe(lightColors.cardElevated);
    expect(dark.cardBackground).toBe(darkColors.cardElevated);
    expect(light.wellBackground).toBe(lightColors.background);
    expect(dark.wellBackground).toBe(darkColors.background);
    expect(light.cardBackground).not.toBe(light.wellBackground);
    expect(dark.cardBackground).not.toBe(dark.wellBackground);

    const closed = swipeRowOpenChrome(false, lightColors);
    expect(closed.radius).toBe(0);
    expect(closed.wellBackground).toBe("transparent");
    expect(closed.cardBackground).toBe(lightColors.cardElevated);
  });
});
