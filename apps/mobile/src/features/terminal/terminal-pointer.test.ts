// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  fingerScrollTarget,
  fingerWheelReports,
  pointerMovedFarEnough,
  selectionToolbarHandle,
  terminalCellFromPoint,
  terminalSelectionEnd,
  wordSpanInLine,
} from "./terminal-pointer";

describe("terminal pointer gestures", () => {
  test("treats a small movement as a click", () => {
    expect(pointerMovedFarEnough(3, 4)).toBe(false);
    expect(pointerMovedFarEnough(8, 0)).toBe(true);
  });

  test("maps a point to the terminal cell under it", () => {
    expect(
      terminalCellFromPoint({
        cellHeight: 20,
        cellWidth: 10,
        clientX: 36,
        clientY: 55,
        cols: 80,
        originX: 10,
        originY: 15,
        rows: 24,
        viewportY: 4,
      }),
    ).toEqual([2, 6]);
  });

  test("clamps points outside the grid", () => {
    expect(
      terminalCellFromPoint({
        cellHeight: 20,
        cellWidth: 10,
        clientX: -40,
        clientY: 900,
        cols: 40,
        originX: 0,
        originY: 0,
        rows: 10,
        viewportY: 0,
      }),
    ).toEqual([0, 9]);
  });

  test("selects the word under a column", () => {
    expect(wordSpanInLine("cd ~/src/app", 4)).toEqual({ start: 3, end: 12 });
    expect(wordSpanInLine("hello", 0)).toEqual({ start: 0, end: 5 });
    expect(wordSpanInLine("a b", 1)).toEqual({ start: 1, end: 2 });
  });

  test("sends wheel reports while a TUI owns the scroll", () => {
    expect(fingerScrollTarget({ bufferType: "normal", mouseTrackingMode: "vt200" })).toBe("application");
    expect(fingerScrollTarget({ bufferType: "alternate", mouseTrackingMode: "none" })).toBe("application");
    expect(fingerScrollTarget({ bufferType: "normal", mouseTrackingMode: "none" })).toBe("local");
  });

  test("turns a downward drag into wheel-up reports", () => {
    expect(fingerWheelReports(3)).toEqual({ appliedLines: 3, count: 3, deltaY: -1 });
    expect(fingerWheelReports(-2)).toEqual({ appliedLines: -2, count: 2, deltaY: 1 });
    expect(fingerWheelReports(0)).toBeNull();
    expect(fingerWheelReports(40)?.count).toBe(12);
  });

  test("places the toolbar on the handle that was dragged", () => {
    const start = { y: 40 };
    const end = { y: 12 };
    expect(selectionToolbarHandle(start, end, "end")).toBe(end);
    expect(selectionToolbarHandle(start, end, "start")).toBe(start);
    expect(selectionToolbarHandle(start, null, "end")).toBe(start);
  });

  test("includes the cell under the finger in a forward selection", () => {
    expect(terminalSelectionEnd([1, 2], [1, 2], 80)).toEqual([2, 2]);
    expect(terminalSelectionEnd([1, 2], [4, 2], 80)).toEqual([5, 2]);
    expect(terminalSelectionEnd([4, 3], [1, 3], 80)).toEqual([1, 3]);
  });
});
