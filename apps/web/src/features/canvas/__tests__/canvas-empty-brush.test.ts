import { describe, expect, it } from "bun:test";

import {
  isEmptyBrushRegionEligible,
  normalizeCanvasPageRect,
  shouldOpenEmptyBrushAddWidget,
  EMPTY_BRUSH_MIN_PAGE_SIZE,
} from "../lib/canvas-empty-brush";

describe("normalizeCanvasPageRect", () => {
  it("normalizes negative width/height into a positive origin+size rect", () => {
    expect(
      normalizeCanvasPageRect({
        x: 200,
        y: 100,
        w: -80,
        h: -40,
      }),
    ).toEqual({
      x: 120,
      y: 60,
      w: 80,
      h: 40,
    });
  });

  it("returns null for invalid numbers", () => {
    expect(normalizeCanvasPageRect({ x: Number.NaN, y: 0, w: 10, h: 10 })).toBeNull();
    expect(normalizeCanvasPageRect(null)).toBeNull();
    expect(normalizeCanvasPageRect(undefined)).toBeNull();
  });
});

describe("isEmptyBrushRegionEligible", () => {
  it("requires both dimensions to meet the minimum", () => {
    expect(
      isEmptyBrushRegionEligible({
        x: 0,
        y: 0,
        w: EMPTY_BRUSH_MIN_PAGE_SIZE,
        h: EMPTY_BRUSH_MIN_PAGE_SIZE,
      }),
    ).toBe(true);
    expect(
      isEmptyBrushRegionEligible({
        x: 0,
        y: 0,
        w: EMPTY_BRUSH_MIN_PAGE_SIZE - 1,
        h: EMPTY_BRUSH_MIN_PAGE_SIZE,
      }),
    ).toBe(false);
    expect(isEmptyBrushRegionEligible(null)).toBe(false);
  });
});

describe("shouldOpenEmptyBrushAddWidget", () => {
  const eligibleBrush = {
    x: 10,
    y: 20,
    w: EMPTY_BRUSH_MIN_PAGE_SIZE + 40,
    h: EMPTY_BRUSH_MIN_PAGE_SIZE + 20,
  };

  it("opens only for a completed empty marquee of sufficient size", () => {
    expect(
      shouldOpenEmptyBrushAddWidget({
        wasBrushing: true,
        selectedShapeIds: [],
        brush: eligibleBrush,
      }),
    ).toBe(true);
  });

  it("does not open when shapes were selected (default selection path)", () => {
    expect(
      shouldOpenEmptyBrushAddWidget({
        wasBrushing: true,
        selectedShapeIds: ["shape:1"],
        brush: eligibleBrush,
      }),
    ).toBe(false);
  });

  it("does not open when the brush was cancelled or never started", () => {
    expect(
      shouldOpenEmptyBrushAddWidget({
        wasBrushing: true,
        cancelled: true,
        selectedShapeIds: [],
        brush: eligibleBrush,
      }),
    ).toBe(false);
    expect(
      shouldOpenEmptyBrushAddWidget({
        wasBrushing: false,
        selectedShapeIds: [],
        brush: eligibleBrush,
      }),
    ).toBe(false);
  });

  it("does not open for tiny brushes", () => {
    expect(
      shouldOpenEmptyBrushAddWidget({
        wasBrushing: true,
        selectedShapeIds: [],
        brush: { x: 0, y: 0, w: 12, h: 12 },
      }),
    ).toBe(false);
  });
});
