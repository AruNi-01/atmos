"use client";

import { getAtmosWebQueryClient } from "@/providers/app/query-client";
import { getComputerQueryScope, getRelayQueryScope } from "@/api/query/query-scope";
import {
  resolveRelayUrl,
  useAtmosComputerStore,
  type AtmosComputerConnectionMode,
} from "@/features/connection/lib/atmos-computer-store";

type IdentityPatch = {
  relayUrl?: string;
  relaySecretKey?: string;
  accessToken?: string;
  accessTokenConfigured?: boolean;
};

type RelaySessionTransport = {
  relayWebSocketUrl: string | null;
  relayGatewayHttpBase: string | null;
  relayClientToken: string | null;
};

function removeComputerQueries(): void {
  const client = getAtmosWebQueryClient();
  void client.cancelQueries({ queryKey: ["atmos", "computer"] });
  client.removeQueries({ queryKey: ["atmos", "computer"] });
}

function removeRelayQueries(): void {
  const client = getAtmosWebQueryClient();
  void client.cancelQueries({ queryKey: ["atmos", "relay"] });
  client.removeQueries({ queryKey: ["atmos", "relay"] });
}

/**
 * Apply identity-bearing Relay/credential settings and clear related Query caches.
 */
export async function applyIdentityBearingComputerSettings(
  patch: IdentityPatch,
): Promise<void> {
  const store = useAtmosComputerStore.getState();
  const nextUrl =
    patch.relayUrl !== undefined ? resolveRelayUrl(patch.relayUrl) : resolveRelayUrl(store.relayUrl);
  const nextSecret =
    patch.relaySecretKey !== undefined ? patch.relaySecretKey : store.relaySecretKey;
  const nextToken = patch.accessToken !== undefined ? patch.accessToken : store.accessToken;

  const identityChanged =
    nextUrl !== resolveRelayUrl(store.relayUrl) ||
    nextSecret !== store.relaySecretKey ||
    nextToken !== store.accessToken ||
    (patch.accessTokenConfigured !== undefined &&
      patch.accessTokenConfigured !== store.accessTokenConfigured);

  if (patch.relayUrl !== undefined) store.setRelayUrl(nextUrl);
  if (patch.relaySecretKey !== undefined) store.setRelaySecretKey(nextSecret);
  if (patch.accessToken !== undefined) store.setAccessToken(nextToken);
  if (patch.accessTokenConfigured !== undefined) {
    store.setAccessTokenConfigured(patch.accessTokenConfigured);
  }

  if (identityChanged) {
    store.bumpRelayAuthRevision();
    removeRelayQueries();
    removeComputerQueries();
  }
}

/**
 * Atomically apply Relay gateway/session transport and bump session revision once.
 */
export async function applyRelaySessionTransport(
  session: RelaySessionTransport,
): Promise<void> {
  const store = useAtmosComputerStore.getState();
  const changed =
    store.relayWebSocketUrl !== session.relayWebSocketUrl ||
    store.relayGatewayHttpBase !== session.relayGatewayHttpBase ||
    store.relayClientToken !== session.relayClientToken;

  if (!changed) return;

  // Cancel previous Computer-scoped HTTP/WS snapshots before accepting new gateway identity.
  removeComputerQueries();
  store.setRelaySessionTransport(session);
}

export async function clearQueryStateForLogout(): Promise<void> {
  const store = useAtmosComputerStore.getState();
  store.bumpRelayAuthRevision();
  removeRelayQueries();
  removeComputerQueries();
}

/** Clear Relay session fields and Computer Query roots together. */
export async function resetRelaySessionForQuery(): Promise<void> {
  removeComputerQueries();
  useAtmosComputerStore.getState().resetRelaySession();
}

/** Convenience: read current scopes after identity transitions (tests / diagnostics). */
export function peekQueryScopes() {
  return {
    computer: getComputerQueryScope(),
    relay: getRelayQueryScope(),
  };
}

export type { AtmosComputerConnectionMode };
