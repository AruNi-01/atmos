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
  hiddenSwipeSeparatorIndexes,
  SWIPE_ROW_BUTTON_EDGE,
  SWIPE_ROW_CLOSED_EPSILON,
  SWIPE_ROW_SCREEN_BLEED,
  SWIPE_ROW_TRAILING_RADIUS,
  SWIPE_TAP_SLOP_PX,
  swipeRowActionReveal,
  swipeRowCardFrame,
  swipeRowGestureConfig,
  swipeRowIsOpen,
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

  test("an open row uses a different fill and leaves the button bay on the list fill", () => {
    for (const colors of [lightColors, darkColors]) {
      const open = swipeRowOpenChrome(true, colors);
      expect(open.cardBackground).toBe(colors.secondaryBackground);
      expect(open.wellBackground).toBe("transparent");
      expect(open.cardBackground).not.toBe(colors.cardElevated);
      expect(open.cardBackground).not.toBe(colors.background);
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
    expect(rgbSum(darkColors.secondaryBackground)).toBeGreaterThan(rgbSum(darkColors.cardElevated));

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

  test("an open row hides the separators above and below it", () => {
    expect(hiddenSwipeSeparatorIndexes([])).toEqual([]);
    expect(hiddenSwipeSeparatorIndexes([-1])).toEqual([]);
    expect(hiddenSwipeSeparatorIndexes([0])).toEqual([0, 1]);
    expect(hiddenSwipeSeparatorIndexes([2])).toEqual([2, 3]);
    expect(hiddenSwipeSeparatorIndexes([1, 3])).toEqual([1, 2, 3, 4]);
  });

  test("a closed row covers trailing and leading actions", () => {
    expect(SWIPE_ROW_CLOSED_EPSILON).toBe(0.5);
    expect(swipeRowIsOpen(0)).toBe(false);
    expect(swipeRowIsOpen(SWIPE_ROW_CLOSED_EPSILON)).toBe(false);
    expect(swipeRowIsOpen(-SWIPE_ROW_CLOSED_EPSILON)).toBe(false);
    expect(swipeRowIsOpen(SWIPE_ROW_CLOSED_EPSILON + 0.01)).toBe(true);
    expect(swipeRowIsOpen(-(SWIPE_ROW_CLOSED_EPSILON + 0.01))).toBe(true);

    for (const edge of ["leading", "trailing"] as const) {
      expect(swipeRowActionReveal(0, 132, edge)).toBe(0);
      expect(swipeRowActionReveal(0.5, 132, edge)).toBe(0);
      expect(swipeRowActionReveal(-0.5, 132, edge)).toBe(0);
      expect(swipeRowActionReveal(0, 0, edge)).toBe(0);
      expect(swipeRowActionReveal(-40, 0, edge)).toBe(0);
      expect(swipeRowActionReveal(-40, -8, edge)).toBe(0);
      expect(swipeRowActionReveal(Number.NaN, 132, edge)).toBe(0);
      expect(swipeRowActionReveal(Number.POSITIVE_INFINITY, 132, edge)).toBe(0);
    }
  });

  test("an open gap reveals only that edge and matches the card margin", () => {
    const bay = 132;
    for (const offset of [-24, -40, -120, -200, 24, 80, 200]) {
      const frame = swipeRowCardFrame(offset);
      const trailingGap = frame.marginRight > 0 ? frame.marginRight : 0;
      const leadingGap = frame.marginLeft > 0 ? frame.marginLeft : 0;
      expect(swipeRowActionReveal(offset, bay, "trailing")).toBe(Math.min(trailingGap, bay));
      expect(swipeRowActionReveal(offset, bay, "leading")).toBe(Math.min(leadingGap, bay));
      if (offset < 0) expect(swipeRowActionReveal(offset, bay, "leading")).toBe(0);
      if (offset > 0) expect(swipeRowActionReveal(offset, bay, "trailing")).toBe(0);
    }

    expect(swipeRowActionReveal(-40, 132, "trailing")).toBe(40);
    expect(swipeRowActionReveal(-200, 132, "trailing")).toBe(132);
    expect(swipeRowActionReveal(80, 76, "leading")).toBe(76);
    expect(swipeRowActionReveal(SWIPE_ROW_CLOSED_EPSILON + 0.01, 132, "leading")).toBeCloseTo(0.51);
  });

  test("the row source clips closed actions and keeps the open list-fill bay", () => {
    const source = readFileSync(new URL("./session-swipe-row.tsx", import.meta.url), "utf8");
    expect(source).toContain('swipeRowActionReveal(offset.get(), trailingW.get(), "trailing")');
    expect(source).toContain('swipeRowActionReveal(offset.get(), leadingW.get(), "leading")');
    expect(source).toContain('overflow: "hidden"');
    expect(source).toContain("opacity: 0");
    expect(source).toContain("width: 0");
    expect(source).toContain('moving ? openColor.get() : "transparent"');
    expect(source).toContain("swipeRowIsOpen");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toContain("theme.colors.background");
    expect(source).not.toContain("theme.colors.cardElevated");

    const closed = swipeRowOpenChrome(false, lightColors);
    expect(closed.cardBackground).toBe("transparent");
    expect(closed.wellBackground).toBe("transparent");
    expect(swipeRowActionReveal(0, 132, "trailing")).toBe(0);
    expect(swipeRowActionReveal(0, 76, "leading")).toBe(0);
  });

  test("the swipe row does not hardcode colors", () => {
    const source = readFileSync(new URL("./session-swipe-row.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).toContain("theme.colors.secondaryBackground");
    expect(source).toContain("theme.colors.swipeArchive");
    expect(source).toContain("theme.colors.swipeDelete");
    expect(source).toContain("theme.colors.swipePin");
    expect(source).toContain("theme.colors.ctaLabel");
    expect(source).not.toContain("theme.colors.background");
    expect(source).toContain("onRevealedChange");
  });
});

function rgbSum(hex: string) {
  return (
    Number.parseInt(hex.slice(1, 3), 16) +
    Number.parseInt(hex.slice(3, 5), 16) +
    Number.parseInt(hex.slice(5, 7), 16)
  );
}
