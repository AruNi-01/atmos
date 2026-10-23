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
  });

  test("does not copy protocolClasses from URLSessionConfiguration.default", () => {
    expect(swift).not.toMatch(/protocolClasses\s*=\s*shared\.protocolClasses/);
    expect(swift).not.toMatch(/protocolClasses\s*=\s*.*URLSessionConfiguration\.default/);
  });

  test("does not turn off the Expo network inspector", () => {
    expect(swift).not.toContain("EX_DEV_CLIENT_NETWORK_INSPECTOR=false");
    expect(appConfig).not.toContain("EX_DEV_CLIENT_NETWORK_INSPECTOR=false");
    expect(appJson).toContain("expo-dev-client");
    expect(appConfig).toContain("expo-dev-launcher");
  });
});
