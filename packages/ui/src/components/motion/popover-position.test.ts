import { describe, expect, it } from "bun:test";
import { popoverPortalCoords, type PortalLayout } from "./popover-position";

const layout: PortalLayout = {
  trigger: { left: 200, top: 100, width: 220, height: 36 },
  content: { width: 152, height: 80 },
};

describe("popoverPortalCoords", () => {
  it("places a right-side panel beside the trigger instead of above it", () => {
    expect(popoverPortalCoords("right", "start", layout, 8)).toEqual({
      side: "right",
      left: 428,
      top: 100,
    });
  });

  it("places a left-side panel beside the trigger", () => {
    expect(popoverPortalCoords("left", "start", layout, 8)).toEqual({
      side: "left",
      left: 40,
      top: 100,
    });
  });

  it("keeps top/bottom placement unchanged", () => {
    expect(popoverPortalCoords("top", "end", layout, 8)).toEqual({
      side: "top",
      left: 268,
      top: 12,
    });
    expect(popoverPortalCoords("bottom", "start", layout, 8)).toEqual({
      side: "bottom",
      left: 200,
      top: 144,
    });
  });

  it("flips a right-side panel left when it would overflow the viewport", () => {
    expect(
      popoverPortalCoords("right", "start", layout, 8, { width: 450, height: 800 }),
    ).toEqual({
      side: "left",
      left: 40,
      top: 100,
    });
  });
});
