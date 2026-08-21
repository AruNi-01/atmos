import type { StoredDeviceCredential } from "../types";
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

export function getStoredDeviceRecord(): StoredDeviceCredential | null {
  return store?.getRecord() ?? null;
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
