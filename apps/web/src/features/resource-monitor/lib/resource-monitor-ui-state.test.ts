import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ResourceMonitorSnapshot } from "@atmos/api-types/ws/dto/resource-monitor";
import { resolveResourceMonitorUiState } from "@/features/resource-monitor/lib/resource-monitor-ui-state";

const usage = { cpu_percent: 4, memory_rss_bytes: 2048, process_count: 1 };

function snapshot(
  overrides: Partial<ResourceMonitorSnapshot> = {},
): ResourceMonitorSnapshot {
  return {
    collected_at_ms: Date.now(),
    host: {
      cpu_percent: 18,
      memory_used_bytes: 8 * 1024 * 1024 * 1024,
      memory_total_bytes: 16 * 1024 * 1024 * 1024,
      logical_cpu_count: 10,
    },
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
      },
    ],
    unattributed: { cpu_percent: 0, memory_rss_bytes: 0, process_count: 0 },
    attribution_status: "complete",
    ...overrides,
  };
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
});

describe("ResourceMonitorPopover structure", () => {
  it("renders host, optional desktop, atmos, project hierarchy, and unattributed", () => {
    expect(popoverSrc).toContain('data-resource-monitor-state={state}');
    expect(popoverSrc).toContain('t("host")');
    expect(popoverSrc).toContain("showDesktop");
    expect(popoverSrc).toContain("desktopLoading");
    expect(popoverSrc).toContain('t("desktopLoading")');
    expect(popoverSrc).toContain("lastUpdatedAtMs");
    expect(popoverSrc).toContain('t("desktop")');
    expect(popoverSrc).toContain('t("server")');
    expect(popoverSrc).toContain('t("sharedRuntime")');
    expect(popoverSrc).toContain('t("projects")');
    expect(popoverSrc).toContain('t("unattributed")');
    expect(popoverSrc).toContain("max-h-[min(420px,70vh)]");
    expect(popoverSrc).toContain("overflow-y-auto");
    expect(popoverSrc).not.toMatch(/uppercase|text-transform:\s*uppercase/);
  });
});
