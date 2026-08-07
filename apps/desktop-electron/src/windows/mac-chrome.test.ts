import { describe, expect, test } from "bun:test";

import {
  MAC_TRAFFIC_LIGHTS,
  isMacChromeVariant,
  macWindowChromeOptions,
} from "./mac-chrome.ts";

describe("mac-chrome", () => {
  test("isMacChromeVariant accepts known keys only", () => {
    expect(isMacChromeVariant("primary")).toBe(true);
    expect(isMacChromeVariant("browser")).toBe(true);
    expect(isMacChromeVariant("compact")).toBe(true);
    expect(isMacChromeVariant("other")).toBe(false);
    expect(isMacChromeVariant("")).toBe(false);
  });

  test("browser lights sit higher than primary shell header", () => {
    expect(MAC_TRAFFIC_LIGHTS.browser.y).toBeLessThan(
      MAC_TRAFFIC_LIGHTS.primary.y,
    );
    expect(MAC_TRAFFIC_LIGHTS.browser.x).toBe(MAC_TRAFFIC_LIGHTS.primary.x);
  });

  test("macWindowChromeOptions is empty off darwin", () => {
    if (process.platform === "darwin") {
      const opts = macWindowChromeOptions("browser");
      expect(opts).toMatchObject({
        titleBarStyle: "hiddenInset",
        trafficLightPosition: MAC_TRAFFIC_LIGHTS.browser,
      });
    } else {
      expect(macWindowChromeOptions("browser")).toEqual({});
    }
  });
});
