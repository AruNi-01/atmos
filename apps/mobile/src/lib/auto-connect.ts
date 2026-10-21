import type { RelayClient } from "@atmos/relay-client";
import type { ComputerRow } from "@/api/types";
import {
  getAutoConnectComputerId,
  retainedServerIdAfterAuthMiss,
} from "@/features/computers/computer-selection";
import { requireDeviceCredential } from "@/lib/device-credential";
import { useComputerStore } from "@/stores/computer-store";
import { useSessionStore } from "@/stores/session-store";

/**
 * After device credential is accepted: list computers and open a session when
 * the account has one Computer, or a previous selection is still online.
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

  const session = useSessionStore.getState();
  // Drop the previous account's live socket before the new list returns.
  session.setClientSession(null);
  useComputerStore.getState().setComputers([]);

  const computers = await client.withDeviceCredential(token).listComputers();
  useComputerStore.getState().setComputers(computers);
  const target = getAutoConnectComputerId({
    activeClientSession: null,
    computers,
    selectedServerId: session.selectedServerId,
  });

  if (!target) {
    const retained = retainedServerIdAfterAuthMiss(computers, session.selectedServerId);
    if (retained) session.selectServer(retained);
    else session.clearClientSession();
    return { computers, connectedServerId: null };
  }

  const clientSession = await client
    .withDeviceCredential(token)
    .createClientSession(target, { clientKind: "mobile" });
  session.adoptComputerSession(target, clientSession);
  return { computers, connectedServerId: target };
}
