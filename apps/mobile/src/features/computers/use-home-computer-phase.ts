import { useQuery } from "@tanstack/react-query";
import { activeComputers } from "@atmos/relay-client";
import { getAutoConnectComputerId } from "@/features/computers/computer-selection";
import { workspaceHomePhase } from "@/features/workspaces/home-connection";
import { useRelayClient } from "@/hooks/use-relay-client";
import { requireDeviceCredential } from "@/lib/device-credential";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useComputerStore } from "@/stores/computer-store";
import { useSessionStore } from "@/stores/session-store";

/** Same Computer list the Workspace home uses, shared through the query cache. */
export function useHomeComputerPhase() {
  const relayClient = useRelayClient();
  const { state: wsState } = useMobileWs();
  const deviceCredentialLoaded = useSessionStore((state) => state.deviceCredentialLoaded);
  const hasDeviceCredential = useSessionStore((state) => state.hasDeviceCredential);
  const relayUrl = useSessionStore((state) => state.relayUrl);
  const relayAuthRevision = useSessionStore((state) => state.relayAuthRevision);
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const activeClientSession = useSessionStore((state) => state.activeClientSession);
  const sessionHydrated = useSessionStore((state) => state.sessionHydrated);
  const setComputers = useComputerStore((state) => state.setComputers);
  const computersQuery = useQuery({
    queryKey: ["computers", relayUrl, relayAuthRevision],
    enabled: deviceCredentialLoaded && hasDeviceCredential,
    queryFn: async () => {
      const token = requireDeviceCredential();
      const computers = await relayClient.withDeviceCredential(token).listComputers();
      setComputers(computers);
      return computers;
    },
  });
  const computers = computersQuery.data ?? [];
  const cachedComputerId =
    sessionHydrated && computersQuery.isSuccess
      ? getAutoConnectComputerId({
          activeClientSession: null,
          computers,
          selectedServerId,
        })
      : null;

  return workspaceHomePhase({
    bootstrapPending: false,
    computerCount: activeComputers(computers).length,
    computersFetched: computersQuery.isFetched,
    computersPending: computersQuery.isPending,
    createError: false,
    createPending: false,
    deviceCredentialLoaded,
    hasActiveSession: Boolean(activeClientSession),
    hasCachedComputer: Boolean(cachedComputerId),
    hasDeviceCredential,
    sessionHydrated,
    wsState,
  });
}
