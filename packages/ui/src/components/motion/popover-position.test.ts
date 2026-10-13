import { describe, expect, it } from "bun:test";
import { anchoredSizeScale, popoverPortalCoords, type PortalLayout } from "./popover-position";

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

  it("scales a wider popover in from the previous width", () => {
    expect(
      anchoredSizeScale({ width: 264, height: 320 }, { width: 360, height: 320 }),
    ).toEqual({ x: 264 / 360, y: 1 });
  });

  it("scales a narrower popover down from the previous width", () => {
    expect(
      anchoredSizeScale({ width: 360, height: 320 }, { width: 264, height: 320 }),
    ).toEqual({ x: 360 / 264, y: 1 });
  });

  it("continues from the scale already on screen", () => {
    expect(
      anchoredSizeScale(
        { width: 360, height: 320 },
        { width: 300, height: 320 },
        { x: 0.8, y: 1 },
      ),
    ).toEqual({ x: (360 * 0.8) / 300, y: 1 });
  });

  it("does not zoom in from an empty box", () => {
    expect(
      anchoredSizeScale({ width: 0, height: 0 }, { width: 264, height: 320 }),
    ).toBeNull();
  });

  it("skips a subpixel size change", () => {
    expect(
      anchoredSizeScale({ width: 264, height: 320 }, { width: 264.4, height: 320.2 }),
    ).toBeNull();
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
