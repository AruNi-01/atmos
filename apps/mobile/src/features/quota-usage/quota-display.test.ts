// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const usageScreen = readFileSync(join(dir, "QuotaUsageScreen.tsx"), "utf8");
const settingsScreen = readFileSync(join(dir, "QuotaSettingsScreen.tsx"), "utf8");

describe("quota usage display source", () => {
  test("renders the percent suffix outside NumberFlow and does not shrink it", () => {
    expect(usageScreen).toContain("format={(next) => `${Math.round(next)}`}");
    expect(usageScreen).not.toContain("format={(next) => `${Math.round(next)}%`}");
    expect(usageScreen).toContain("<Text style={style}>%</Text>");
    expect(usageScreen).toContain("flexShrink: 0");
    expect(usageScreen).toContain("percentReadout");
  });

  test("shows the plan once, under the provider name", () => {
    expect(usageScreen.match(/heading\.plan/g)).toEqual(["heading.plan"]);
    expect(usageScreen).toContain("billingPeriodLabel");
    expect(usageScreen).not.toContain("{heading.plan}");
  });

  test("pins All providers and animates the sorted provider rows", () => {
    const providersSection = settingsScreen.slice(settingsScreen.indexOf('label="Providers"'));
    const allProviders = providersSection.indexOf('title="All providers"');
    const sortedRows = providersSection.indexOf("orderedProviders.map");
    expect(allProviders).toBeGreaterThan(-1);
    expect(sortedRows).toBeGreaterThan(allProviders);
    expect(settingsScreen).toContain("sortQuotaProvidersForSwitchList");
    expect(settingsScreen).toContain("LinearTransition");
    expect(settingsScreen).toContain("clip={false}");
    expect(settingsScreen).toContain("collapsable={false}");
  });
});
