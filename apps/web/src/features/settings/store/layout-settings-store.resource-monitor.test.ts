import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const storeSrc = readFileSync(join(import.meta.dir, "layout-settings-store.ts"), "utf8");

describe("layout settings resource monitor", () => {
  it("defaults the footer item on unless the stored setting is explicitly false", () => {
    expect(storeSrc).toContain("showResourceMonitor: true");
    expect(storeSrc).toContain(
      "showResourceMonitor: layout?.footer_show_resource_monitor !== false",
    );
    expect(storeSrc).toContain("'footer_show_resource_monitor'");
    expect(storeSrc).toContain("setFooterShowResourceMonitor");
    expect(storeSrc).not.toContain("showWsConnection");
    expect(storeSrc).not.toContain("footer_show_ws_connection");
  });
});
