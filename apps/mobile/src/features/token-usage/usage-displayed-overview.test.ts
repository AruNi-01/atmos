// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { displayedOverview } from "./usage-displayed-overview";

describe("displayed overview while a Computer switch is in flight", () => {
  test("keeps the previous overview instead of zeros", () => {
    const previous = { summary: { total_cost_usd: 12.5 } };
    expect(displayedOverview(undefined, previous)).toBe(previous);
    expect(displayedOverview(null, previous)).toBe(previous);
    const next = { summary: { total_cost_usd: 3 } };
    expect(displayedOverview(next, previous)).toBe(next);
    expect(displayedOverview(undefined, null)).toBe(null);
  });
});
