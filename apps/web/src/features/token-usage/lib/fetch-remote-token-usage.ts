"use client";

import { createWsSession } from "@atmos/api-client/ws";
import { isPlausibleDeviceCredential } from "@atmos/relay-client";
import type { TokenUsageOverviewResponse } from "@/api/ws/token-usage-api";
import { getWebRelayClient } from "@/features/connection/lib/create-web-relay-client";
import { workbenchRelayClientKind } from "@/features/connection/lib/workbench-relay-client-kind";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";

export const REMOTE_TOKEN_USAGE_CONNECT_WAIT_MS = 15_000;
export const REMOTE_TOKEN_USAGE_REQUEST_TIMEOUT_MS = 60_000;

export type RemoteTokenUsageSession = {
  connect: () => Promise<void>;
  waitUntilConnected: (timeoutMs?: number) => Promise<void>;
  request: <T>(
    action: string,
    data?: unknown,
    opts?: { timeoutMs?: number },
  ) => Promise<T>;
  disconnect: () => void;
};

export type FetchRemoteTokenUsageDeps = {
  createClientSession: (serverId: string) => Promise<{ ws_url: string }>;
  openSession: (wsUrl: string) => RemoteTokenUsageSession;
};

export async function fetchRemoteTokenUsageOverview(
  serverId: string,
  deps: FetchRemoteTokenUsageDeps,
): Promise<TokenUsageOverviewResponse> {
  const trimmed = serverId.trim();
  if (!trimmed) {
    throw new Error("Computer id is required");
  }

  const sessionInfo = await deps.createClientSession(trimmed);
  const session = deps.openSession(sessionInfo.ws_url);
  try {
    await session.waitUntilConnected(REMOTE_TOKEN_USAGE_CONNECT_WAIT_MS);
    return await session.request<TokenUsageOverviewResponse>(
      "token_usage_overview_get",
      {
        refresh: true,
        try_cookies: false,
        year: null,
        since: null,
        until: null,
        clients: null,
        group_by: null,
      },
      { timeoutMs: REMOTE_TOKEN_USAGE_REQUEST_TIMEOUT_MS },
    );
  } finally {
    session.disconnect();
  }
}

function browserWsPlatform() {
  return {
    createWebSocket: (url: string) =>
      new WebSocket(url) as unknown as import("@atmos/api-client/platform").WebSocketLike,
  };
}

export function openRemoteTokenUsageSession(wsUrl: string): RemoteTokenUsageSession {
  return createWsSession({
    url: wsUrl,
    platform: browserWsPlatform(),
    reconnect: { enabled: false, maxAttempts: 0, exhausted: { type: "stop" } },
    requestTimeoutMs: REMOTE_TOKEN_USAGE_REQUEST_TIMEOUT_MS,
    connectWaitMs: REMOTE_TOKEN_USAGE_CONNECT_WAIT_MS,
  });
}

export async function fetchRemoteTokenUsageOverviewFromRelay(
  serverId: string,
): Promise<TokenUsageOverviewResponse> {
  const state = useAtmosComputerStore.getState();
  const credential = state.accessToken.trim();
  if (!isPlausibleDeviceCredential(credential)) {
    throw new Error("Sign in to load another Computer");
  }
  return fetchRemoteTokenUsageOverview(serverId, {
    createClientSession: async (id) => {
      const session = await getWebRelayClient({
        relayUrl: state.relayUrl,
        relaySecretKey: state.relaySecretKey,
      })
        .withDeviceCredential(credential)
        .createClientSession(id, { clientKind: workbenchRelayClientKind() });
      return { ws_url: session.ws_url };
    },
    openSession: openRemoteTokenUsageSession,
  });
}
