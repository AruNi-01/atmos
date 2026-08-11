import type { StoredDeviceCredential } from "../types";

/** Platform-specific persistence for Hub-minted device credentials. */
export type DeviceCredentialStore = {
  get(): string | null;
  getRecord(): StoredDeviceCredential | null;
  set(payload: { device_id: string; device_credential: string }): void;
  clear(): void;
};
