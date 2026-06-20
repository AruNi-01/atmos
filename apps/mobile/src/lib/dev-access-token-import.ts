import { isPlausibleAccessToken } from "@/lib/access-token-format";
import { normalizeRelayUrl } from "@/lib/relay-url";

const DEFAULT_SETTINGS_URL = "http://127.0.0.1:3030/api/system/computer-client-settings";

type SettingsResponse = {
  success?: boolean;
  data?: {
    access_token?: string | null;
    relay_url?: string | null;
    relay_secret_key?: string | null;
  } | null;
};

export type DevAccessTokenImport = {
  accessToken: string;
  relayUrl: string | null;
  relaySecretKey: string | null;
};

function isReactNativeDev() {
  const globalDev = (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__;
  return globalDev ?? (typeof __DEV__ !== "undefined" && __DEV__);
}

export function isDevAccessTokenImportEnabled() {
  return isReactNativeDev() && process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_ACCESS_TOKEN === "1";
}

export async function loadDevAccessTokenImport(
  fetchImpl: typeof fetch = fetch,
): Promise<DevAccessTokenImport | null> {
  if (!isDevAccessTokenImportEnabled()) {
    return null;
  }

  const url = process.env.EXPO_PUBLIC_ATMOS_MOBILE_DEV_ACCESS_TOKEN_SETTINGS_URL ?? DEFAULT_SETTINGS_URL;
  const response = await fetchImpl(url);
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as SettingsResponse | null;
  const accessToken = payload?.data?.access_token?.trim() ?? "";
  if (!payload?.success || !isPlausibleAccessToken(accessToken)) {
    return null;
  }

  const relayUrl = payload.data?.relay_url?.trim()
    ? normalizeRelayUrl(payload.data.relay_url)
    : null;
  const relaySecretKey = payload.data?.relay_secret_key?.trim() || null;

  return {
    accessToken,
    relayUrl,
    relaySecretKey,
  };
}
