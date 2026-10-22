// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, "../..");
const swift = readFileSync(
  join(mobile, "modules/atmos-url-session-socket/ios/AtmosUrlSessionSocketModule.swift"),
  "utf8",
);
const appConfig = readFileSync(join(mobile, "app.config.js"), "utf8");
const appJson = readFileSync(join(mobile, "app.json"), "utf8");

describe("AtmosUrlSessionSocket session configuration", () => {
  test("does not open the socket with URLSessionConfiguration.default", () => {
    expect(swift).not.toMatch(/URLSession\(\s*configuration:\s*\.default/);
    expect(swift).toContain("AtmosRelayWebSocketSession.configuration()");
  });

  test("prefers ephemeral and falls back to a getter-free configuration", () => {
    const ephemeralAt = swift.indexOf("URLSessionConfiguration.ephemeral");
    const cleanInitAt = swift.indexOf("let clean = URLSessionConfiguration()");
    expect(ephemeralAt).toBeGreaterThan(-1);
    expect(cleanInitAt).toBeGreaterThan(ephemeralAt);
    expect(swift).toContain("clean.protocolClasses = []");
    expect(swift).toContain("EXRequestInterceptorProtocol");
    expect(swift).toContain("ExpoRequestInterceptorProtocol");
  });

  test("copies timeout, cookie, and header settings from default and not protocolClasses", () => {
    expect(swift).toContain("timeoutIntervalForRequest");
    expect(swift).toContain("timeoutIntervalForResource");
    expect(swift).toContain("waitsForConnectivity");
    expect(swift).toContain("httpCookieAcceptPolicy");
    expect(swift).toContain("httpShouldSetCookies");
    expect(swift).toContain("httpCookieStorage");
    expect(swift).toContain("httpAdditionalHeaders");
    expect(swift).toContain("let shared = URLSessionConfiguration.default");
    expect(swift).not.toMatch(/protocolClasses\s*=\s*shared\.protocolClasses/);
    expect(swift).not.toMatch(/protocolClasses\s*=\s*.*URLSessionConfiguration\.default/);
  });

  test("comments why default is unsafe for the inspector handshake", () => {
    expect(swift).toContain("EX_DEV_CLIENT_NETWORK_INSPECTOR");
    expect(swift).toContain("101 Switching Protocols");
    expect(swift).toContain("NSURLErrorDomain -1005");
    expect(swift).toContain("Do not use `URLSessionConfiguration.default`");
  });

  test("does not turn off the Expo network inspector", () => {
    expect(swift).not.toContain("EX_DEV_CLIENT_NETWORK_INSPECTOR=false");
    expect(appConfig).not.toContain("EX_DEV_CLIENT_NETWORK_INSPECTOR=false");
    expect(appJson).toContain("expo-dev-client");
    expect(appConfig).toContain("expo-dev-launcher");
  });
});
