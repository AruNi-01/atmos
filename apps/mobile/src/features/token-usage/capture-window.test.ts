// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { captureSliceWindow } from "./capture-window";

describe("capture slice window", () => {
  test("keeps the expanded title band as the crop", () => {
    const window = captureSliceWindow(180, 0, 59, 800);
    expect(window.topCrop).toBe(180);
    expect(window.baseShift).toBe(0);
    expect(window.windowHeight).toBe(620);
  });

  test("slides a scrolled page below the top fade", () => {
    const window = captureSliceWindow(-420, 0, 59, 800);
    expect(window.topCrop).toBe(59 + 44 + 64);
    expect(window.baseShift).toBe(window.topCrop + 420);
    expect(window.windowHeight).toBe(800 - window.topCrop);
  });

  test("measures the fade from the scroll view when it starts below the screen top", () => {
    const window = captureSliceWindow(-20, 59, 59, 700);
    expect(window.topCrop).toBe(44 + 64);
    expect(window.baseShift).toBe(window.topCrop + 20);
  });
});
