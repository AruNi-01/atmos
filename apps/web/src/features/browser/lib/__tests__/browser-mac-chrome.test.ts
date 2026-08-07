import { afterEach, describe, expect, test } from "bun:test";

import {
  BROWSER_MAC_TRAFFIC_RAIL_INSET,
  __resetBrowserMacChromeOwnersForTests,
  acquireBrowserMacChrome,
  releaseBrowserMacChrome,
} from "../browser-mac-chrome";

afterEach(() => {
  __resetBrowserMacChromeOwnersForTests();
});

describe("browser-mac-chrome", () => {
  test("rail inset is tighter than main header pl-[92px]", () => {
    expect(BROWSER_MAC_TRAFFIC_RAIL_INSET).toBeLessThan(92);
    expect(BROWSER_MAC_TRAFFIC_RAIL_INSET).toBeGreaterThan(60);
  });

  test("acquire/release refcount is balanced (no throw off desktop)", () => {
    // Outside Electron these are no-ops; still must not throw on multi-claim.
    acquireBrowserMacChrome();
    acquireBrowserMacChrome();
    releaseBrowserMacChrome();
    releaseBrowserMacChrome();
    releaseBrowserMacChrome(); // extra release is safe
  });
});
