// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, describe, expect, test } from "bun:test";
import { isDevAccessTokenImportEnabled, loadDevAccessTokenImport } from "./dev-access-token-import";

const devGlobal = globalThis as typeof globalThis & { __DEV__?: boolean };
const originalFlag = process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_ACCESS_TOKEN;
const originalUrl = process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_ACCESS_TOKEN_SETTINGS_URL;
const originalDev = devGlobal.__DEV__;

afterEach(() => {
  process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_ACCESS_TOKEN = originalFlag;
  process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_ACCESS_TOKEN_SETTINGS_URL = originalUrl;
  devGlobal.__DEV__ = originalDev;
});

describe("dev access token import", () => {
  test("stays disabled unless debug and explicitly enabled", () => {
    devGlobal.__DEV__ = true;
    delete process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_ACCESS_TOKEN;
    expect(isDevAccessTokenImportEnabled()).toBe(false);

    devGlobal.__DEV__ = false;
    process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_ACCESS_TOKEN = "1";
    expect(isDevAccessTokenImportEnabled()).toBe(false);
  });

  test("loads a plausible token from the configured settings endpoint", async () => {
    devGlobal.__DEV__ = true;
    process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_ACCESS_TOKEN = "1";
    process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_ACCESS_TOKEN_SETTINGS_URL = "http://127.0.0.1:3030/settings";

    const fetchCalls: string[] = [];
    const imported = await loadDevAccessTokenImport(async (url) => {
      fetchCalls.push(String(url));
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            access_token: "a".repeat(64),
            relay_url: "https://relay.atmos.land/",
            relay_secret_key: "local-relay-secret",
          },
        }),
      );
    });

    expect(fetchCalls).toEqual(["http://127.0.0.1:3030/settings"]);
    expect(imported).toEqual({
      accessToken: "a".repeat(64),
      relayUrl: "https://relay.atmos.land",
      relaySecretKey: "local-relay-secret",
    });
  });

  test("ignores missing or implausible tokens", async () => {
    devGlobal.__DEV__ = true;
    process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_ACCESS_TOKEN = "1";

    const imported = await loadDevAccessTokenImport(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            access_token: "short",
            relay_url: "https://relay.atmos.land",
          },
        }),
      );
    });

    expect(imported).toBeNull();
  });
});
