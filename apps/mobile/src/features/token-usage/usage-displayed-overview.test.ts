// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { displayedOverview, publishOverview } from "./usage-displayed-overview";

describe("displayed overview while a Computer switch is in flight", () => {
  const previous = { summary: { total_cost_usd: 12.5 } };
  const next = { summary: { total_cost_usd: 3 } };

  test("keeps the previous overview instead of zeros while pending", () => {
    expect(
      displayedOverview({
        active: undefined,
        failed: false,
        pending: true,
        previous,
      }),
    ).toBe(previous);
    expect(
      displayedOverview({
        active: null,
        failed: false,
        pending: true,
        previous,
      }),
    ).toBe(previous);
    expect(
      displayedOverview({
        active: next,
        failed: false,
        pending: false,
        previous,
      }),
    ).toBe(next);
    expect(
      displayedOverview({
        active: undefined,
        failed: false,
        pending: true,
        previous: null,
      }),
    ).toBe(null);
  });

  test("drops the fallback when the active query fails or is idle", () => {
    expect(
      displayedOverview({
        active: undefined,
        failed: true,
        pending: false,
        previous,
      }),
    ).toBe(null);
    expect(
      displayedOverview({
        active: undefined,
        failed: true,
        pending: true,
        previous,
      }),
    ).toBe(null);
    expect(
      displayedOverview({
        active: undefined,
        failed: false,
        pending: false,
        previous,
      }),
    ).toBe(null);
  });

  test("publish uses only the active query payload", () => {
    expect(publishOverview(undefined)).toBe(null);
    expect(publishOverview(null)).toBe(null);
    expect(publishOverview(next)).toBe(next);
    expect(publishOverview(previous)).not.toBe(next);
  });
});
