import { describe, expect, it } from "bun:test";
import {
  getLeaves,
  removePaneFromLayoutTree,
  splitPaneInLayoutTree,
  updateSplitPercentageAtPath,
} from "@/features/terminal/lib/terminal-layout-tree";

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
});
