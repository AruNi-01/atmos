import { describe, expect, test } from "bun:test";
import {
  RESIZE_CLICK_SLOP_PX,
  isResizeClickGesture,
} from "@/app-shell/resize-click-fold";

describe("resize click fold", () => {
  test("treats a still pointer as a click", () => {
    expect(
      isResizeClickGesture({ x: 10, y: 40 }, { x: 10, y: 40 }, "vertical"),
    ).toBe(true);
  });

  test("ignores movement along the seam", () => {
    expect(
      isResizeClickGesture({ x: 10, y: 40 }, { x: 10, y: 200 }, "vertical"),
    ).toBe(true);
    expect(
      isResizeClickGesture({ x: 10, y: 40 }, { x: 200, y: 40 }, "horizontal"),
    ).toBe(true);
  });

  test("cross-axis movement past slop is a drag", () => {
    expect(
      isResizeClickGesture(
        { x: 10, y: 40 },
        { x: 10 + RESIZE_CLICK_SLOP_PX, y: 40 },
        "vertical",
      ),
    ).toBe(true);
    expect(
      isResizeClickGesture(
        { x: 10, y: 40 },
        { x: 10 + RESIZE_CLICK_SLOP_PX + 1, y: 40 },
        "vertical",
      ),
    ).toBe(false);
  });
});
