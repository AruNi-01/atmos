import type { StoredDeviceCredential } from "../types";
import type { DeviceCredentialStore } from "./types";

export const DEVICE_CREDENTIAL_STORAGE_KEY = "atmos.device_credential";

/** Browser / Electron webview: localStorage. */
export function createBrowserDeviceCredentialStore(
  storageKey: string = DEVICE_CREDENTIAL_STORAGE_KEY,
): DeviceCredentialStore {
  return {
    getRecord(): StoredDeviceCredential | null {
      if (typeof localStorage === "undefined") return null;
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        return JSON.parse(raw) as StoredDeviceCredential;
      } catch {
        return null;
      }
    },
    get(): string | null {
      const rec = this.getRecord();
      return rec?.device_credential?.trim() || null;
    },
    set(payload: { device_id: string; device_credential: string }): void {
      if (typeof localStorage === "undefined") return;
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            device_id: payload.device_id,
            device_credential: payload.device_credential,
            enrolled_at: Date.now(),
          } satisfies StoredDeviceCredential),
        );
      } catch {
        /* ignore quota */
      }
    },
    clear(): void {
      if (typeof localStorage === "undefined") return;
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Dev-only: document.cookie (HttpOnly Hub cookies are not readable). */
export function hubCookieFromDocument(): string {
  if (typeof document === "undefined") return "";
  return document.cookie || "";
}
