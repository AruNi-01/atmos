import { describe, expect, test, beforeEach } from "bun:test";
import {
  clearStoredDeviceCredential,
  getStoredDeviceCredential,
  hubAuthForLocalApi,
  setDeviceCredentialStore,
  storeDeviceCredential,
} from "./registry";
import type { DeviceCredentialStore } from "./types";
import type { StoredDeviceCredential } from "../types";

function memoryStore(): DeviceCredentialStore {
  let rec: StoredDeviceCredential | null = null;
  return {
    getRecord: () => rec,
    get: () => rec?.device_credential?.trim() || null,
    set: (payload) => {
      rec = {
        device_id: payload.device_id,
        device_credential: payload.device_credential,
        enrolled_at: Date.now(),
      };
    },
    clear: () => {
      rec = null;
    },
  };
}

describe("device credential store registry", () => {
  beforeEach(() => {
    setDeviceCredentialStore(memoryStore());
  });

  test("store / get / clear roundtrip", () => {
    storeDeviceCredential({
      device_id: "d1",
      device_credential: "secret-token",
    });
    expect(getStoredDeviceCredential()).toBe("secret-token");
    clearStoredDeviceCredential();
    expect(getStoredDeviceCredential()).toBeNull();
  });

  test("hubAuthForLocalApi uses cookie getter + device credential", () => {
    storeDeviceCredential({
      device_id: "d1",
      device_credential: "tok",
    });
    expect(hubAuthForLocalApi(() => "cookie=abc")).toEqual({
      hub_cookie: "cookie=abc",
      device_credential: "tok",
    });
  });
});
