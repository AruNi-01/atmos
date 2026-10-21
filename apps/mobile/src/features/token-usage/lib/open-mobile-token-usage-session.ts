import type { WebSocketLike } from "@atmos/api-client/platform";
import { createWsSession } from "@atmos/api-client/ws";
import type { TokenUsageOverviewResponse } from "@atmos/api-types/ws/dto/token-usage";
import { createRelayClient } from "@atmos/relay-client";
import { preferredComputerWebSocket } from "@/api/url-session-websocket";
import {
  fetchRemoteTokenUsageOverview,
  REMOTE_TOKEN_USAGE_CONNECT_WAIT_MS,
  REMOTE_TOKEN_USAGE_REQUEST_TIMEOUT_MS,
  type RemoteTokenUsageSession,
} from "@/features/token-usage/lib/fetch-remote-token-usage";
import { requireDeviceCredential } from "@/lib/device-credential";

export function openMobileRemoteTokenUsageSession(wsUrl: string): RemoteTokenUsageSession {
  return createWsSession({
    url: wsUrl,
    platform: {
      createWebSocket: (url: string) => preferredComputerWebSocket(url) as unknown as WebSocketLike,
    },
    reconnect: { enabled: false, maxAttempts: 0, exhausted: { type: "stop" } },
    requestTimeoutMs: REMOTE_TOKEN_USAGE_REQUEST_TIMEOUT_MS,
    connectWaitMs: REMOTE_TOKEN_USAGE_CONNECT_WAIT_MS,
  });
}

export async function fetchMobileRemoteTokenUsageOverview(
  serverId: string,
  relay: ReturnType<typeof createRelayClient>,
): Promise<TokenUsageOverviewResponse> {
  const credential = requireDeviceCredential();
  return fetchRemoteTokenUsageOverview(serverId, {
    createClientSession: async (id) => {
      const session = await relay
        .withDeviceCredential(credential)
        .createClientSession(id, { clientKind: "mobile" });
      return { ws_url: session.ws_url };
    },
    openSession: openMobileRemoteTokenUsageSession,
  });
}
