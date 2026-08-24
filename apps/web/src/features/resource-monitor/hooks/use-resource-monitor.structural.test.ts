import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const hookSrc = readFileSync(join(import.meta.dir, "use-resource-monitor.ts"), "utf8");
const footerSrc = readFileSync(
  join(import.meta.dir, "../components/ResourceMonitorFooterItem.tsx"),
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
  });

  test("Footer item owns popover open state as the interactive flag", () => {
    expect(footerSrc).toContain("interactive: open");
    expect(footerSrc).toContain("enabled: true");
    expect(footerSrc).toContain("formatCpuPercent");
    expect(footerSrc).toContain("formatMemoryBytes");
    expect(footerSrc).toContain('aria-label={t("title")}');
    expect(footerSrc).toContain("lastUpdatedAtMs={lastUpdatedAtMs}");
    expect(footerSrc).toContain("desktopLoading={desktopLoading}");
  });
});
