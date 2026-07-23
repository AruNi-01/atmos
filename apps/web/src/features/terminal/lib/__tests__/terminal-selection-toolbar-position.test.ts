import { describe, expect, it } from "bun:test";

import { clampSelectionToolbarPosition } from "../terminal-selection-toolbar-position";

describe("clampSelectionToolbarPosition", () => {
  const toolbar = { toolbarWidth: 320, toolbarHeight: 36 };
  const container = { containerWidth: 400, containerHeight: 300 };

  it("centers on the anchor when fully inside bounds", () => {
    const result = clampSelectionToolbarPosition({
      ...toolbar,
      ...container,
      anchor: { x: 200, y: 120 },
    });

    expect(result.left).toBe(200);
    expect(result.top).toBe(120 - 8 - 36);
    expect(result.placement).toBe("above");
  });

  it("shifts left so the right half stays inside near the right edge", () => {
    const result = clampSelectionToolbarPosition({
      ...toolbar,
      ...container,
      anchor: { x: 390, y: 120 },
    });

    // center max = 400 - 8 - 160 = 232
    expect(result.left).toBe(232);
    expect(result.left + toolbar.toolbarWidth / 2).toBeLessThanOrEqual(
      container.containerWidth - 8,
    );
  });

  it("shifts right so the left half stays inside near the left edge", () => {
    const result = clampSelectionToolbarPosition({
      ...toolbar,
      ...container,
      anchor: { x: 10, y: 120 },
    });

    // center min = 8 + 160 = 168
    expect(result.left).toBe(168);
    expect(result.left - toolbar.toolbarWidth / 2).toBeGreaterThanOrEqual(8);
  });

  it("flips below the anchor when there is not enough room above", () => {
    const result = clampSelectionToolbarPosition({
      ...toolbar,
      ...container,
      anchor: { x: 200, y: 20 },
    });

    expect(result.placement).toBe("below");
    expect(result.top).toBe(20 + 8);
  });

  it("clamps vertically when the toolbar is taller than the container", () => {
    const result = clampSelectionToolbarPosition({
      toolbarWidth: 100,
      toolbarHeight: 500,
      containerWidth: 400,
      containerHeight: 200,
      anchor: { x: 200, y: 100 },
    });

    expect(result.top).toBe(8);
  });

  it("centers horizontally when the toolbar is wider than the container", () => {
    const result = clampSelectionToolbarPosition({
      toolbarWidth: 500,
      toolbarHeight: 36,
      containerWidth: 300,
      containerHeight: 200,
      anchor: { x: 10, y: 100 },
    });

    expect(result.left).toBe(150);
  });
});
