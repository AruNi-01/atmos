import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TokenUsageOverviewResponse } from "@atmos/api-types/ws/dto/token-usage";
import type { createRelayClient } from "@atmos/relay-client";
import type { MobileWsClient } from "@/api/mobile-ws-client";
import { wsActions } from "@/api/ws-actions";
import { fetchAllComputersTokenUsage } from "@/features/token-usage/lib/fetch-all-token-usage";
import { fetchMobileRemoteTokenUsageOverview } from "@/features/token-usage/lib/open-mobile-token-usage-session";
import {
  shouldShowComputerSelect,
  uniqueComputers,
  type UniqueComputer,
} from "@/features/token-usage/lib/unique-computers";
import {
  missedComputerWarning,
  refreshFailureApplies,
  resolveUsageScope,
  tokenUsageDisplayedError,
} from "@/features/token-usage/lib/usage-scope";
import {
  displayedOverview,
  publishOverview,
} from "@/features/token-usage/usage-displayed-overview";
import { useRelayClient } from "@/hooks/use-relay-client";
import { requireDeviceCredential } from "@/lib/device-credential";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useComputerStore } from "@/stores/computer-store";
import { useSessionStore } from "@/stores/session-store";

type Relay = ReturnType<typeof createRelayClient>;

type UsageScope = ReturnType<typeof resolveUsageScope>;

async function loadCurrent(client: MobileWsClient | null, refresh: boolean) {
  if (!client) throw new Error("Atmos mobile WebSocket is not connected");
  return wsActions.tokenUsageOverview(client, { refresh, try_cookies: false });
}

async function loadScoped(input: {
  client: MobileWsClient | null;
  devices: UniqueComputer[];
  relay: Relay;
  scope: UsageScope;
}) {
  const fetchRemote = (serverId: string) =>
    fetchMobileRemoteTokenUsageOverview(serverId, input.relay);
  if (input.scope.isAll) {
    return fetchAllComputersTokenUsage(input.devices, {
      fetchCurrent: () => loadCurrent(input.client, true),
      fetchRemote,
      formatMissed: missedComputerWarning,
    });
  }
  const serverId = input.scope.selectedDevice?.serverId;
  if (!serverId) throw new Error("Could not load that Computer.");
  return fetchRemote(serverId);
}

export function useTokenUsageOverview() {
  const queryClient = useQueryClient();
  const relay = useRelayClient();
  const { client, state } = useMobileWs();
  const wsUrl = useSessionStore((store) => store.activeClientSession?.ws_url ?? null);
  const selectedServerId = useSessionStore((store) => store.selectedServerId);
  const hasDeviceCredential = useSessionStore((store) => store.hasDeviceCredential);
  const deviceCredentialLoaded = useSessionStore((store) => store.deviceCredentialLoaded);
  const relayUrl = useSessionStore((store) => store.relayUrl);
  const relayAuthRevision = useSessionStore((store) => store.relayAuthRevision);
  const setComputers = useComputerStore((store) => store.setComputers);
  const storedComputers = useComputerStore((store) => store.computers);
  const [usageSelection, setUsageSelection] = useState<string | null>(null);

  const computersQuery = useQuery({
    enabled: deviceCredentialLoaded && hasDeviceCredential,
    queryFn: async () => {
      const token = requireDeviceCredential();
      const computers = await relay.withDeviceCredential(token).listComputers();
      setComputers(computers);
      return computers;
    },
    queryKey: ["computers", relayUrl, relayAuthRevision],
  });

  const devices = useMemo(
    () => uniqueComputers(computersQuery.data ?? storedComputers, null, selectedServerId),
    [computersQuery.data, selectedServerId, storedComputers],
  );
  const showSelect = shouldShowComputerSelect({
    signedIn: hasDeviceCredential,
    uniqueCount: devices.length,
  });
  const scope = useMemo(
    () => resolveUsageScope({ devices, selection: usageSelection, showSelect }),
    [devices, showSelect, usageSelection],
  );

  const connected = state === "open" && client != null;
  const currentKey = ["token-usage-overview", wsUrl] as const;
  const scopedKey = [
    "token-usage-overview",
    "scope",
    relayUrl,
    relayAuthRevision,
    scope.scopedUsageKey,
  ] as const;

  const currentQuery = useQuery({
    enabled: connected && scope.isCurrentScope,
    queryFn: () => loadCurrent(client, false),
    queryKey: currentKey,
  });

  const scopedQuery = useQuery({
    enabled: showSelect && !scope.isCurrentScope,
    queryFn: () => loadScoped({ client, devices, relay, scope }),
    queryKey: scopedKey,
    staleTime: 60_000,
  });

  const activeQuery = scope.isCurrentScope ? currentQuery : scopedQuery;
  const [heldOverview, setHeldOverview] = useState<TokenUsageOverviewResponse | null>(null);
  if (activeQuery.data && heldOverview !== activeQuery.data) {
    setHeldOverview(activeQuery.data);
  }
  const overview = displayedOverview({
    active: activeQuery.data,
    failed: activeQuery.isError,
    pending: activeQuery.isPending,
    previous: heldOverview,
  });
  const confirmedOverview = publishOverview(activeQuery.data);

  const refresh = useMutation({
    mutationFn: async (input: {
      client: MobileWsClient | null;
      devices: UniqueComputer[];
      relay: Relay;
      relayAuthRevision: number;
      relayUrl: string;
      scope: UsageScope;
      wsUrl: string | null;
    }): Promise<TokenUsageOverviewResponse> => {
      const key = input.scope.isCurrentScope
        ? (["token-usage-overview", input.wsUrl] as const)
        : ([
            "token-usage-overview",
            "scope",
            input.relayUrl,
            input.relayAuthRevision,
            input.scope.scopedUsageKey,
          ] as const);
      const next = input.scope.isCurrentScope
        ? await loadCurrent(input.client, true)
        : await loadScoped(input);
      queryClient.setQueryData(key, next);
      return next;
    },
  });

  const reload = () => {
    if (scope.isCurrentScope && !connected) return;
    refresh.mutate({
      client,
      devices,
      relay,
      relayAuthRevision,
      relayUrl,
      scope,
      wsUrl,
    });
  };

  const missedWarnings =
    scope.isAll && overview
      ? overview.partial_warnings.filter((line) => line.trim().length > 0)
      : [];

  return {
    connected,
    connectionState: state,
    devices,
    errorMessage: tokenUsageDisplayedError({
      queryError: activeQuery.error,
      refreshApplies: refreshFailureApplies({
        currentRelayAuthRevision: relayAuthRevision,
        currentRelayUrl: relayUrl,
        currentScopeKey: scope.scopedUsageKey,
        currentWsUrl: wsUrl,
        isCurrentScope: scope.isCurrentScope,
        refresh: refresh.variables
          ? {
              isCurrentScope: refresh.variables.scope.isCurrentScope,
              relayAuthRevision: refresh.variables.relayAuthRevision,
              relayUrl: refresh.variables.relayUrl,
              scopeKey: refresh.variables.scope.scopedUsageKey,
              wsUrl: refresh.variables.wsUrl,
            }
          : null,
      }),
      refreshError: refresh.error,
      scope,
    }),
    isAll: scope.isAll,
    isCurrentScope: scope.isCurrentScope,
    isFetching: activeQuery.isFetching,
    isPending: activeQuery.isPending,
    missedWarnings,
    overview,
    publishOverview: confirmedOverview,
    refreshing: refresh.isPending || activeQuery.isRefetching,
    reload,
    selectedKey: scope.selectedKey,
    setUsageSelection,
    showSelect,
    wsUrl,
  };
}
