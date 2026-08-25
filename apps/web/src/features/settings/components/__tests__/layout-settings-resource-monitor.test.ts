import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sectionSrc = readFileSync(
  join(import.meta.dir, "../LayoutSettingsSection.tsx"),
  "utf8",
);

describe("layout settings resource monitor toggle", () => {
  test("places Resource Monitor before Local Services and usage", () => {
    const localServices = sectionSrc.indexOf("footer.localServicesTitle");
    const resourceMonitor = sectionSrc.indexOf("footer.resourceMonitorTitle");
    const usage = sectionSrc.indexOf("footer.usageCarouselTitle");

    expect(localServices).toBeGreaterThan(-1);
    expect(resourceMonitor).toBeGreaterThan(-1);
    expect(usage).toBeGreaterThan(-1);
    expect(resourceMonitor).toBeLessThan(localServices);
    expect(resourceMonitor).toBeLessThan(usage);
  });

  test("includes the Resource Monitor flag in footerEnabledCount", () => {
    expect(sectionSrc).toContain("Number(showResourceMonitor)");
    expect(sectionSrc).not.toContain("showWsConnection");
    expect(sectionSrc).not.toContain("footer.wsConnectionTitle");
  });
});
