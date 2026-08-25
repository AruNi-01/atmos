import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const barSrc = readFileSync(
  join(import.meta.dir, "../components/ResourceMonitorUsageBar.tsx"),
  "utf8",
);
const chartSrc = readFileSync(
  join(import.meta.dir, "../components/ResourceMonitorHostChart.tsx"),
  "utf8",
);
const hostSrc = readFileSync(
  join(import.meta.dir, "../components/ResourceMonitorHostSection.tsx"),
  "utf8",
);
const diskSrc = readFileSync(
  join(import.meta.dir, "../components/ResourceMonitorDiskSection.tsx"),
  "utf8",
);
const hierarchySrc = readFileSync(
  join(import.meta.dir, "../components/ResourceMonitorHierarchy.tsx"),
  "utf8",
);
const footerSrc = readFileSync(
  join(import.meta.dir, "../components/ResourceMonitorFooterItem.tsx"),
  "utf8",
);

describe("resource monitor dither structure", () => {
  test("UsageBar is a single-stage DitherFunnel without CSS scaleX", () => {
    expect(barSrc).toContain("DitherFunnel");
    expect(barSrc).toContain("maxValue={1}");
    expect(barSrc).toContain("gap={0}");
    expect(barSrc).toContain("percent / 100");
    expect(barSrc).toContain("useTheme");
    expect(barSrc).toContain("resourceMonitorDitherColor");
    expect(barSrc).toContain('data-resource-monitor-usage-bar=""');
    expect(barSrc).toContain("aria-hidden");
    expect(barSrc).not.toContain("scaleX");
    expect(barSrc).not.toContain("origin-left");
    expect(barSrc).not.toContain("resource-monitor-motion");
    expect(barSrc).not.toContain("recharts");
  });

  test("Host chart uses two single-series DitherRevenueLines tracks and no Recharts", () => {
    expect(chartSrc).toContain("DitherRevenueLines");
    expect(chartSrc).toContain("yMax={100}");
    expect(chartSrc).toContain('seriesId="cpu"');
    expect(chartSrc).toContain('seriesId="memory"');
    expect(chartSrc).toContain("resourceMonitorDitherColor");
    expect(chartSrc).toContain('data-resource-monitor-chart=""');
    expect(chartSrc).toContain('role="img"');
    expect(chartSrc).toContain('data-resource-monitor-collecting=""');
    expect(chartSrc).toContain("formatHostHistoryLocalTime");
    expect(chartSrc).toContain("formatPercent");
    expect(chartSrc).not.toContain("recharts");
    expect(chartSrc).not.toContain("LineChart");
    expect(chartSrc).not.toContain("useReducedMotion");
    expect(chartSrc).not.toContain("resource-monitor-motion");
    expect(chartSrc).not.toContain("ChartLegend");
  });

  test("CPU/memory meters and disks go through UsageBar; hierarchy and footer do not", () => {
    expect(hostSrc).toContain('tone="pressure"');
    expect(hostSrc).toContain('tone={kind === "used" || kind === "swap" ? "pressure" : "neutral"}');
    expect(hostSrc).toContain("ResourceMonitorUsageBar");
    expect(diskSrc).toContain("ResourceMonitorUsageBar");
    expect(diskSrc).toContain('tone="pressure"');
    expect(diskSrc).toContain("diskDefaultOpen");
    expect(hierarchySrc).not.toContain("ResourceMonitorUsageBar");
    expect(hierarchySrc).not.toContain("DitherFunnel");
    expect(footerSrc).not.toContain("disk");
    expect(footerSrc).not.toContain("DitherFunnel");
  });
});
