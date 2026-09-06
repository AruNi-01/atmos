import { describe, expect, test } from "bun:test";
import { panelFoldCursorClass } from "@/shared/lib/panel-fold";

describe("panelFoldCursorClass", () => {
  test("left panel points west to collapse and east to expand", () => {
    expect(panelFoldCursorClass("left", false)).toBe("cursor-w-resize");
    expect(panelFoldCursorClass("left", true)).toBe("cursor-e-resize");
  });

  test("right panel points east to collapse and west to expand", () => {
    expect(panelFoldCursorClass("right", false)).toBe("cursor-e-resize");
    expect(panelFoldCursorClass("right", true)).toBe("cursor-w-resize");
  });
});
