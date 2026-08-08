import { describe, expect, it } from "vitest";
import {
  moveItem,
  sameOrder,
  safeId,
  liquidPanelOnlyPath,
  liquidTabPath,
} from "../morphing-tabs-geometry";

describe("morphing-tabs-geometry", () => {
  it("sameOrder compares sequence equality", () => {
    expect(sameOrder(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameOrder(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameOrder(["a"], ["a", "b"])).toBe(false);
  });

  it("moveItem reorders without mutating source", () => {
    const order = ["a", "b", "c"];
    expect(moveItem(order, 0, 2)).toEqual(["b", "c", "a"]);
    expect(order).toEqual(["a", "b", "c"]);
    expect(moveItem(order, 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("safeId strips unsafe characters", () => {
    expect(safeId("foo/bar:baz")).toBe("foo-bar-baz");
  });

  it("liquid paths are non-empty SVG d strings", () => {
    expect(liquidPanelOnlyPath(200).startsWith("M")).toBe(true);
    expect(liquidTabPath(10, 200).startsWith("M")).toBe(true);
  });
});
