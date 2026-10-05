// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { flowParts, formatCompactNumber, formatCurrencyCompact, formatPercent } from "./format";

describe("token usage formatting", () => {
  test("compacts large token counts the way the web cards do", () => {
    expect(formatCompactNumber(17_991_058_199)).toBe("18.0B");
    expect(formatCompactNumber(55_303)).toBe("55.3K");
    expect(formatCompactNumber(252)).toBe("252");
  });

  test("compacts cost with a dollar prefix", () => {
    expect(formatCurrencyCompact(16_512.9)).toBe("$16.5K");
    expect(formatCurrencyCompact(-16_512.9)).toBe("-$16.5K");
  });

  test("keeps compact labels when split for digit rolling", () => {
    for (const label of [
      formatCompactNumber(17_991_058_199),
      formatCompactNumber(55_303),
      formatCompactNumber(252),
      formatCompactNumber(-1_200_000),
      formatCurrencyCompact(16_512.9),
      formatCurrencyCompact(-16_512.9),
      formatPercent(24.2),
      formatPercent(5.66),
      formatPercent(0.04),
    ]) {
      const parts = flowParts(label);
      expect(`${parts.prefix}${parts.value.toFixed(parts.fraction)}${parts.suffix}`).toBe(label);
    }
  });
});
