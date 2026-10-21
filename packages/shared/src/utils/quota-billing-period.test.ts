import { describe, expect, test } from "bun:test";

import { formatQuotaBillingBounds, formatQuotaBillingPeriod } from "./time";

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

  test("leaves non-ISO text unchanged, including a capital T", () => {
    expect(formatQuotaBillingPeriod("Tokens 1200")).toBe("Tokens 1200");
    expect(formatQuotaBillingPeriod("Thu Sep 4 2026")).toBe("Thu Sep 4 2026");
    expect(formatQuotaBillingPeriod("Team T")).toBe("Team T");
    expect(formatQuotaBillingPeriod("Thu Sep 4 2026 - Thu Sep 11 2026")).toBe(
      "Thu Sep 4 2026 - Thu Sep 11 2026",
    );
  });

  test("formats a single ISO instant and treats a missing offset as UTC", () => {
    expect(formatQuotaBillingPeriod("2026-09-04T00:00:00Z")).toBe("Sep 4");
    expect(formatQuotaBillingPeriod("2026-09-04T23:30:00")).toBe("Sep 4");
  });

  test("keeps Since and Until on a single boundary", () => {
    expect(formatQuotaBillingBounds(null, "2026-09-11T00:00:00Z")).toBe("Until Sep 11");
    expect(formatQuotaBillingBounds("2026-09-04T00:00:00Z", null)).toBe("Since Sep 4");
    expect(formatQuotaBillingBounds("2026-09-04T00:00:00Z", "2026-09-11T00:00:00Z")).toBe(
      "Sep 4 - Sep 11",
    );
    expect(formatQuotaBillingBounds(null, "Until Sep 11")).toBe("Until Sep 11");
    expect(formatQuotaBillingBounds("Since Sep 4", null)).toBe("Since Sep 4");
    expect(formatQuotaBillingBounds(null, null)).toBeNull();
  });
});
