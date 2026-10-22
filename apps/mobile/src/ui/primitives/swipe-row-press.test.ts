// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
import { darkColors, lightColors } from "@/theme/colors";
import { radii } from "@/theme/radii";
import { spacing } from "@/theme/spacing";
import {
  applySwipeRowTouch,
  resolveSwipeRowTouch,
  SWIPE_ROW_BUTTON_EDGE,
  SWIPE_ROW_SCREEN_BLEED,
  SWIPE_ROW_TRAILING_RADIUS,
  SWIPE_TAP_SLOP_PX,
  swipeRowCardFrame,
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

  test("a left swipe rounds only the trailing corners and stops at the screen edge", () => {
    expect(SWIPE_ROW_TRAILING_RADIUS).toBe(radii.control);
    expect(SWIPE_ROW_SCREEN_BLEED).toBe(spacing.screenX);
    expect(SWIPE_ROW_BUTTON_EDGE).toBeGreaterThan(0);

    const open = swipeRowCardFrame(-120);
    expect(open.marginLeft).toBe(-spacing.screenX);
    expect(open.marginRight).toBe(120);
    expect(open.marginTop).toBe(0);
    expect(open.marginBottom).toBe(0);
    expect(open.borderWidth).toBe(0);
    expect(open.radiusTopRight).toBe(radii.control);
    expect(open.radiusBottomRight).toBe(radii.control);
    expect(open.radiusTopLeft).toBe(0);
    expect(open.radiusBottomLeft).toBe(0);

    const atScreen = swipeRowCardFrame(-spacing.screenX);
    expect(atScreen.marginLeft).toBe(-spacing.screenX);
    expect(atScreen.marginRight).toBe(spacing.screenX);

    const pin = swipeRowCardFrame(80);
    expect(pin.radiusTopLeft).toBe(radii.control);
    expect(pin.radiusBottomLeft).toBe(radii.control);
    expect(pin.radiusTopRight).toBe(0);
    expect(pin.radiusBottomRight).toBe(0);
    expect(pin.marginLeft).toBe(80);
    expect(pin.marginRight).toBe(-spacing.screenX);
  });

  test("an open row uses a different fill from the page and from other rows", () => {
    for (const colors of [lightColors, darkColors]) {
      const open = swipeRowOpenChrome(true, colors);
      expect(open.cardBackground).toBe(colors.secondaryBackground);
      expect(open.wellBackground).toBe(colors.background);
      expect(open.cardBackground).not.toBe(open.wellBackground);
      expect(open.cardBackground).not.toBe(colors.cardElevated);
      expect(open.borderWidth).toBe(0);
      expect(open.radiusTopRight).toBe(radii.control);
      expect(open.radiusBottomRight).toBe(radii.control);
      expect(open.radiusTopLeft).toBe(0);
      expect(open.radiusBottomLeft).toBe(0);
      expect(open.marginLeft).toBe(-spacing.screenX);
      expect(open.marginRight).toBe(24);
      expect(colors.secondaryBackground).not.toBe(colors.background);
      expect(colors.secondaryBackground).not.toBe(colors.cardElevated);
    }

    const closed = swipeRowOpenChrome(false, lightColors);
    expect(closed.radiusTopLeft).toBe(0);
    expect(closed.radiusTopRight).toBe(0);
    expect(closed.radiusBottomLeft).toBe(0);
    expect(closed.radiusBottomRight).toBe(0);
    expect(closed.marginLeft).toBe(0);
    expect(closed.marginRight).toBe(0);
    expect(closed.wellBackground).toBe("transparent");
    expect(closed.cardBackground).toBe("transparent");
    expect(closed.borderWidth).toBe(0);
  });

  test("the swipe row does not hardcode colors", () => {
    const source = readFileSync(new URL("./session-swipe-row.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).toContain("theme.colors.secondaryBackground");
    expect(source).toContain("theme.colors.swipeArchive");
    expect(source).toContain("theme.colors.swipeDelete");
    expect(source).toContain("theme.colors.swipePin");
    expect(source).toContain("theme.colors.ctaLabel");
    expect(source).toContain("theme.colors.background");
  });
});
