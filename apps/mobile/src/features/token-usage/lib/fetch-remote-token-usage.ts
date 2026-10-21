import type { TokenUsageOverviewResponse } from "@atmos/api-types/ws/dto/token-usage";

export const REMOTE_TOKEN_USAGE_CONNECT_WAIT_MS = 15_000;
export const REMOTE_TOKEN_USAGE_REQUEST_TIMEOUT_MS = 60_000;

export type RemoteTokenUsageSession = {
  connect: () => Promise<void>;
  disconnect: () => void;
  request: (
    action: "token_usage_overview_get",
    data: {
      clients: null;
      group_by: null;
      refresh: true;
      since: null;
      try_cookies: false;
      until: null;
      year: null;
    },
    opts: { timeoutMs: number },
  ) => Promise<TokenUsageOverviewResponse>;
  waitUntilConnected: (timeoutMs: number) => Promise<void>;
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
    return await session.request(
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
