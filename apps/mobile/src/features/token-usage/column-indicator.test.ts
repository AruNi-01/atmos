// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { columnIndicatorColor, columnIndicatorLine } from "./column-indicator";

describe("column indicator", () => {
  test("uses a dark stroke on light charts and a light stroke on dark charts", () => {
    expect(columnIndicatorColor(false)).toBe("rgba(15,23,42,0.45)");
    expect(columnIndicatorColor(true)).toBe("rgba(255,255,255,0.55)");
  });

  test("spans the full chart height at the selected column", () => {
    expect(columnIndicatorLine({ height: 220, x: 48 })).toEqual({
      x1: 48,
      x2: 48,
      y1: 0,
      y2: 220,
    });
  });
});
