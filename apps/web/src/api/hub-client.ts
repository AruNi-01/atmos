/**
 * Atmos Hub browser client (APP-056).
 * Session cookies are first-party to Hub origin; browser calls use credentials: include.
 * Local runtime pulls Hub secrets with device credential Bearer (not readable HttpOnly cookies).
 */

const DEVICE_CREDENTIAL_STORAGE_KEY = "atmos.device_credential";

export function hubBaseUrl(): string {
  const v =
    process.env.NEXT_PUBLIC_ATMOS_HUB_URL?.trim() ||
    process.env.ATMOS_HUB_URL?.trim() ||
    "";
  return v.replace(/\/$/, "");
}

export function hubConfigured(): boolean {
  return hubBaseUrl().length > 0;
}

/**
 * Cookie string for same-site / non-HttpOnly dev only.
 * Production Hub cookies are HttpOnly on hub.atmos.land — prefer device credential.
 */
export function hubCookieForLocalApi(): string {
  if (typeof document === "undefined") return "";
  return document.cookie || "";
}

export type StoredDeviceCredential = {
  device_id: string;
  device_credential: string;
  enrolled_at: number;
};

export function getStoredDeviceCredential(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEVICE_CREDENTIAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDeviceCredential;
    return parsed.device_credential?.trim() || null;
  } catch {
    return null;
  }
}

export function storeDeviceCredential(payload: {
  device_id: string;
  device_credential: string;
}): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      DEVICE_CREDENTIAL_STORAGE_KEY,
      JSON.stringify({
        device_id: payload.device_id,
        device_credential: payload.device_credential,
        enrolled_at: Date.now(),
      } satisfies StoredDeviceCredential),
    );
  } catch {
    /* ignore quota */
  }
}

export function clearStoredDeviceCredential(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(DEVICE_CREDENTIAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Hub auth fields for local API WS actions. */
export function hubAuthForLocalApi(): {
  hub_cookie: string;
  device_credential: string;
} {
  return {
    hub_cookie: hubCookieForLocalApi(),
    device_credential: getStoredDeviceCredential() ?? "",
  };
}

export async function hubFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = hubBaseUrl();
  if (!base) {
    throw new Error("Atmos Hub is not configured (NEXT_PUBLIC_ATMOS_HUB_URL)");
  }
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
    credentials: "include",
  });
}

export async function hubMe(): Promise<{
  user_id: string;
  email?: string | null;
  name?: string | null;
  handle?: string | null;
} | null> {
  if (!hubConfigured()) return null;
  const res = await hubFetch("/v1/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Hub /v1/me ${res.status}`);
  return res.json();
}

export async function hubLinearStatus(): Promise<{
  connected: boolean;
  auth_method?: string;
  viewer_name?: string | null;
  viewer_email?: string | null;
}> {
  const res = await hubFetch("/v1/me/integrations/linear");
  if (res.status === 401) {
    return { connected: false };
  }
  if (!res.ok) throw new Error(`Hub linear status ${res.status}`);
  return res.json();
}

export async function hubLinearConnectApiKey(payload: {
  api_key: string;
  viewer_name?: string;
  viewer_email?: string;
  viewer_id?: string;
}): Promise<void> {
  const res = await hubFetch("/v1/me/integrations/linear", {
    method: "PUT",
    body: JSON.stringify({
      auth_method: "api_key",
      api_key: payload.api_key,
      viewer_name: payload.viewer_name,
      viewer_email: payload.viewer_email,
      viewer_id: payload.viewer_id,
      connected_at: new Date().toISOString(),
    }),
  });
  if (res.status === 401) {
    throw new Error("Sign in to Atmos required");
  }
  if (!res.ok) {
    throw new Error(await res.text());
  }
}

export async function hubLinearDisconnect(): Promise<void> {
  const res = await hubFetch("/v1/me/integrations/linear", {
    method: "DELETE",
  });
  if (res.status === 401) {
    throw new Error("Sign in to Atmos required");
  }
  if (!res.ok) {
    throw new Error(await res.text());
  }
}
