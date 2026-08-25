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
const sessionNameSrc = readFileSync(
  join(import.meta.dir, "../components/ResourceMonitorSessionName.tsx"),
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
    expect(barSrc).toContain("resourceMonitorDitherTrackColor");
    expect(barSrc).toContain("trackColor={trackColor}");
    expect(barSrc).toContain('data-resource-monitor-usage-bar=""');
    expect(barSrc).toContain("aria-hidden");
    expect(barSrc).not.toContain("scaleX");
    expect(barSrc).not.toContain("origin-left");
    expect(barSrc).not.toContain("resource-monitor-motion");
    expect(barSrc).not.toContain("recharts");
    expect((barSrc.match(/DitherFunnel/g) ?? []).length).toBe(2);
  });

  test("Host chart uses two compact DitherGrowth tracks and no RevenueLines/Recharts", () => {
    expect(chartSrc).toContain("DitherGrowth");
    expect(chartSrc).toContain("yMax={100}");
    expect(chartSrc).toContain("compact");
    expect(chartSrc).toContain("valueLabel={label}");
    expect(chartSrc).toContain("resourceMonitorGrowthColorStops");
    expect(chartSrc).toContain("colorStops=");
    expect(chartSrc).toContain("getTooltipLines=");
    expect(chartSrc).toContain("formatMemoryPair");
    expect(chartSrc).toContain('data-resource-monitor-chart=""');
    expect(chartSrc).toContain('role="img"');
    expect(chartSrc).toContain('data-resource-monitor-collecting=""');
    expect(chartSrc).toContain("formatHostHistoryLocalTime");
    expect(chartSrc).toContain("formatPercent");
    expect(chartSrc).not.toContain("DitherRevenueLines");
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
    expect(hostSrc).toContain("ServerGauge");
    expect(diskSrc).toContain("ResourceMonitorUsageBar");
    expect(diskSrc).toContain('tone="pressure"');
    expect(diskSrc).toContain("diskDefaultOpen");
    expect(hierarchySrc).not.toContain("ResourceMonitorUsageBar");
    expect(hierarchySrc).not.toContain("DitherFunnel");
    expect(diskSrc).toContain('href="/disk-analyzer"');
    expect(footerSrc).not.toContain("DitherFunnel");
  });

  test("session titles reuse agent icons and fall back to the Terminal icon", () => {
    expect(sessionNameSrc).toContain("AgentIcon");
    expect(sessionNameSrc).toContain('iconType === "built-in"');
    expect(sessionNameSrc).toContain('iconType === "custom"');
    expect(sessionNameSrc).toContain("TerminalIcon");
  });

  test("Footer swaps Monitor for usage on hover with reduced-motion support", () => {
    expect(footerSrc).toContain("AnimatePresence");
    expect(footerSrc).toContain("useReducedMotion");
    expect(footerSrc).toContain("previewing");
    expect(footerSrc).toContain('key="label"');
    expect(footerSrc).toContain('key="usage"');
    expect(footerSrc).toContain('t("monitor")');
    expect(footerSrc).toContain("width: previewing ? 124 : 52");
    expect(footerSrc).toContain('type: "spring"');
    expect(footerSrc).not.toContain("min-w-[7.75rem]");
  });

  test("Workspace rows carry a localized Workspace badge", () => {
    expect(hierarchySrc).toContain("data-resource-monitor-workspace-badge");
    expect(hierarchySrc).toContain('t("workspaceBadge")');
  });
});
