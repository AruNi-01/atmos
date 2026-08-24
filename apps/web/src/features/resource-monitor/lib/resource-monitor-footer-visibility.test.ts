import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { effectiveShowResourceMonitor } from "@/features/resource-monitor/lib/resource-monitor-footer-visibility";

const footerSrc = readFileSync(
  join(import.meta.dir, "../../../app-shell/Footer.tsx"),
  "utf8",
);

describe("effectiveShowResourceMonitor", () => {
  test("does not show the monitor before layout settings load", () => {
    expect(effectiveShowResourceMonitor(false, true)).toBe(false);
    expect(effectiveShowResourceMonitor(false, false)).toBe(false);
  });

  test("shows only after load when the setting is on", () => {
    expect(effectiveShowResourceMonitor(true, true)).toBe(true);
  });

  test("does not show when the persisted setting is off", () => {
    expect(effectiveShowResourceMonitor(true, false)).toBe(false);
  });
});

describe("Footer resource monitor visibility", () => {
  test("gates showLeft, separators, and render on the effective flag", () => {
    expect(footerSrc).toContain("const layoutLoaded = useLayoutSettingsStore((s) => s.loaded)");
    expect(footerSrc).toContain(
      "const effectiveShowResourceMonitor = resolveEffectiveShowResourceMonitor(",
    );
    expect(footerSrc).toContain(
      "showLeft = showWsStatus || showLocalServices || effectiveShowResourceMonitor || showLeftCarousel",
    );
    expect(footerSrc).toContain(
      "showWsStatus && (showLocalServices || effectiveShowResourceMonitor || showLeftCarousel)",
    );
    expect(footerSrc).toContain(
      "showLocalServices && (effectiveShowResourceMonitor || showLeftCarousel)",
    );
    expect(footerSrc).toContain("{effectiveShowResourceMonitor ? (");
    expect(footerSrc).toContain("<ResourceMonitorFooterItem");
    expect(footerSrc).toContain("effectiveShowResourceMonitor && showLeftCarousel");
  });

  test("does not change other footer items' startup gating", () => {
    expect(footerSrc).toContain("{showLocalServices ? (");
    expect(footerSrc).toContain("{showWsStatus ? (");
    expect(footerSrc).toContain("showLeftCarousel && usageCarouselItem");
    expect(footerSrc).not.toContain("layoutLoaded && showLocalServices");
    expect(footerSrc).not.toContain("layoutLoaded && showUsageCarousel");
    expect(footerSrc).not.toContain("layoutLoaded && showWsConnection");
  });
});
