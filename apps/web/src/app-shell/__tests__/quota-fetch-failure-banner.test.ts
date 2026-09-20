import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const popover = readFileSync(join(import.meta.dir, "../QuotaPopover.tsx"), "utf8");

describe("quota fetch failure banner", () => {
  it("keeps last numbers and puts the latest fetch failure at the top", () => {
    expect(popover).toContain("formatQuotaFetchFailureMessage");
    expect(popover).toContain("overview && fetchFailureMessage");
    expect(popover).toContain("<QuotaFetchFailureBanner");
    expect(popover).toContain("error && !overview");
    expect(popover).not.toContain("error && overview ? error");
  });
});
