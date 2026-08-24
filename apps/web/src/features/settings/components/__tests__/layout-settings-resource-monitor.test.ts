import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sectionSrc = readFileSync(
  join(import.meta.dir, "../LayoutSettingsSection.tsx"),
  "utf8",
);

describe("layout settings resource monitor toggle", () => {
  test("places the Resource Monitor toggle after Local Services and before usage", () => {
    const localServices = sectionSrc.indexOf("footer.localServicesTitle");
    const resourceMonitor = sectionSrc.indexOf("footer.resourceMonitorTitle");
    const usage = sectionSrc.indexOf("footer.usageCarouselTitle");

    expect(localServices).toBeGreaterThan(-1);
    expect(resourceMonitor).toBeGreaterThan(-1);
    expect(usage).toBeGreaterThan(-1);
    expect(localServices).toBeLessThan(resourceMonitor);
    expect(resourceMonitor).toBeLessThan(usage);
  });

  test("includes the Resource Monitor flag in footerEnabledCount", () => {
    expect(sectionSrc).toContain("Number(showResourceMonitor)");
  });
});
