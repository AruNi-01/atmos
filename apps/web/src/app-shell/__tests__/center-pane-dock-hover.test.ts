import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  shouldIgnoreDockWhileOverSource,
  shouldSuppressCenterPaneDockHover,
} from "@/app-shell/center-pane/center-pane-dock-hover";

const grid = readFileSync(
  join(import.meta.dir, "../center-pane/CenterPaneGrid.tsx"),
  "utf8",
);

const source = { left: 400, top: 80, width: 500, height: 640 };
const leftPane = { left: 16, top: 80, width: 380, height: 640 };

describe("center pane dock hover", () => {
  it("ignores docks while the pointer is still inside the source pane, including borders", () => {
    expect(shouldIgnoreDockWhileOverSource({ x: 650, y: 400 }, source)).toBe(true);
    expect(shouldIgnoreDockWhileOverSource({ x: 400, y: 80 }, source)).toBe(true);
    expect(shouldIgnoreDockWhileOverSource({ x: 900, y: 80 }, source)).toBe(true);
    expect(shouldIgnoreDockWhileOverSource({ x: 400, y: 720 }, source)).toBe(true);
    expect(shouldIgnoreDockWhileOverSource({ x: 650, y: 80 }, source)).toBe(true);
    expect(
      shouldSuppressCenterPaneDockHover({ x: 650, y: 80 }, source, [leftPane]),
    ).toBe(true);
  });

  it("allows docks only after the pointer is over another pane", () => {
    expect(
      shouldSuppressCenterPaneDockHover({ x: 200, y: 80 }, source, [leftPane]),
    ).toBe(false);
    expect(
      shouldSuppressCenterPaneDockHover({ x: 16, y: 80 }, source, [leftPane]),
    ).toBe(false);
  });

  it("keeps the mosaic gap and empty chrome inert", () => {
    expect(
      shouldSuppressCenterPaneDockHover({ x: 398, y: 80 }, source, [leftPane]),
    ).toBe(true);
    expect(
      shouldSuppressCenterPaneDockHover({ x: 650, y: 70 }, source, [leftPane]),
    ).toBe(true);
  });

  it("does not suppress when the pointer or source box is missing", () => {
    expect(shouldIgnoreDockWhileOverSource(null, source)).toBe(false);
    expect(shouldIgnoreDockWhileOverSource({ x: 650, y: 80 }, null)).toBe(false);
    expect(shouldSuppressCenterPaneDockHover(null, source, [leftPane])).toBe(false);
    expect(
      shouldIgnoreDockWhileOverSource({ x: 10, y: 10 }, { left: 0, top: 0, width: 0, height: 10 }),
    ).toBe(false);
  });

  it("wires source-rect suppression into mosaic drag hover", () => {
    expect(grid).toContain("shouldSuppressCenterPaneDockHover");
    expect(grid).toContain("sourceRectRef");
    expect(grid).toContain("otherRectsRef");
    expect(grid).toContain("collectOtherPaneRects");
  });
});
