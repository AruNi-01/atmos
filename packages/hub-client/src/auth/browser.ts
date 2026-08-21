/**
 * Better Auth client for Atmos Hub (browser / desktop webview).
 * Uses `better-auth/react` so UI libraries (e.g. better-auth-ui) can call `useSession`.
 * @see https://better-auth.com/docs/installation (Client section)
 *
 * Linked accounts use Hub `/v1/me/*` so both session cookie (web)
 * and device Bearer (desktop / phone) resolve the same user_id-bound data.
 */
import { createAuthClient } from "better-auth/react";
import { hubBaseUrl, hubConfigured, requireHubBaseUrl } from "../config";
import { hubFetch } from "../http";

export type HubSocialProvider = "github" | "google";

export type HubOAuthMode = "sign-in" | "link";

let client: ReturnType<typeof createAuthClient> | null = null;

export function getHubAuthClient() {
  requireHubBaseUrl();
  if (!client) {
    client = createAuthClient({
      baseURL: hubBaseUrl(),
    });
  }
  return client;
}

/** Reset cached client (e.g. after configureHubClient baseUrl change). */
export function resetHubAuthClient(): void {
  client = null;
}

export type HubSession = typeof getHubAuthClient extends () => infer C
  ? C extends { $Infer: { Session: infer S } }
    ? S
    : never
  : never;

export type HubLinkedAccount = {
  id: string;
  providerId: string;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  accountId: string;
  userId: string;
  scopes: string[];
  /** Provider profile email when known (not necessarily Atmos user.email). */
  email?: string | null;
};

export async function hubGetSession() {
  if (!hubConfigured()) return null;
  const c = getHubAuthClient();
  const { data, error } = await c.getSession();
  if (error) return null;
  return data;
}

/**
 * Top-level Hub OAuth start URL (first-party state cookie).
 * Prefer opening this in a new tab / system browser instead of XHR sign-in/link.
 * For mode=link without a browser Hub cookie, pass `linkTicket` from hubCreateLinkTicket.
 */
export function hubOAuthStartUrl(opts: {
  provider: HubSocialProvider;
  callbackURL: string;
  mode?: HubOAuthMode;
  linkTicket?: string;
}): string {
  const hub = requireHubBaseUrl();
  const mode = opts.mode ?? "sign-in";
  const qs = new URLSearchParams({
    provider: opts.provider,
    callback_url: opts.callbackURL,
    mode,
  });
  if (opts.linkTicket) {
    qs.set("link_ticket", opts.linkTicket);
  }
  return `${hub}/v1/oauth/start?${qs.toString()}`;
}

/**
 * One-time ticket so device-auth clients can start mode=link OAuth in a browser
 * that does not have a Hub session cookie (desktop system browser / phone).
 */
export async function hubCreateLinkTicket(): Promise<{
  ticket: string;
  expires_in: number;
}> {
  const res = await hubFetch("/v1/me/link-ticket", { method: "POST" });
  if (!res.ok) {
    throw new Error(`Hub link-ticket failed (${res.status})`);
  }
  return res.json() as Promise<{ ticket: string; expires_in: number }>;
}

export async function hubSignInSocial(
  provider: HubSocialProvider,
  callbackURL?: string,
) {
  const c = getHubAuthClient();
  return c.signIn.social({
    provider,
    callbackURL:
      callbackURL ??
      (typeof window !== "undefined" ? window.location.origin : undefined),
  });
}

/**
 * Start social OAuth without navigating this window.
 * Returns the provider authorize URL so desktop can open the system browser
 * (`shell.openExternal`) while the Electron UI stays put.
 */
export async function hubSignInSocialUrl(
  provider: HubSocialProvider,
  callbackURL?: string,
): Promise<string> {
  const c = getHubAuthClient();
  const { data, error } = await c.signIn.social({
    provider,
    callbackURL:
      callbackURL ??
      (typeof window !== "undefined" ? window.location.origin : undefined),
    disableRedirect: true,
  });
  if (error) {
    throw new Error(error.message || "Hub sign-in failed");
  }
  const url =
    data && typeof data === "object" && "url" in data
      ? String((data as { url?: string }).url ?? "")
      : "";
  if (!url) {
    throw new Error("Hub did not return an OAuth URL");
  }
  return url;
}

/** Linked OAuth providers for the current user (cookie or device Bearer). */
export async function hubListAccounts(): Promise<HubLinkedAccount[]> {
  if (!hubConfigured()) return [];
  const res = await hubFetch("/v1/me/accounts");
  if (res.status === 401) return [];
  if (!res.ok) {
    throw new Error(`Failed to list linked accounts (${res.status})`);
  }
  const body = (await res.json()) as { accounts?: HubLinkedAccount[] };
  return Array.isArray(body.accounts) ? body.accounts : [];
}

export async function hubUnlinkAccount(opts: {
  providerId: string;
  accountId?: string;
}): Promise<void> {
  const res = await hubFetch("/v1/me/accounts/unlink", {
    method: "POST",
    body: JSON.stringify({
      provider_id: opts.providerId,
      account_id: opts.accountId,
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    if (err.error === "cannot_unlink_last_account") {
      throw new Error("You can't unlink your last account");
    }
    throw new Error(err.error || `Failed to unlink account (${res.status})`);
  }
}

/**
 * End Hub browser session: deletes the session server-side and clears Hub
 * session cookies (Set-Cookie expire) via credentials:include.
 */
export async function hubSignOut() {
  if (!hubConfigured()) return;
  const c = getHubAuthClient();
  const { error } = await c.signOut();
  if (error) {
    throw new Error(error.message || "Hub sign-out failed");
  }
}

/**
 * Permanently delete the current Atmos user (and linked accounts, sessions,
 * devices, integrations). Works with session cookie or device Bearer.
 */
export async function hubDeleteAccount(): Promise<void> {
  const res = await hubFetch("/v1/me/delete", { method: "POST" });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Failed to delete account (${res.status})`);
  }
  // Clear any leftover client session cookie state.
  try {
    await hubSignOut();
  } catch {
    /* user already gone */
  }
}
