import { describe, expect, it } from "bun:test";
import {
  collectTerminalLayoutGeometry,
  dockLeafAtRoot,
  dockLeafInLayoutTree,
  getLeaves,
  hitDockEdge,
  removePaneFromLayoutTree,
  splitPaneInLayoutTree,
  swapLeavesInLayoutTree,
  terminalLayoutTopologyEqual,
  updateSplitPercentageAtPath,
} from "@/features/terminal/lib/terminal-layout-tree";
import {
  dragPreviewGrabOffset,
  scaleTerminalDragPreview,
} from "@/features/terminal/lib/terminal-pane-drag-preview";
import {
  ansiPaletteColor,
  xtermCellCssColor,
} from "@/features/terminal/lib/terminal-xterm-preview";

describe("terminal-layout-tree", () => {
  it("splits a leaf into a row branch", () => {
    const next = splitPaneInLayoutTree("a", "a", "b", "row");
    expect(next).toEqual({
      direction: "row",
      first: "a",
      second: "b",
      splitPercentage: 50,
    });
    expect(getLeaves(next)).toEqual(["a", "b"]);
  });

  it("updates split percentage at a path", () => {
    const layout = splitPaneInLayoutTree("a", "a", "b", "column");
    const resized = updateSplitPercentageAtPath(layout, [], 33);
    expect(resized).toMatchObject({ splitPercentage: 33, direction: "column" });
  });

  it("removes a leaf and collapses the branch", () => {
    let layout = splitPaneInLayoutTree("a", "a", "b", "row");
    layout = splitPaneInLayoutTree(layout, "b", "c", "column");
    expect(getLeaves(layout).sort()).toEqual(["a", "b", "c"]);
    const withoutB = removePaneFromLayoutTree(layout, "b");
    expect(getLeaves(withoutB).sort()).toEqual(["a", "c"]);
  });

  it("swaps two leaves without changing split geometry", () => {
    const layout = {
      direction: "row" as const,
      first: "a",
      second: {
        direction: "column" as const,
        first: "b",
        second: "c",
        splitPercentage: 40,
      },
      splitPercentage: 30,
    };
    const swapped = swapLeavesInLayoutTree(layout, "a", "c");
    expect(swapped).toEqual({
      direction: "row",
      first: "c",
      second: {
        direction: "column",
        first: "b",
        second: "a",
        splitPercentage: 40,
      },
      splitPercentage: 30,
    });
    expect(swapLeavesInLayoutTree(layout, "a", "a")).toBe(layout);
  });

  it("docks a leaf below another leaf and rebuilds as a column", () => {
    const layout = splitPaneInLayoutTree("a", "a", "b", "row");
    const next = dockLeafInLayoutTree(layout, "a", "b", "bottom");
    expect(next).toEqual({
      direction: "column",
      first: "b",
      second: "a",
      splitPercentage: 50,
    });
  });

  it("docks a leaf to the left of a nested target", () => {
    let layout = splitPaneInLayoutTree("a", "a", "b", "row");
    layout = splitPaneInLayoutTree(layout, "b", "c", "column");
    const next = dockLeafInLayoutTree(layout, "a", "c", "left");
    expect(next).toEqual({
      direction: "column",
      first: "b",
      second: {
        direction: "row",
        first: "a",
        second: "c",
        splitPercentage: 50,
      },
      splitPercentage: 50,
    });
  });

  it("docks a leaf against the remaining tree at the root", () => {
    const layout = {
      direction: "row" as const,
      first: "a",
      second: {
        direction: "column" as const,
        first: "b",
        second: "c",
        splitPercentage: 40,
      },
      splitPercentage: 30,
    };
    const next = dockLeafAtRoot(layout, "a", "bottom");
    expect(next).toEqual({
      direction: "column",
      first: {
        direction: "column",
        first: "b",
        second: "c",
        splitPercentage: 40,
      },
      second: "a",
      splitPercentage: 50,
    });
  });

  it("returns the same tree when docking a pane onto itself", () => {
    const layout = splitPaneInLayoutTree("a", "a", "b", "row");
    expect(dockLeafInLayoutTree(layout, "a", "a", "bottom")).toBe(layout);
  });

  it("treats a dock that keeps the same topology as unchanged", () => {
    const layout = splitPaneInLayoutTree("a", "a", "b", "row");
    const next = dockLeafInLayoutTree(layout, "a", "b", "left");
    expect(terminalLayoutTopologyEqual(layout, next)).toBe(true);
    expect(terminalLayoutTopologyEqual(layout, dockLeafInLayoutTree(layout, "a", "b", "bottom"))).toBe(
      false,
    );
  });

  it("collects keyed leaf boxes so tiles can stay mounted across docks", () => {
    const layout = {
      direction: "row" as const,
      first: "a",
      second: {
        direction: "column" as const,
        first: "b",
        second: "c",
        splitPercentage: 40,
      },
      splitPercentage: 30,
    };
    const { leaves, splits } = collectTerminalLayoutGeometry(layout);
    expect(leaves.map((leaf) => leaf.id)).toEqual(["a", "b", "c"]);
    expect(leaves[0]).toMatchObject({ id: "a", left: 0, top: 0, width: 0.3, height: 1 });
    expect(leaves[1]).toMatchObject({ id: "b", left: 0.3, top: 0, width: 0.7, height: 0.4 });
    expect(leaves[2]).toMatchObject({ id: "c", left: 0.3, top: 0.4, width: 0.7, height: 0.6 });
    expect(splits).toHaveLength(2);
    expect(splits[0]).toMatchObject({ direction: "row", path: [] });
    expect(splits[1]).toMatchObject({ direction: "column", path: ["second"] });
  });

  it("picks mosaic-style dock edges from pointer position", () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    expect(hitDockEdge(rect, 50, 10)).toBe("top");
    expect(hitDockEdge(rect, 50, 90)).toBe("bottom");
    expect(hitDockEdge(rect, 10, 50)).toBe("left");
    expect(hitDockEdge(rect, 90, 50)).toBe("right");
    expect(hitDockEdge(rect, 8, 8)).toBe("top");
    expect(hitDockEdge(rect, 50, 50)).toBe("top");
  });
});

describe("terminal drag preview scale", () => {
  it("keeps the source pane aspect ratio while shrinking", () => {
    const wide = scaleTerminalDragPreview(900, 400);
    const tall = scaleTerminalDragPreview(280, 800);
    expect(wide.width / wide.height).toBeCloseTo(900 / 400, 2);
    expect(tall.height / tall.width).toBeCloseTo(800 / 280, 2);
    expect(wide.width).toBeLessThan(450);
    expect(tall.height).toBeLessThan(320);
    expect(wide.width).toBeGreaterThan(180);
  });

  it("anchors the pointer to the top-center of the preview", () => {
    const grab = dragPreviewGrabOffset(220);
    expect(grab.x).toBe(110);
    expect(grab.y).toBe(0);
  });
});

describe("xterm buffer preview colors", () => {
  it("maps palette and rgb cells", () => {
    expect(ansiPaletteColor(2)).toBe("#22c55e");
    expect(xtermCellCssColor(true, false, 0, "#09090b")).toBe("#09090b");
    expect(xtermCellCssColor(false, true, 0xff8800, "#fff")).toBe("rgb(255,136,0)");
    expect(xtermCellCssColor(false, false, 15, "#fff")).toBe("#fafafa");
  });
});
