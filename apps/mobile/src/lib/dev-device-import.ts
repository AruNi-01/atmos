import { isPlausibleDeviceCredential } from "@atmos/relay-client";
import { normalizeRelayUrl } from "@/lib/relay-url";

const DEFAULT_SETTINGS_URL =
  "http://127.0.0.1:3030/api/system/computer-client-settings";

type SettingsResponse = {
  success?: boolean;
  data?: {
    device_credential?: string | null;
    access_token?: string | null;
    relay_url?: string | null;
    relay_secret_key?: string | null;
    device_id?: string | null;
  } | null;
};

export type DevDeviceImport = {
  deviceId: string;
  deviceCredential: string;
  relayUrl: string | null;
  relaySecretKey: string | null;
};

function isReactNativeDev() {
  const globalDev = (globalThis as typeof globalThis & { __DEV__?: boolean })
    .__DEV__;
  return globalDev ?? (typeof __DEV__ !== "undefined" && __DEV__);
}

export function isDevDeviceImportEnabled() {
  return (
    isReactNativeDev() &&
    process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_DEVICE === "1"
  );
}

/** Dev-only: pull a device credential from local Computer settings API. */
export async function loadDevDeviceImport(
  fetchImpl: typeof fetch = fetch,
): Promise<DevDeviceImport | null> {
  if (!isDevDeviceImportEnabled()) {
    return null;
  }

  const url =
    process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_DEVICE_SETTINGS_URL ??
    DEFAULT_SETTINGS_URL;
  const response = await fetchImpl(url);
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as SettingsResponse | null;
  const deviceCredential = (
    payload?.data?.device_credential ??
    payload?.data?.access_token ??
    ""
  ).trim();
  if (!payload?.success || !isPlausibleDeviceCredential(deviceCredential)) {
    return null;
  }

  const relayUrl = payload.data?.relay_url?.trim()
    ? normalizeRelayUrl(payload.data.relay_url)
    : null;
  const relaySecretKey = payload.data?.relay_secret_key?.trim() || null;
  const deviceId = payload.data?.device_id?.trim() || "dev-import";

  return {
    deviceId,
    deviceCredential,
    relayUrl,
    relaySecretKey,
  };
}
