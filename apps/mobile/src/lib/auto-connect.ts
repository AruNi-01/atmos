import type { RelayClient } from "@atmos/relay-client";
import type { ComputerRow } from "@/api/types";
import { getAutoConnectComputerId } from "@/features/computers/computer-selection";
import { requireDeviceCredential } from "@/lib/device-credential";
import { useComputerStore } from "@/stores/computer-store";
import { useSessionStore } from "@/stores/session-store";

/**
 * After device credential is accepted: list computers and open a session when
 * exactly one online computer is available (or a previous selection is online).
 */
export async function autoConnectAfterAuth(client: RelayClient): Promise<{
  computers: ComputerRow[];
  connectedServerId: string | null;
}> {
  let token: string;
  try {
    token = requireDeviceCredential();
  } catch {
    return { computers: [], connectedServerId: null };
  }

  const computers = await client.withDeviceCredential(token).listComputers();
  useComputerStore.getState().setComputers(computers);

  const session = useSessionStore.getState();
  const target = getAutoConnectComputerId({
    activeClientSession: null,
    computers,
    selectedServerId: session.selectedServerId,
  });

  if (!target) {
    return { computers, connectedServerId: null };
  }

  const clientSession = await client
    .withDeviceCredential(token)
    .createClientSession(target, { clientKind: "mobile" });
  session.selectServer(target);
  session.setClientSession(clientSession);
  return { computers, connectedServerId: target };
}
