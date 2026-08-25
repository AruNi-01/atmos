import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const footerSrc = readFileSync(
  join(import.meta.dir, "../Footer.tsx"),
  "utf8",
);

describe("footer usage carousel order", () => {
  test("places the usage carousel after local services in the left cluster", () => {
    const wsStatus = footerSrc.indexOf("{showWsStatus ? (");
    const localServices = footerSrc.indexOf("<LocalServicesFooterItem");
    const resourceMonitor = footerSrc.indexOf("<ResourceMonitorFooterItem");
    const carousel = footerSrc.indexOf("showLeftCarousel && usageCarouselItem");

    expect(wsStatus).toBeGreaterThan(-1);
    expect(localServices).toBeGreaterThan(-1);
    expect(resourceMonitor).toBeGreaterThan(-1);
    expect(carousel).toBeGreaterThan(-1);
    expect(wsStatus).toBeLessThan(localServices);
    expect(localServices).toBeLessThan(resourceMonitor);
    expect(resourceMonitor).toBeLessThan(carousel);
    expect(footerSrc).not.toContain("ml-auto");
  });
});
