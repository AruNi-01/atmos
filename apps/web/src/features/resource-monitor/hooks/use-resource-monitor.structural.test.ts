import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const hookSrc = readFileSync(join(import.meta.dir, "use-resource-monitor.ts"), "utf8");
const footerSrc = readFileSync(
  join(import.meta.dir, "../components/ResourceMonitorFooterItem.tsx"),
  "utf8",
);
const popoverSrc = readFileSync(
  join(import.meta.dir, "../components/ResourceMonitorPopover.tsx"),
  "utf8",
);
const titlesSrc = readFileSync(
  join(import.meta.dir, "../lib/resource-monitor-session-titles.ts"),
  "utf8",
);
const hierarchySrc = readFileSync(
  join(import.meta.dir, "../components/ResourceMonitorHierarchy.tsx"),
  "utf8",
);

describe("useResourceMonitor lifecycle wiring", () => {
  test("idles with get polling and switches to subscribe while the popover is open", () => {
    expect(hookSrc).toContain("RESOURCE_MONITOR_IDLE_MS");
    expect(hookSrc).toContain("options.interactive");
    expect(hookSrc).toContain("controllerRef.current?.attach(scope)");
    expect(hookSrc).toContain("resourceMonitorApi.subscribe");
    expect(hookSrc).toContain("resourceMonitorApi.unsubscribe");
    expect(hookSrc).toContain("canFetchDesktopShellMetrics");
    expect(hookSrc).toContain("fetchDesktopShellMetrics");
    expect(hookSrc).toContain("!options.interactive && connectionState === \"connected\"");
    expect(hookSrc).toContain("lastUpdatedAtMs: serverQuery.dataUpdatedAt");
    expect(hookSrc).toContain("desktopLoading");
    expect(hookSrc).toContain("appendResourceHostHistoryPoint");
    expect(hookSrc).toContain("resourceHostHistoryPointFromSnapshot");
    expect(hookSrc).toContain("serverQuery.dataUpdatedAt");
    expect(hookSrc).toContain("history,");
    expect(hookSrc).toContain("resourceMonitorHistoryScopeKey(scope)");
  });

  test("Footer item owns popover open state as the interactive flag", () => {
    expect(footerSrc).toContain("interactive: open");
    expect(footerSrc).toContain("enabled: true");
    expect(footerSrc).toContain("hostMemoryPercent");
    expect(footerSrc).toContain("formatPercent");
    expect(footerSrc).toContain("resourceMonitorPressureTextClass");
    expect(footerSrc).toContain("compactAria");
    expect(footerSrc).toContain("lastUpdatedAtMs={lastUpdatedAtMs}");
    expect(footerSrc).toContain("desktopLoading={desktopLoading}");
    expect(footerSrc).toContain("history={history}");
    expect(footerSrc).toContain("Tooltip");
    expect(footerSrc).not.toContain("title={t(\"title\")}");
    expect(footerSrc).toContain("navigatingRef");
    expect(footerSrc).toContain("onCloseAutoFocus");
    expect(footerSrc).toContain("preventResourceMonitorCloseAutoFocus");
    expect(footerSrc).toContain("runResourceMonitorSessionNavigation");
    expect(footerSrc).toContain("useAppRouter");
    expect(footerSrc).toContain("handleOpenChange");
    expect(footerSrc).toContain("if (next && navigatingRef.current) return");
    expect(footerSrc).toContain("onOpenChange={handleOpenChange}");
    expect(footerSrc).toMatch(/reopen:\s*\(\)\s*=>\s*setOpen\(true\)/);
    expect(footerSrc).not.toMatch(
      /reopen:\s*\(\)\s*=>\s*\{[\s\S]*navigatingRef\.current\s*=\s*false/,
    );
  });
});

describe("Resource Monitor live session titles", () => {
  test("popover subscribes to workspacePanes and resolves display-only titles", () => {
    expect(popoverSrc).toContain('useTerminalStore((s) => s.workspacePanes)');
    expect(popoverSrc).toContain("buildResourceMonitorSessionDisplayMap(workspacePanes)");
    expect(popoverSrc).toContain("liveDisplays={liveDisplays}");
    expect(popoverSrc).toContain("onNavigateSession");
    expect(hierarchySrc).toContain("resolveResourceMonitorSessionDisplay");
    expect(hierarchySrc).toContain("ResourceMonitorSessionName");
    expect(hierarchySrc).toContain("findResourceMonitorSessionLocation");
    expect(hierarchySrc).toContain('routeKind="project"');
    expect(hierarchySrc).toContain("project.project_id");
    expect(hierarchySrc).toContain('routeKind="workspace"');
    expect(hierarchySrc).toContain("workspace.workspace_id");
    expect(hierarchySrc).toContain('t("projectResources")');
    expect(hierarchySrc).toContain("data-resource-monitor-session");
    expect(hierarchySrc).toContain("data-resource-monitor-session-trigger");
    expect(hierarchySrc).toContain("data-resource-monitor-session-locate");
    expect(hierarchySrc).toContain("data-resource-monitor-session-row");
    expect(hierarchySrc).toContain("data-session-id");
    expect(hierarchySrc).toContain("data-resource-monitor-space-badge");
    expect(hierarchySrc).toContain("resolveResourceMonitorSessionSpaceBadge");
    expect(hierarchySrc).not.toContain("<Locate");
    expect(hierarchySrc).toContain("hover:text-foreground");
    expect(hierarchySrc).toContain("data-resource-monitor-process");
    expect(hierarchySrc).toContain('t("sessionProcessesAria"');
    expect(hierarchySrc).toContain('t("includedCaption")');
    expect(hierarchySrc).toContain('t("ungroupedProcesses")');
    expect(titlesSrc).toContain("getTerminalDisplayMeta");
    expect(titlesSrc).toContain("isTmuxIndexTitle");
    expect(titlesSrc).toContain("never write this back onto the WS snapshot DTO");
    expect(titlesSrc).not.toContain("from \"@/features/terminal/components");
    expect(popoverSrc).not.toContain("from \"@/features/terminal/components");
  });
});
