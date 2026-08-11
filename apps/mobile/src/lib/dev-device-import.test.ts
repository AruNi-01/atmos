// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, describe, expect, test } from "bun:test";
import {
  isDevDeviceImportEnabled,
  loadDevDeviceImport,
} from "./dev-device-import";

const devGlobal = globalThis as typeof globalThis & { __DEV__?: boolean };
const originalFlag = process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_DEVICE;
const originalUrl = process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_DEVICE_SETTINGS_URL;
const originalDev = devGlobal.__DEV__;

afterEach(() => {
  process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_DEVICE = originalFlag;
  process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_DEVICE_SETTINGS_URL = originalUrl;
  devGlobal.__DEV__ = originalDev;
});

describe("dev device import", () => {
  test("stays disabled unless debug and explicitly enabled", () => {
    devGlobal.__DEV__ = true;
    delete process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_DEVICE;
    expect(isDevDeviceImportEnabled()).toBe(false);

    devGlobal.__DEV__ = false;
    process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_DEVICE = "1";
    expect(isDevDeviceImportEnabled()).toBe(false);
  });

  test("loads a device credential from the settings endpoint", async () => {
    devGlobal.__DEV__ = true;
    process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_DEVICE = "1";
    process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_DEVICE_SETTINGS_URL =
      "http://127.0.0.1:3030/settings";

    const cred = "a".repeat(64);
    const imported = await loadDevDeviceImport(async (url) => {
      expect(String(url)).toBe("http://127.0.0.1:3030/settings");
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            device_credential: cred,
            device_id: "dev_1",
            relay_url: "https://relay.atmos.land/",
            relay_secret_key: "local-relay-secret",
          },
        }),
      );
    });

    expect(imported).toEqual({
      deviceId: "dev_1",
      deviceCredential: cred,
      relayUrl: "https://relay.atmos.land",
      relaySecretKey: "local-relay-secret",
    });
  });

  test("ignores implausible credentials", async () => {
    devGlobal.__DEV__ = true;
    process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_DEVICE = "1";

    const imported = await loadDevDeviceImport(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          data: { device_credential: "short" },
        }),
      );
    });

    expect(imported).toBeNull();
  });
});
