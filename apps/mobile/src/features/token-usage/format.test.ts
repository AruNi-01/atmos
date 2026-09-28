// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { formatCompactNumber, formatCurrencyCompact } from "./format";

describe("token usage formatting", () => {
  test("compacts large token counts the way the web cards do", () => {
    expect(formatCompactNumber(17_991_058_199)).toBe("18.0B");
    expect(formatCompactNumber(55_303)).toBe("55.3K");
    expect(formatCompactNumber(252)).toBe("252");
  });

  test("compacts cost with a dollar prefix", () => {
    expect(formatCurrencyCompact(16_512.9)).toBe("$16.5K");
  });
});
