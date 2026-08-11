import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  applyHubAuthToHeaders,
  getHubAuthMaterial,
  hasHubAuthMaterial,
  hubAuthWire,
  setHubSessionCookieProvider,
  withHubAuth,
} from "../auth-material";
import {
  clearStoredDeviceCredential,
  getStoredDeviceCredential,
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

const LONG_TOKEN = "d".repeat(40);

describe("device credential store registry", () => {
  beforeEach(() => {
    setDeviceCredentialStore(memoryStore());
    setHubSessionCookieProvider(null);
  });

  afterEach(() => {
    setHubSessionCookieProvider(null);
  });

  test("store / get / clear roundtrip", () => {
    storeDeviceCredential({
      device_id: "d1",
      device_credential: LONG_TOKEN,
    });
    expect(getStoredDeviceCredential()).toBe(LONG_TOKEN);
    clearStoredDeviceCredential();
    expect(getStoredDeviceCredential()).toBeNull();
  });

  test("getHubAuthMaterial unifies cookie + device without call-site branching", () => {
    setHubSessionCookieProvider(() => "session=abc");
    storeDeviceCredential({
      device_id: "d1",
      device_credential: LONG_TOKEN,
    });
    expect(getHubAuthMaterial()).toEqual({
      deviceCredential: LONG_TOKEN,
      sessionCookie: "session=abc",
    });
    expect(hasHubAuthMaterial()).toBe(true);
  });

  test("hubAuthWire / withHubAuth are the only Computer attach path", () => {
    setHubSessionCookieProvider(() => "cookie=abc");
    storeDeviceCredential({
      device_id: "d1",
      device_credential: LONG_TOKEN,
    });
    expect(hubAuthWire()).toEqual({
      hub_auth: {
        cookie: "cookie=abc",
        device_credential: LONG_TOKEN,
      },
    });
    expect(withHubAuth({ foo: 1 }, { linearApiKey: "lin_x" })).toEqual({
      foo: 1,
      hub_auth: {
        cookie: "cookie=abc",
        device_credential: LONG_TOKEN,
      },
      linear_api_key: "lin_x",
    });
  });

  test("applyHubAuthToHeaders sets device Bearer only", () => {
    storeDeviceCredential({
      device_id: "d1",
      device_credential: LONG_TOKEN,
    });
    const headers = new Headers();
    applyHubAuthToHeaders(headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${LONG_TOKEN}`);
  });

  test("short device tokens are ignored", () => {
    storeDeviceCredential({
      device_id: "d1",
      device_credential: "short",
    });
    expect(getHubAuthMaterial().deviceCredential).toBeNull();
    expect(hasHubAuthMaterial()).toBe(false);
  });
});
