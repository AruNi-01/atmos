/**
 * Single mobile facade for Hub-minted device credentials.
 * Backed only by @atmos/hub-client DeviceCredentialStore (SecureStore).
 */
import {
  clearStoredDeviceCredential,
  getStoredDeviceCredential,
  getStoredDeviceRecord,
  hubMe,
  hubRevokeDevice,
  storeDeviceCredential,
  type HubMe,
  type StoredDeviceCredential,
} from "@atmos/hub-client";
import { isPlausibleDeviceCredential } from "@atmos/relay-client";
import { ensureMobileHubConfigured, flushDeviceCredentialStore } from "@/lib/hub-config";

export { isPlausibleDeviceCredential };

export function hasDeviceCredential(): boolean {
  return Boolean(getStoredDeviceCredential()?.trim());
}

export function requireDeviceCredential(): string {
  const cred = getStoredDeviceCredential()?.trim() ?? "";
  if (!isPlausibleDeviceCredential(cred)) {
    throw new Error("Sign in or scan a pair QR first.");
  }
  return cred;
}

export function getDeviceRecord(): StoredDeviceCredential | null {
  return getStoredDeviceRecord();
}

/**
 * Persist credential, verify with Hub, return /v1/me.
 * Clears store if Hub rejects the credential.
 */
export async function acceptDeviceCredential(payload: {
  device_id: string;
  device_credential: string;
}): Promise<HubMe> {
  await ensureMobileHubConfigured();
  if (!isPlausibleDeviceCredential(payload.device_credential)) {
    throw new Error("Invalid device credential from Hub");
  }
  storeDeviceCredential({
    device_id: payload.device_id,
    device_credential: payload.device_credential,
  });
  await flushDeviceCredentialStore();

  const me = await hubMe();
  if (!me?.user_id) {
    clearStoredDeviceCredential();
    await flushDeviceCredentialStore();
    throw new Error("Hub rejected this device credential. Sign in again.");
  }
  return me;
}

/**
 * Sign out this phone: revoke Hub device (best-effort), then clear local store.
 */
export async function signOutThisPhone(): Promise<void> {
  await ensureMobileHubConfigured();
  const rec = getStoredDeviceRecord();
  if (rec?.device_id && rec.device_credential) {
    try {
      await hubRevokeDevice(rec.device_id);
    } catch {
      /* still clear local — device may already be gone */
    }
  }
  clearStoredDeviceCredential();
  await flushDeviceCredentialStore();
}
