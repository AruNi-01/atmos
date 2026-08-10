/**
 * Stored Relay Bearer = Hub-minted device credential (APP-056).
 * SecureStore key kept for local continuity; product name is device credential.
 */
import * as SecureStore from "expo-secure-store";
export { isPlausibleAccessToken, isPlausibleDeviceCredential } from "@/lib/access-token-format";

const DEVICE_CREDENTIAL_KEY = "atmos.device_credential";
/** Legacy SecureStore key — read if new key empty. */
const LEGACY_ACCESS_TOKEN_KEY = "atmos.access_token";

export async function getStoredAccessToken() {
  const next = await SecureStore.getItemAsync(DEVICE_CREDENTIAL_KEY);
  if (next) return next;
  return SecureStore.getItemAsync(LEGACY_ACCESS_TOKEN_KEY);
}

export async function getStoredDeviceCredential() {
  return getStoredAccessToken();
}

export async function storeAccessToken(token: string) {
  await SecureStore.setItemAsync(DEVICE_CREDENTIAL_KEY, token);
  try {
    await SecureStore.deleteItemAsync(LEGACY_ACCESS_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export async function storeDeviceCredential(token: string) {
  return storeAccessToken(token);
}

export async function clearAccessToken() {
  await SecureStore.deleteItemAsync(DEVICE_CREDENTIAL_KEY).catch(() => undefined);
  await SecureStore.deleteItemAsync(LEGACY_ACCESS_TOKEN_KEY).catch(() => undefined);
}

export async function clearDeviceCredential() {
  return clearAccessToken();
}
