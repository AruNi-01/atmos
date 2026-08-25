import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ResourceMonitorSnapshot } from "@atmos/api-types/ws/dto/resource-monitor";
import { testHostMetrics, testSnapshot } from "@/features/resource-monitor/lib/resource-monitor-test-host";
import {
  resolveResourceMonitorUiState,
  resourceMonitorStatusBanners,
  resourceMonitorStatusTone,
  shouldRenderResourceMonitorSnapshot,
  shouldShowProjectsEmptyCopy,
} from "@/features/resource-monitor/lib/resource-monitor-ui-state";

const usage = { cpu_percent: 4, memory_rss_bytes: 2048, process_count: 1 };

function snapshot(
  overrides: Partial<ResourceMonitorSnapshot> = {},
): ResourceMonitorSnapshot {
  return testSnapshot({
    collected_at_ms: Date.now(),
    host: testHostMetrics({ logical_cpu_count: 10, cpu_percent: 18 }),
    server: usage,
    shared_runtime: usage,
    projects: [
      {
        project_id: "p1",
        name: "Atmos",
        usage,
        direct_usage: usage,
        sessions: [],
        workspaces: [],
        other_usage: { cpu_percent: 0, memory_rss_bytes: 0, process_count: 0 },
        other_processes: [],
      },
    ],
    ...overrides,
  });
}

const popoverSrc = readFileSync(
  join(import.meta.dir, "../components/ResourceMonitorPopover.tsx"),
  "utf8",
);

describe("resolveResourceMonitorUiState", () => {
  it("maps connection, loading, attribution, stale, empty, and ready snapshots", () => {
    expect(
      resolveResourceMonitorUiState({
        connectionState: "disconnected",
        isLoading: false,
      }),
    ).toBe("disconnected");
    expect(
      resolveResourceMonitorUiState({
        connectionState: "connected",
        isLoading: true,
      }),
    ).toBe("loading");
    expect(
      resolveResourceMonitorUiState({
        connectionState: "connected",
        isLoading: false,
        snapshot: snapshot({ attribution_status: "unsupported" }),
      }),
    ).toBe("unsupported");
    expect(
      resolveResourceMonitorUiState({
        connectionState: "connected",
        isLoading: false,
        snapshot: snapshot({ collected_at_ms: 1 }),
        lastUpdatedAtMs: 1,
        nowMs: 100_000,
      }),
    ).toBe("stale");
    expect(
      resolveResourceMonitorUiState({
        connectionState: "connected",
        isLoading: false,
        snapshot: snapshot({ attribution_status: "partial" }),
      }),
    ).toBe("partial");
    expect(
      resolveResourceMonitorUiState({
        connectionState: "connected",
        isLoading: false,
        snapshot: snapshot({ projects: [] }),
      }),
    ).toBe("empty");
    expect(
      resolveResourceMonitorUiState({
        connectionState: "connected",
        isLoading: false,
        lastUpdatedAtMs: 90_000,
        snapshot: snapshot(),
        nowMs: 100_000,
      }),
    ).toBe("ready");
  });

  it("ignores server collected_at_ms clock skew when judging stale", () => {
    const nowMs = 1_700_000_000;
    expect(
      resolveResourceMonitorUiState({
        connectionState: "connected",
        isLoading: false,
        snapshot: snapshot({ collected_at_ms: nowMs - 120_000 }),
        lastUpdatedAtMs: nowMs,
        nowMs,
      }),
    ).toBe("ready");
    expect(
      resolveResourceMonitorUiState({
        connectionState: "connected",
        isLoading: false,
        snapshot: snapshot({ collected_at_ms: nowMs + 60_000 }),
        lastUpdatedAtMs: nowMs - 60_000,
        nowMs,
      }),
    ).toBe("stale");
  });

  it("keeps stale as the primary state when attribution is also partial", () => {
    expect(
      resolveResourceMonitorUiState({
        connectionState: "connected",
        isLoading: false,
        snapshot: snapshot({ attribution_status: "partial", collected_at_ms: 1 }),
        lastUpdatedAtMs: 1,
        nowMs: 100_000,
      }),
    ).toBe("stale");
  });
});

describe("resourceMonitorStatusBanners", () => {
  it("shows stale and partial together only when the snapshot is stale and partial", () => {
    expect(
      resourceMonitorStatusBanners(
        "stale",
        snapshot({ attribution_status: "partial" }),
      ),
    ).toEqual(["stale", "partial"]);
    expect(
      resourceMonitorStatusBanners(
        "partial",
        snapshot({ attribution_status: "partial" }),
      ),
    ).toEqual(["partial"]);
    expect(
      resourceMonitorStatusBanners(
        "stale",
        snapshot({ attribution_status: "complete" }),
      ),
    ).toEqual(["stale"]);
    expect(resourceMonitorStatusBanners("ready", snapshot())).toEqual([]);
  });
});

describe("resource monitor snapshot visibility", () => {
  it("hides cached snapshot values while disconnected", () => {
    expect(shouldRenderResourceMonitorSnapshot("disconnected")).toBe(false);
    expect(shouldRenderResourceMonitorSnapshot("loading")).toBe(false);
    expect(shouldRenderResourceMonitorSnapshot("unsupported")).toBe(true);
    expect(shouldRenderResourceMonitorSnapshot("stale")).toBe(true);
    expect(shouldRenderResourceMonitorSnapshot("ready")).toBe(true);
  });

  it("shows the empty copy only when empty is not already the primary banner", () => {
    expect(shouldShowProjectsEmptyCopy("empty", 0)).toBe(false);
    expect(shouldShowProjectsEmptyCopy("stale", 0)).toBe(true);
    expect(shouldShowProjectsEmptyCopy("unsupported", 0)).toBe(true);
    expect(shouldShowProjectsEmptyCopy("ready", 1)).toBe(false);
  });
});

describe("resourceMonitorStatusTone", () => {
  it("uses warning for stale/partial and never treats every banner as muted", () => {
    expect(resourceMonitorStatusTone("stale")).toBe("warning");
    expect(resourceMonitorStatusTone("partial")).toBe("warning");
    expect(resourceMonitorStatusTone("disconnected")).toBe("destructive");
    expect(resourceMonitorStatusTone("unsupported")).toBe("muted");
    expect(resourceMonitorStatusTone("loading")).toBe("secondary");
    expect(resourceMonitorStatusTone("empty")).toBe("secondary");
    expect(resourceMonitorStatusTone("stale")).not.toBe(
      resourceMonitorStatusTone("loading"),
    );
  });
});

describe("ResourceMonitorPopover structure", () => {
  it("renders host, optional desktop, atmos, project hierarchy, and unattributed", () => {
    const hierarchySrc = readFileSync(
      join(import.meta.dir, "../components/ResourceMonitorHierarchy.tsx"),
      "utf8",
    );
    expect(popoverSrc).toContain('data-resource-monitor-state={state}');
    expect(popoverSrc).toContain("ResourceMonitorHostSection");
    expect(popoverSrc).toContain("ResourceMonitorDiskSection");
    expect(popoverSrc).toContain("showDesktop");
    expect(popoverSrc).toContain("desktopLoading");
    expect(popoverSrc).toContain("lastUpdatedAtMs");
    expect(popoverSrc).toContain("ScrollArea");
    const chartSrc = readFileSync(
      join(import.meta.dir, "../components/ResourceMonitorHostChart.tsx"),
      "utf8",
    );
    expect(popoverSrc).toContain("min-h-0");
    expect(popoverSrc).toContain("flex-1");
    expect(popoverSrc).toContain(
      "max-h-[min(620px,calc(100vh-1.5rem))]",
    );
    expect(popoverSrc).toContain("ResourceMonitorHostSection");
    expect(popoverSrc).not.toContain("border-b border-border");
    expect(popoverSrc.indexOf("<ScrollArea")).toBeLessThan(
      popoverSrc.indexOf("<ResourceMonitorDiskSection"),
    );
    expect(chartSrc).toContain("DitherGrowth");
    expect(chartSrc).toContain("yMax={100}");
    expect(chartSrc).not.toContain("DitherRevenueLines");
    expect(chartSrc).toContain("formatPercent");
    expect(chartSrc).toContain("useMemo");
    expect(chartSrc).not.toContain("recharts");
    expect(popoverSrc).not.toContain('role="toolbar"');
    expect(popoverSrc).not.toMatch(/uppercase|text-transform:\s*uppercase/);
    expect(hierarchySrc).toContain("data-resource-monitor-sort");
    expect(hierarchySrc).toContain("data-resource-monitor-sort-direction");
    expect(hierarchySrc).toContain("ArrowUp");
    expect(hierarchySrc).toContain("ArrowDown");
    expect(hierarchySrc).toContain("ArrowUpDown");
    expect(popoverSrc).toContain("handleSortKeyChange");
    expect(popoverSrc).toContain("defaultResourceMonitorSortDirection");
    expect(hierarchySrc).toContain("data-resource-monitor-atmos-trigger");
    expect(hierarchySrc).toContain("sumAtmosUsage");
    expect(hierarchySrc).toContain("data-resource-monitor-kill-leaked");
    expect(popoverSrc).toContain("killLeaked");
    expect(hierarchySrc).toContain(
      "showDesktop && desktop?.supported ? desktop.total : undefined",
    );
    expect(hierarchySrc).toContain("atmosDefaultOpen");
    expect(hierarchySrc).toContain("sticky top-0");
    expect(hierarchySrc).not.toContain("border-b border-border");
    expect(hierarchySrc).toContain('t("desktop")');
    expect(hierarchySrc).toContain('t("server")');
    expect(hierarchySrc).toContain('t("desktopUse")');
    expect(hierarchySrc).toMatch(
      /name=\{t\("desktopUse"\)\}[\s\S]*?indent=\{1\}/,
    );
    expect(hierarchySrc).toContain("RM_NESTED_COPY");
    expect(hierarchySrc).toContain("<SectionLabel indent={1}>{t(\"desktop\")}</SectionLabel>");
    expect(hierarchySrc).toContain('t("sharedRuntime")');
    expect(hierarchySrc).toContain('t("projects")');
    expect(hierarchySrc).toContain('t("projectResources")');
    expect(hierarchySrc).toContain('t("sessions")');
    expect(hierarchySrc).toContain('t("otherProcesses")');
    expect(hierarchySrc).toContain('t("noAttributedResources")');
    expect(hierarchySrc).toContain('t("ungroupedProcesses")');
    expect(hierarchySrc).toContain('t("includedCaption")');
    expect(hierarchySrc).toContain('t("other")');
    expect(hierarchySrc).toContain('t("unattributed")');
    expect(hierarchySrc).toContain('t("desktopLoading")');
    expect(hierarchySrc).toContain("transition-none");
    expect(hierarchySrc).toContain("hover:bg-accent");
    expect(hierarchySrc).toContain("rounded-md");
    expect(hierarchySrc).not.toContain("hover:bg-info/10");
    expect(hierarchySrc).not.toContain('role="row"');
    expect(hierarchySrc).not.toContain("ResourceMonitorUsageBar");
    const hostSrc = readFileSync(
      join(import.meta.dir, "../components/ResourceMonitorHostSection.tsx"),
      "utf8",
    );
    expect(hostSrc).toContain("hostDefaultOpen");
    expect(hostSrc).toContain("data-resource-monitor-host-trigger");
    expect(hostSrc).toContain("data-resource-monitor-details");
    expect(hostSrc).toContain("modal={false}");
    expect(hostSrc).toContain("coresInline");
    expect(hostSrc).toContain("RM_COLLAPSIBLE_BODY");
    expect(hostSrc).not.toContain("hostOpen && host");
    expect(hostSrc).not.toContain("hostOpen && isLoading");
  });
});
