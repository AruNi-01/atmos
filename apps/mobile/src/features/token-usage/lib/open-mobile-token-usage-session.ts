import type { WebSocketLike } from "@atmos/api-client/platform";
import { createWsSession } from "@atmos/api-client/ws";
import type { TokenUsageOverviewResponse } from "@atmos/api-types/ws/dto/token-usage";
import { attachRelayFrameE2ee, createRelayClient, type RelayE2eeOffer } from "@atmos/relay-client";
import { preferredComputerWebSocket } from "@/api/url-session-websocket";
import {
  fetchRemoteTokenUsageOverview,
  remoteTokenUsageSessionOptions,
  type RemoteTokenUsageSession,
} from "@/features/token-usage/lib/fetch-remote-token-usage";
import { requireDeviceCredential } from "@/lib/device-credential";

export function openMobileRemoteTokenUsageSession(
  wsUrl: string,
  e2ee?: RelayE2eeOffer,
): RemoteTokenUsageSession {
  return createWsSession({
    url: wsUrl,
    platform: {
      createWebSocket: (url: string) =>
        attachRelayFrameE2ee(
          (next) => preferredComputerWebSocket(next) as unknown as WebSocketLike,
          url,
          e2ee,
          "app",
        ),
    },
    ...remoteTokenUsageSessionOptions(),
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
      return { ws_url: session.ws_url, e2ee: session.e2ee };
    },
    openSession: openMobileRemoteTokenUsageSession,
  });
}
