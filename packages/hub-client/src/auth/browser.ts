/**
 * Better Auth client for Atmos Hub (browser / desktop webview).
 * Uses `better-auth/react` so UI libraries (e.g. better-auth-ui) can call `useSession`.
 * @see https://better-auth.com/docs/installation (Client section)
 */
import { createAuthClient } from "better-auth/react";
import { hubBaseUrl, hubConfigured, requireHubBaseUrl } from "../config";

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

export async function hubGetSession() {
  if (!hubConfigured()) return null;
  const c = getHubAuthClient();
  const { data, error } = await c.getSession();
  if (error) return null;
  return data;
}

export async function hubSignInSocial(
  provider: "github" | "google",
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

export async function hubSignOut() {
  if (!hubConfigured()) return;
  const c = getHubAuthClient();
  await c.signOut();
}
