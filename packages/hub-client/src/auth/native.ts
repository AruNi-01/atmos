/**
 * Native Hub auth helpers (pure — no Expo imports).
 * Apps wire system-browser OAuth (expo-web-browser) and call these URLs/exchanges.
 */
import { hubBaseUrl, hubConfigured, requireHubBaseUrl } from "../config";
import {
  clearStoredDeviceCredential,
  storeDeviceCredential,
} from "../device-storage/registry";

export type HubSocialProvider = "github" | "google";

export type MobileAuthExchangePayload = {
  device_id: string;
  device_credential: string;
  user_id: string;
  email?: string | null;
  name?: string | null;
};

export const MOBILE_OAUTH_RETURN_TO = "atmos://hub-auth/callback";

export function hubMobileOAuthStartUrl(opts: {
  provider: HubSocialProvider;
  returnTo?: string;
  label?: string;
}): string {
  const hub = requireHubBaseUrl();
  const returnTo = opts.returnTo ?? MOBILE_OAUTH_RETURN_TO;
  const complete = new URL(`${hub}/v1/mobile-auth/complete`);
  complete.searchParams.set("return_to", returnTo);
  complete.searchParams.set("label", opts.label ?? "Mobile");
  const qs = new URLSearchParams({
    provider: opts.provider,
    callback_url: complete.toString(),
    mode: "sign-in",
  });
  return `${hub}/v1/oauth/start?${qs.toString()}`;
}

export async function hubExchangeMobileAuthCode(
  code: string,
  opts?: { hubBase?: string },
): Promise<MobileAuthExchangePayload> {
  const base = (opts?.hubBase?.trim() || requireHubBaseUrl()).replace(/\/$/, "");
  const res = await fetch(`${base}/v1/mobile-auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ code: code.trim() }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Auth exchange failed (${res.status})`);
  }
  return (await res.json()) as MobileAuthExchangePayload;
}

/** Persist exchanged credential into the configured DeviceCredentialStore. */
export function persistMobileAuthPayload(
  payload: MobileAuthExchangePayload,
): void {
  if (!payload.device_credential || payload.device_credential.length < 32) {
    throw new Error("Invalid device credential from Hub");
  }
  storeDeviceCredential({
    device_id: payload.device_id,
    device_credential: payload.device_credential,
  });
}

export function hubIsConfigured(): boolean {
  return hubConfigured();
}

export function hubConfiguredBaseUrl(): string | null {
  return hubBaseUrl();
}

/** No browser session on native — identity is device credential only. */
export async function hubGetSession(): Promise<null> {
  return null;
}

/** Local clear only — apps should prefer revoke-then-clear (see mobile signOutThisPhone). */
export async function hubSignOut(): Promise<void> {
  clearStoredDeviceCredential();
}

export function getHubAuthClient(): never {
  throw new Error(
    "Better Auth client is not used on native. Open hubMobileOAuthStartUrl with the system browser, then hubExchangeMobileAuthCode.",
  );
}

/** @deprecated Use hubMobileOAuthStartUrl + system browser + hubExchangeMobileAuthCode. */
export async function hubSignInSocial(
  _provider: HubSocialProvider,
  _callbackURL?: string,
): Promise<never> {
  throw new Error(
    "hubSignInSocial is browser-only. On native, open hubMobileOAuthStartUrl with expo-web-browser.",
  );
}
