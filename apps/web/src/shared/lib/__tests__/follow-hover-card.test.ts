import { describe, expect, it } from "bun:test";
import {
  clampFollowHoverHorizontal,
  computeFollowHoverOrigin,
  readFollowHoverPointerOffset,
  resolveFollowHoverPlacement,
} from "@/shared/lib/follow-hover-card";

describe("follow hover placement", () => {
  it("clamps the card center inside the viewport", () => {
    expect(clampFollowHoverHorizontal(10, 320, 800)).toBe(12 + 160);
    expect(clampFollowHoverHorizontal(790, 320, 800)).toBe(800 - 12 - 160);
    expect(clampFollowHoverHorizontal(400, 320, 800)).toBe(400);
  });

  it("prefers top when there is room, else the side with more space", () => {
    const topRect = { top: 400, bottom: 420, left: 0, right: 40, width: 40, height: 20 } as DOMRect;
    expect(resolveFollowHoverPlacement("auto", topRect, 220, 800)).toBe("top");

    const bottomRect = {
      top: 20,
      bottom: 40,
      left: 0,
      right: 40,
      width: 40,
      height: 20,
    } as DOMRect;
    const nearBottomRect = {
      top: 760,
      bottom: 780,
      left: 0,
      right: 40,
      width: 40,
      height: 20,
    } as DOMRect;
    expect(resolveFollowHoverPlacement("auto", bottomRect, 220, 800)).toBe("bottom");
    expect(resolveFollowHoverPlacement("bottom", topRect, 220, 800)).toBe("bottom");
    expect(resolveFollowHoverPlacement("bottom", nearBottomRect, 220, 800)).toBe("top");
    expect(resolveFollowHoverPlacement("top", bottomRect, 220, 800)).toBe("bottom");
  });

  it("anchors above or below the trigger", () => {
    const rect = { top: 100, bottom: 120, left: 10, right: 50, width: 40, height: 20 } as DOMRect;
    expect(computeFollowHoverOrigin(rect, "bottom")).toEqual({
      left: 30,
      top: 134,
      transformOrigin: "top center",
    });
    expect(computeFollowHoverOrigin(rect, "top")).toEqual({
      left: 30,
      top: 86,
      transformOrigin: "bottom center",
    });
  });

  it("maps pointer offset into the -20..20 follow range", () => {
    const rect = { left: 0, top: 0, width: 40, height: 20, right: 40, bottom: 20 } as DOMRect;
    expect(readFollowHoverPointerOffset(20, 10, rect)).toEqual({ nx: 0, ny: 0 });
    expect(readFollowHoverPointerOffset(40, 20, rect).nx).toBe(20);
    expect(readFollowHoverPointerOffset(-40, -40, rect).nx).toBe(-20);
  });
});
