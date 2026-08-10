import { describe, expect, test, beforeEach } from "bun:test";
import {
  configureHubClient,
  hubBaseUrl,
  hubConfigured,
  requireHubBaseUrl,
  resetHubClientConfigForTests,
} from "./config";

describe("hub-client config", () => {
  beforeEach(() => {
    resetHubClientConfigForTests();
  });

  test("configureHubClient sets base url without trailing slash", () => {
    configureHubClient({ baseUrl: "https://hub.atmos.land/" });
    expect(hubBaseUrl()).toBe("https://hub.atmos.land");
    expect(hubConfigured()).toBe(true);
  });

  test("requireHubBaseUrl throws when explicitly empty", () => {
    configureHubClient({ baseUrl: "   " });
    expect(hubConfigured()).toBe(false);
    expect(() => requireHubBaseUrl()).toThrow(/not configured/);
  });

  test("explicit empty disables env fallback", () => {
    const prev = process.env.NEXT_PUBLIC_ATMOS_HUB_URL;
    process.env.NEXT_PUBLIC_ATMOS_HUB_URL = "https://from-env.example";
    try {
      configureHubClient({ baseUrl: "" });
      expect(hubBaseUrl()).toBe("");
      expect(hubConfigured()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_ATMOS_HUB_URL;
      else process.env.NEXT_PUBLIC_ATMOS_HUB_URL = prev;
    }
  });
});
