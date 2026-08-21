/**
 * Unified Hub identity material for the current runtime.
 *
 * Call sites never branch on cookie vs device:
 * - Browser may have Better Auth session cookies
 * - Desktop / mobile primarily use Hub-minted device credentials
 * - Product APIs accept either (Hub `requireUser`)
 *
 * Bootstrap:
 * - `setDeviceCredentialStore(...)` (required)
 * - `setHubSessionCookieProvider(...)` when a readable cookie jar exists (browser)
 */

import { getStoredDeviceCredential } from "./device-storage/registry";

export type HubAuthMaterial = {
  /** Durable product credential (preferred for desktop / multi-origin). */
  deviceCredential: string | null;
  /** Better Auth session cookie header value when available. */
  sessionCookie: string | null;
};

/** Wire fragment attached to Computer local API / WS payloads. */
export type HubAuthWire = {
  hub_auth: {
    cookie?: string;
    device_credential?: string;
  };
};

let sessionCookieProvider: (() => string) | null = null;

/**
 * Register how to read Hub session cookies for this runtime.
 * Browser: `() => document.cookie` (HttpOnly cookies are not visible; device covers that).
 * Native / pure device: omit or pass null.
 */
export function setHubSessionCookieProvider(
  provider: (() => string) | null,
): void {
  sessionCookieProvider = provider;
}

export function getHubSessionCookieProvider(): (() => string) | null {
  return sessionCookieProvider;
}

function normalizeCookie(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  return s ? s : null;
}

function normalizeDevice(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s || s.length < 32) return null;
  return s;
}

/** Resolve identity material from the registered runtime adapters. */
export function getHubAuthMaterial(): HubAuthMaterial {
  const fromProvider = sessionCookieProvider?.() ?? "";
  return {
    deviceCredential: normalizeDevice(getStoredDeviceCredential()),
    sessionCookie: normalizeCookie(fromProvider),
  };
}

export function hasHubAuthMaterial(material?: HubAuthMaterial): boolean {
  const m = material ?? getHubAuthMaterial();
  return Boolean(m.deviceCredential || m.sessionCookie);
}

/**
 * Wire fields for Computer local API / main WS.
 * Business code: `wsRequest("…", { ...params, ...hubAuthWire() })`.
 */
export function hubAuthWire(material?: HubAuthMaterial): HubAuthWire {
  const m = material ?? getHubAuthMaterial();
  const hub_auth: HubAuthWire["hub_auth"] = {};
  if (m.sessionCookie) hub_auth.cookie = m.sessionCookie;
  if (m.deviceCredential) hub_auth.device_credential = m.deviceCredential;
  return { hub_auth };
}

/**
 * Merge Hub identity into a local API / WS request body.
 * Optional `linearApiKey` is product-local and never stored as Hub session.
 */
export function withHubAuth<T extends Record<string, unknown>>(
  data: T,
  opts?: { linearApiKey?: string | null },
): T & HubAuthWire & { linear_api_key?: string } {
  const key = opts?.linearApiKey?.trim();
  return {
    ...data,
    ...hubAuthWire(),
    ...(key ? { linear_api_key: key } : {}),
  };
}

/** Apply material to outbound Hub HTTPS headers (device Bearer). Cookies use credentials:include. */
export function applyHubAuthToHeaders(
  headers: Headers,
  material?: HubAuthMaterial,
): void {
  const m = material ?? getHubAuthMaterial();
  if (!headers.has("Authorization") && m.deviceCredential) {
    headers.set("Authorization", `Bearer ${m.deviceCredential}`);
  }
}
