import type { HubAuthForLocalApi } from "../types";
import type { DeviceCredentialStore } from "./types";

let store: DeviceCredentialStore | null = null;

export function setDeviceCredentialStore(next: DeviceCredentialStore): void {
  store = next;
}

export function getDeviceCredentialStore(): DeviceCredentialStore | null {
  return store;
}

function requireStore(): DeviceCredentialStore {
  if (!store) {
    throw new Error(
      "Device credential store not set. Call setDeviceCredentialStore(...) at app bootstrap (browser or native).",
    );
  }
  return store;
}

export function getStoredDeviceCredential(): string | null {
  return store?.get() ?? null;
}

export function storeDeviceCredential(payload: {
  device_id: string;
  device_credential: string;
}): void {
  requireStore().set(payload);
}

export function clearStoredDeviceCredential(): void {
  store?.clear();
}

/** Cookie fragment (browser) is optional; device credential is preferred for local API. */
export function hubAuthForLocalApi(getCookie?: () => string): HubAuthForLocalApi {
  return {
    hub_cookie: getCookie?.() ?? "",
    device_credential: getStoredDeviceCredential() ?? "",
  };
}
