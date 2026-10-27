import { useQuery } from "@tanstack/react-query";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";

/** Enabled agents for the Session filter sheet. Runs only while that sheet is mounted. */
export function useSessionAgentCatalog() {
  const { client, state: wsState } = useMobileWs();
  const hasDeviceCredential = useSessionStore((state) => state.hasDeviceCredential);
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const connected = hasDeviceCredential && wsState === "open";

  return useQuery({
    queryKey: ["session-agent-catalog", selectedServerId],
    enabled: Boolean(client && connected),
    queryFn: () => {
      if (!client) return Promise.reject(new Error("Atmos mobile WebSocket is not connected"));
      return wsActions.agentSessionStatusList(client, { agents_only: true, limit: 1 });
    },
    select: (page) => page.agents ?? [],
  });
}
