import { describe, expect, test } from "bun:test";

import { formatQuotaBillingPeriod } from "./time";

describe("formatQuotaBillingPeriod", () => {
  test("rewrites an ISO arrow range in UTC", () => {
    expect(
      formatQuotaBillingPeriod(
        "2026-09-04T22:17:47.739583+00:00 → 2026-09-11T22:17:47.739583+00:00",
      ),
    ).toBe("Sep 4 - Sep 11");
  });

  test("rewrites an ISO hyphen range", () => {
    expect(formatQuotaBillingPeriod("2026-09-04T00:00:00Z - 2026-09-11T00:00:00Z")).toBe(
      "Sep 4 - Sep 11",
    );
  });

  test("leaves a Factory month-day span unchanged", () => {
    expect(formatQuotaBillingPeriod("Sep 4 - Sep 11")).toBe("Sep 4 - Sep 11");
  });

  test("leaves a Zed date-only arrow range unchanged", () => {
    expect(formatQuotaBillingPeriod("2026-03-16 → 2026-03-30")).toBe("2026-03-16 → 2026-03-30");
  });

  test("returns null for empty input", () => {
    expect(formatQuotaBillingPeriod(null)).toBeNull();
    expect(formatQuotaBillingPeriod("  ")).toBeNull();
  });
});
