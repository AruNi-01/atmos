import { describe, expect, it } from "bun:test";

import {
  clampSelectionToolbarPosition,
  selectionToolbarDensity,
} from "../terminal-selection-toolbar-position";

describe("clampSelectionToolbarPosition", () => {
  const toolbar = { toolbarWidth: 180, toolbarHeight: 36 };
  const container = { containerWidth: 400, containerHeight: 300 };

  it("expands right from the anchor when more space is on the right", () => {
    const result = clampSelectionToolbarPosition({
      ...toolbar,
      ...container,
      anchor: { x: 80, y: 120 },
    });

    expect(result.align).toBe("start");
    expect(result.left).toBe(80);
    expect(result.top).toBe(120 - 8 - 36);
    expect(result.placement).toBe("above");
  });

  it("expands left from the anchor when more space is on the left", () => {
    const result = clampSelectionToolbarPosition({
      ...toolbar,
      ...container,
      anchor: { x: 360, y: 120 },
    });

    expect(result.align).toBe("end");
    expect(result.left).toBe(360 - 180);
    expect(result.left + toolbar.toolbarWidth).toBeLessThanOrEqual(
      container.containerWidth - 8,
    );
  });

  it("clamps when expanding right would overflow the pane", () => {
    const result = clampSelectionToolbarPosition({
      toolbarWidth: 320,
      toolbarHeight: 36,
      ...container,
      anchor: { x: 200, y: 120 },
    });

    expect(result.left).toBe(400 - 8 - 320);
    expect(result.left + 320).toBeLessThanOrEqual(container.containerWidth - 8);
  });

  it("clamps when expanding left would overflow the pane", () => {
    const result = clampSelectionToolbarPosition({
      toolbarWidth: 320,
      toolbarHeight: 36,
      ...container,
      // Prefer growing left (more space on that side) but 320px cannot
      // start at 250 without crossing the left margin.
      anchor: { x: 250, y: 120 },
    });

    expect(result.align).toBe("end");
    expect(result.left).toBe(8);
  });

  it("flips below the anchor when there is not enough room above", () => {
    const result = clampSelectionToolbarPosition({
      ...toolbar,
      ...container,
      anchor: { x: 80, y: 20 },
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

  it("pins to the margin when the toolbar is wider than the container", () => {
    const result = clampSelectionToolbarPosition({
      toolbarWidth: 500,
      toolbarHeight: 36,
      containerWidth: 300,
      containerHeight: 200,
      anchor: { x: 10, y: 100 },
    });

    expect(result.left).toBe(8);
    expect(result.align).toBe("start");
  });
});

describe("selectionToolbarDensity", () => {
  it("keeps labels when the pane is wide enough", () => {
    expect(
      selectionToolbarDensity({
        labeledWidth: 280,
        containerWidth: 400,
        margin: 8,
      }),
    ).toBe("labeled");
  });

  it("switches to icon-only when labeled buttons would overflow", () => {
    expect(
      selectionToolbarDensity({
        labeledWidth: 280,
        containerWidth: 200,
        margin: 8,
      }),
    ).toBe("icon");
  });

  it("stays labeled until a real width has been measured", () => {
    expect(
      selectionToolbarDensity({
        labeledWidth: 0,
        containerWidth: 80,
      }),
    ).toBe("labeled");
  });
});
