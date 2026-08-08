import { describe, expect, it } from "bun:test";
import { computeWindowCropPixels } from "./window-crop.ts";

describe("computeWindowCropPixels", () => {
  const display = {
    x: 0,
    y: 0,
    width: 1512,
    height: 982,
    scaleFactor: 2,
  };

  it("crops a window on a Retina main display", () => {
    const crop = computeWindowCropPixels(
      { x: 100, y: 80, width: 800, height: 600 },
      3024,
      1964,
      display,
    );
    expect(crop).not.toBeNull();
    expect(crop!.x).toBe(200);
    expect(crop!.y).toBe(160);
    expect(crop!.width).toBe(1600);
    expect(crop!.height).toBe(1200);
  });

  it("rejects almost-full-display crops", () => {
    const crop = computeWindowCropPixels(
      { x: 0, y: 0, width: 1512, height: 982 },
      3024,
      1964,
      display,
    );
    expect(crop).toBeNull();
  });

  it("rejects tiny windows", () => {
    expect(
      computeWindowCropPixels(
        { x: 10, y: 10, width: 20, height: 20 },
        3024,
        1964,
        display,
      ),
    ).toBeNull();
  });

  it("clamps windows that extend past the display", () => {
    const crop = computeWindowCropPixels(
      { x: 1400, y: 900, width: 400, height: 200 },
      3024,
      1964,
      display,
    );
    expect(crop).not.toBeNull();
    expect(crop!.x + crop!.width).toBeLessThanOrEqual(3024);
    expect(crop!.y + crop!.height).toBeLessThanOrEqual(1964);
  });
});
