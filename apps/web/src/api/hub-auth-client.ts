/**
 * Better Auth client for Atmos Hub (browser).
 * @see https://better-auth.com/docs/installation (Client section)
 *
 * Import from better-auth/client for tree-shaking-friendly vanilla client.
 * Methods: signIn.social(), signOut(), useSession() / getSession().
 */
"use client";

import { createAuthClient } from "better-auth/client";
import { hubBaseUrl, hubConfigured } from "@/api/hub-client";

let client: ReturnType<typeof createAuthClient> | null = null;

export function getHubAuthClient() {
  if (!hubConfigured()) {
    throw new Error("NEXT_PUBLIC_ATMOS_HUB_URL is not set");
  }
  if (!client) {
    client = createAuthClient({
      baseURL: hubBaseUrl(),
      // credentials / cookies handled by better-auth client defaults
    });
  }
  return client;
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
    callbackURL: callbackURL ?? (typeof window !== "undefined" ? window.location.origin : undefined),
  });
}

export async function hubSignOut() {
  if (!hubConfigured()) return;
  const c = getHubAuthClient();
  await c.signOut();
}
