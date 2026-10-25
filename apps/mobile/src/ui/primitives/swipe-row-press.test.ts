// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
import { darkColors, lightColors } from "@/theme/colors";
import { radii } from "@/theme/radii";
import {
  applySwipeRowTouch,
  resolveSwipeRowTouch,
  hiddenSwipeSeparatorIndexes,
  SWIPE_ROW_ACTION_GAP,
  SWIPE_ROW_ACTION_SIZE,
  SWIPE_ROW_BUTTON_EDGE,
  SWIPE_ROW_BUTTON_FADE_MS,
  SWIPE_ROW_BUTTON_MIN_SCALE,
  SWIPE_ROW_CARD_RADIUS,
  SWIPE_ROW_ITEM_INSET,
  SWIPE_ROW_CLOSED_EPSILON,
  SWIPE_ROW_FLICK_SECONDS,
  SWIPE_ROW_OPEN_FRACTION,
  SWIPE_ROW_RUBBER_LIMIT,
  SWIPE_ROW_SETTLE_SPRING,
  SWIPE_ROW_TRAILING_RADIUS,
  SWIPE_TAP_SLOP_PX,
  swipeRowActionOrigin,
  swipeRowActionReveal,
  swipeRowBayWidth,
  swipeRowButtonReveal,
  swipeRowButtonShownScale,
  swipeRowButtonSpan,
  swipeRowCardFrame,
  swipeRowClosedCorners,
  swipeRowDragOffset,
  swipeRowGestureConfig,
  swipeRowIsOpen,
  swipeRowReleaseTarget,
  swipeRowOpenChrome,
  swipeRowSettleVelocity,
  SWIPE_ROW_SURFACE_FADE,
  swipeRowSurfaceColor,
  swipeRowSurfaceOpacity,
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

  test("a drag tracks the finger and resists past the buttons", () => {
    expect(swipeRowDragOffset(0, -40, 76, 132)).toBe(-40);
    expect(swipeRowDragOffset(-20, -15, 76, 132)).toBe(-35);
    const past = swipeRowDragOffset(0, -400, 76, 132);
    expect(past).toBeLessThan(-132);
    expect(past).toBeGreaterThan(-(132 + SWIPE_ROW_RUBBER_LIMIT));
    expect(swipeRowDragOffset(0, 200, 0, 132)).toBe(0);
    expect(swipeRowDragOffset(0, -80, 76, 0)).toBe(0);
    expect(swipeRowDragOffset(Number.NaN, 10, 76, 132)).toBe(0);
  });

  test("release keeps the flick speed instead of a fixed snap", () => {
    const leading = 76;
    const trailing = 132;
    const openAt = leading * SWIPE_ROW_OPEN_FRACTION;
    expect(swipeRowReleaseTarget(openAt - 1, 0, leading, trailing)).toBe(0);
    expect(swipeRowReleaseTarget(openAt + 1, 0, leading, trailing)).toBe(leading);
    const flick = 900;
    expect(swipeRowReleaseTarget(8, flick, leading, trailing)).toBe(leading);
    expect(8 + flick * SWIPE_ROW_FLICK_SECONDS).toBeGreaterThan(openAt);
    expect(swipeRowReleaseTarget(-8, -flick, leading, trailing)).toBe(-trailing);
    expect(swipeRowReleaseTarget(40, -1500, leading, trailing)).toBe(0);
    expect(swipeRowReleaseTarget(-80, 0, leading, trailing)).toBe(-trailing);
    expect(SWIPE_ROW_SETTLE_SPRING.overshootClamping).toBe(true);
    expect(SWIPE_ROW_SETTLE_SPRING.stiffness).toBeGreaterThan(0);
    expect(SWIPE_ROW_SETTLE_SPRING.stiffness).toBeLessThan(120);
    expect(swipeRowSettleVelocity(4000, 76)).toBeLessThan(800);
    expect(swipeRowSettleVelocity(120, 76)).toBe(120);
    expect(swipeRowSettleVelocity(Number.NaN, 76)).toBe(0);
  });

  test("a left swipe rounds only the trailing corners and leaves the row beside the buttons", () => {
    expect(SWIPE_ROW_TRAILING_RADIUS).toBe(radii.control);
    expect(SWIPE_ROW_CARD_RADIUS).toBe(radii.card);
    expect(SWIPE_ROW_BUTTON_EDGE).toBeGreaterThan(0);

    const open = swipeRowCardFrame(-120);
    expect(open.marginLeft).toBe(0);
    expect(open.marginRight).toBe(0);
    expect(open.marginTop).toBe(0);
    expect(open.marginBottom).toBe(0);
    expect(open.borderWidth).toBe(0);
    expect(open.radiusTopRight).toBe(radii.control);
    expect(open.radiusBottomRight).toBe(radii.control);
    expect(open.radiusTopLeft).toBe(0);
    expect(open.radiusBottomLeft).toBe(0);

    const pin = swipeRowCardFrame(80);
    expect(pin.radiusTopLeft).toBe(radii.control);
    expect(pin.radiusBottomLeft).toBe(radii.control);
    expect(pin.radiusTopRight).toBe(0);
    expect(pin.radiusBottomRight).toBe(0);
    expect(pin.marginLeft).toBe(0);
    expect(pin.marginRight).toBe(0);
  });

  test("closed rows use the grouped card corners and open rows keep the resting side", () => {
    const closed = swipeRowCardFrame(0, true, true);
    expect(closed.radiusTopLeft).toBe(radii.card);
    expect(closed.radiusTopRight).toBe(radii.card);
    expect(closed.radiusBottomLeft).toBe(radii.card);
    expect(closed.radiusBottomRight).toBe(radii.card);
    expect(swipeRowClosedCorners(true, false)).toMatchObject({
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderTopLeftRadius: radii.card,
      borderTopRightRadius: radii.card,
      overflow: "hidden",
    });
    expect(swipeRowClosedCorners(false, false)).toMatchObject({
      borderBottomLeftRadius: 0,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    });

    const midway = swipeRowCardFrame(-12, true, false);
    expect(midway.radiusTopLeft).toBe(radii.card);
    expect(midway.radiusBottomLeft).toBe(0);
    expect(midway.radiusTopRight).toBeCloseTo((radii.card + radii.control) / 2);
    expect(midway.radiusBottomRight).toBeCloseTo(radii.control / 2);
    expect(midway.marginLeft).toBe(0);
    expect(midway.marginRight).toBe(0);
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
      expect(open.marginLeft).toBe(0);
      expect(open.marginRight).toBe(0);
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
      expect(swipeRowActionReveal(0, 132, edge)).toEqual({ scale: 0, width: 0 });
      expect(swipeRowActionReveal(0.5, 132, edge)).toEqual({ scale: 0, width: 0 });
      expect(swipeRowActionReveal(-0.5, 132, edge)).toEqual({ scale: 0, width: 0 });
      expect(swipeRowActionReveal(0, 0, edge)).toEqual({ scale: 0, width: 0 });
      expect(swipeRowActionReveal(-40, 0, edge)).toEqual({ scale: 0, width: 0 });
      expect(swipeRowActionReveal(-40, -8, edge)).toEqual({ scale: 0, width: 0 });
      expect(swipeRowActionReveal(Number.NaN, 132, edge)).toEqual({ scale: 0, width: 0 });
      expect(swipeRowActionReveal(Number.POSITIVE_INFINITY, 132, edge)).toEqual({
        scale: 0,
        width: 0,
      });
    }
  });

  test("an open gap sizes only that slot and scales the buttons with it", () => {
    const bay = 132;
    for (const offset of [-24, -40, -120, -200, 24, 80, 200]) {
      const frame = swipeRowCardFrame(offset);
      const trailing = swipeRowActionReveal(offset, bay, "trailing");
      const leading = swipeRowActionReveal(offset, bay, "leading");
      expect(frame.marginLeft).toBe(0);
      expect(frame.marginRight).toBe(0);
      const opened = Math.abs(offset);
      if (offset < 0) {
        expect(leading).toEqual({ scale: 0, width: 0 });
        expect(trailing.width).toBe(Math.min(opened, bay));
        expect(trailing.scale).toBeCloseTo(trailing.width / bay);
      } else {
        expect(trailing).toEqual({ scale: 0, width: 0 });
        expect(leading.width).toBe(Math.min(opened, bay));
        expect(leading.scale).toBeCloseTo(leading.width / bay);
      }
    }

    expect(swipeRowActionReveal(-40, 132, "trailing")).toEqual({ scale: 40 / 132, width: 40 });
    expect(swipeRowActionReveal(-200, 132, "trailing")).toEqual({ scale: 1, width: 132 });
    expect(swipeRowActionReveal(80, 76, "leading")).toEqual({ scale: 1, width: 76 });
    const barely = swipeRowActionReveal(SWIPE_ROW_CLOSED_EPSILON + 0.01, 132, "leading");
    expect(barely.width).toBeCloseTo(0.51);
    expect(barely.scale).toBeCloseTo(0.51 / 132);
    expect(swipeRowActionOrigin("leading")).toBe("left center");
    expect(swipeRowActionOrigin("trailing")).toBe("right center");

    const outer = swipeRowButtonSpan(0, 2);
    const inner = swipeRowButtonSpan(1, 2);
    expect(outer).toBe(SWIPE_ROW_BUTTON_EDGE + SWIPE_ROW_ACTION_SIZE + SWIPE_ROW_ITEM_INSET);
    expect(inner).toBe(SWIPE_ROW_ACTION_GAP + SWIPE_ROW_ACTION_SIZE);
    expect(SWIPE_ROW_ITEM_INSET).toBeLessThan(SWIPE_ROW_BUTTON_EDGE + SWIPE_ROW_ACTION_GAP);
    expect(outer + inner).toBe(swipeRowBayWidth(2));
    expect(swipeRowButtonReveal(outer / 2, 0, 2).scale).toBeCloseTo(0.5);
    expect(swipeRowButtonReveal(outer / 2, 1, 2)).toEqual({ scale: 0, width: 0 });
    expect(swipeRowButtonReveal(outer, 0, 2).scale).toBe(1);
    expect(swipeRowButtonReveal(outer, 1, 2)).toEqual({ scale: 0, width: 0 });
    expect(swipeRowButtonReveal(outer + inner / 2, 1, 2).scale).toBeCloseTo(0.5);
    expect(swipeRowButtonReveal(outer + inner, 1, 2).scale).toBe(1);
    expect(swipeRowButtonSpan(0, 1)).toBe(
      SWIPE_ROW_BUTTON_EDGE + SWIPE_ROW_ACTION_SIZE + SWIPE_ROW_ITEM_INSET,
    );
    expect(swipeRowButtonSpan(0, 1)).toBe(swipeRowBayWidth(1));

    expect(SWIPE_ROW_BUTTON_MIN_SCALE).toBeGreaterThan(0);
    expect(SWIPE_ROW_BUTTON_MIN_SCALE).toBeLessThan(0.5);
    expect(SWIPE_ROW_BUTTON_FADE_MS).toBeGreaterThan(0);
    expect(swipeRowButtonShownScale(1)).toBe(1);
    expect(swipeRowButtonShownScale(SWIPE_ROW_BUTTON_MIN_SCALE)).toBe(SWIPE_ROW_BUTTON_MIN_SCALE);
    expect(swipeRowButtonShownScale(SWIPE_ROW_BUTTON_MIN_SCALE - 0.01)).toBe(
      SWIPE_ROW_BUTTON_MIN_SCALE,
    );
    expect(swipeRowButtonShownScale(0)).toBe(0);
  });

  test("press and open share one row fill", () => {
    expect(
      swipeRowSurfaceColor(0, false, {
        mutedPressed: lightColors.mutedPressed,
        secondaryBackground: lightColors.secondaryBackground,
      }),
    ).toBe("transparent");
    expect(
      swipeRowSurfaceColor(0, true, {
        mutedPressed: lightColors.mutedPressed,
        secondaryBackground: lightColors.secondaryBackground,
      }),
    ).toBe(lightColors.mutedPressed);
    expect(
      swipeRowSurfaceColor(-40, true, {
        mutedPressed: darkColors.mutedPressed,
        secondaryBackground: darkColors.secondaryBackground,
      }),
    ).toBe(darkColors.secondaryBackground);
    expect(
      swipeRowSurfaceColor(SWIPE_ROW_CLOSED_EPSILON, true, {
        mutedPressed: darkColors.mutedPressed,
        secondaryBackground: darkColors.secondaryBackground,
      }),
    ).toBe(darkColors.mutedPressed);
    expect(swipeRowSurfaceOpacity(0)).toBe(0);
    expect(swipeRowSurfaceOpacity(SWIPE_ROW_CLOSED_EPSILON)).toBe(0);
    expect(swipeRowSurfaceOpacity(SWIPE_ROW_SURFACE_FADE / 2)).toBeCloseTo(0.5);
    expect(swipeRowSurfaceOpacity(SWIPE_ROW_SURFACE_FADE)).toBe(1);
    expect(swipeRowSurfaceOpacity(-SWIPE_ROW_SURFACE_FADE * 2)).toBe(1);
  });

  test("the row source places actions beside the row and uses one press fill", () => {
    const source = readFileSync(new URL("./swipe-row.tsx", import.meta.url), "utf8");
    expect(source).toContain("swipeRowActionReveal(offset.get(), width.get(), align)");
    expect(source).toContain("swipeRowButtonReveal");
    expect(source).toContain("swipeRowSurfaceColor");
    expect(source).toContain("swipeRowSurfaceOpacity");
    expect(source).toContain("SEPARATOR_THICKNESS");
    expect(source).toContain('position: "absolute"');
    expect(source).toContain('flexDirection: "row"');
    expect(source).toContain("flexShrink: 0");
    expect(source.split("swipeRowClosedCorners(roundedTop, roundedBottom)").length - 1).toBe(2);
    expect(source).toContain("SWIPE_ROW_ITEM_INSET");
    expect(source).toContain("SWIPE_ROW_BUTTON_EDGE");
    expect(source).toContain("swipeRowButtonShownScale");
    expect(source).toContain("SWIPE_ROW_BUTTON_FADE_MS");
    expect(source).toContain("opacity: presence.get()");
    expect(source).toContain("transform: [{ scale: shown }]");
    expect(source).toContain("width: size");
    expect(source).toContain('overflow: "hidden"');
    expect(source).not.toContain("minWidth: 0");
    expect(source).toContain("theme.colors.mutedPressed");
    expect(source).toContain("swipeRowIsOpen");
    expect(source).toContain("swipeRowDragOffset");
    expect(source).toContain("swipeRowReleaseTarget");
    expect(source).toContain("withSpring");
    expect(source).toContain("swipeRowSettleVelocity");
    expect(source).not.toContain("zIndex");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toContain("theme.colors.background");
    expect(source).not.toContain("theme.colors.cardElevated");

    const closed = swipeRowOpenChrome(false, lightColors);
    expect(closed.cardBackground).toBe("transparent");
    expect(closed.wellBackground).toBe("transparent");
    expect(swipeRowActionReveal(0, 132, "trailing")).toEqual({ scale: 0, width: 0 });
    expect(swipeRowActionReveal(0, 76, "leading")).toEqual({ scale: 0, width: 0 });

    const section = readFileSync(new URL("../layout/app-screen.tsx", import.meta.url), "utf8");
    const sectionSource = section.slice(
      section.indexOf("export function Section"),
      section.indexOf("export function EmptyState"),
    );
    expect(sectionSource).toContain('{ minHeight: 1, overflow: "visible" }');
    expect(sectionSource).toContain('overflow: "hidden"');
    expect(sectionSource).toContain("radii.card");
    expect(sectionSource).not.toContain('overflow: clip ? "hidden" : "visible"');
  });

  test("the swipe row does not hardcode colors", () => {
    const source = readFileSync(new URL("./swipe-row.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).toContain("theme.colors.secondaryBackground");
    expect(source).toContain("leading].reverse().map");
    expect(source).toContain("trailing.map");
    expect(source).not.toContain("theme.colors.swipeArchive");
    expect(source).not.toContain("theme.colors.swipeDelete");
    expect(source).not.toContain("theme.colors.swipePin");
    expect(source).not.toContain("theme.colors.background");
    expect(source).toContain("onRevealedChange");
    for (const file of [
      "../../features/sessions/session-row-list.tsx",
      "../../features/workspaces/WorkspaceHomeList.tsx",
      "../../features/workspaces/WorkspaceEntryScreen.tsx",
    ]) {
      const caller = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(caller).toContain("SwipeRow");
      expect(caller).toContain("swipePin");
      expect(caller).toContain("ctaLabel");
    }
  });
});

function rgbSum(hex: string) {
  return (
    Number.parseInt(hex.slice(1, 3), 16) +
    Number.parseInt(hex.slice(3, 5), 16) +
    Number.parseInt(hex.slice(5, 7), 16)
  );
}
