import { requireHubBaseUrl } from "./config";
import { getStoredDeviceCredential } from "./device-storage/registry";

/**
 * Hub fetch with cookie session (browser) and optional device Bearer.
 * After desktop OAuth in the system browser, Electron has no Hub cookies —
 * device credential is the durable auth for the local app (APP-056).
 */
export async function hubFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = requireHubBaseUrl();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Authorization")) {
    const deviceCredential = getStoredDeviceCredential()?.trim();
    if (deviceCredential && deviceCredential.length >= 32) {
      headers.set("Authorization", `Bearer ${deviceCredential}`);
    }
  }
  return fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
    credentials: "include",
  });
}
