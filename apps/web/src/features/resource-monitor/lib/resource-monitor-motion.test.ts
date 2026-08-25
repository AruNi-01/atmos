import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RESOURCE_MONITOR_BAR_DURATION_MS,
  RESOURCE_MONITOR_BAR_EASING,
  RESOURCE_MONITOR_CHART_DURATION_MS,
  RESOURCE_MONITOR_CHART_EASING,
  resourceMonitorChartAnimationActive,
} from "@/features/resource-monitor/lib/resource-monitor-motion";

describe("resourceMonitorChartAnimationActive", () => {
  test("honors an explicit reduced-motion flag before matchMedia", () => {
    expect(resourceMonitorChartAnimationActive(true)).toBe(false);
    expect(resourceMonitorChartAnimationActive(false)).toBe(true);
    expect(resourceMonitorChartAnimationActive(null)).toBe(true);
  });
});

describe("resource monitor motion classes", () => {
  test("UsageBar uses scaleX with reduced-motion none", () => {
    const barSrc = readFileSync(
      join(import.meta.dir, "../components/ResourceMonitorUsageBar.tsx"),
      "utf8",
    );
    expect(barSrc).toContain("origin-left");
    expect(barSrc).toContain("scaleX");
    expect(barSrc).toContain("motion-reduce:transition-none");
    expect(barSrc).toContain("RESOURCE_MONITOR_BAR_EASING");
    expect(barSrc).toContain("RESOURCE_MONITOR_BAR_DURATION_MS");
    expect(RESOURCE_MONITOR_BAR_EASING).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
    expect(RESOURCE_MONITOR_BAR_DURATION_MS).toBe(600);
    expect(barSrc).not.toContain("style={{ width:");
  });

  test("Host chart enables 450ms ease-out unless reduced", () => {
    const chartSrc = readFileSync(
      join(import.meta.dir, "../components/ResourceMonitorHostChart.tsx"),
      "utf8",
    );
    expect(chartSrc).toContain("useReducedMotion");
    expect(chartSrc).toContain("resourceMonitorChartAnimationActive");
    expect(chartSrc).toContain("isAnimationActive={animateLines}");
    expect(chartSrc).toContain("RESOURCE_MONITOR_CHART_DURATION_MS");
    expect(chartSrc).toContain("RESOURCE_MONITOR_CHART_EASING");
    expect(RESOURCE_MONITOR_CHART_DURATION_MS).toBe(450);
    expect(RESOURCE_MONITOR_CHART_EASING).toBe("ease-out");
  });
});
