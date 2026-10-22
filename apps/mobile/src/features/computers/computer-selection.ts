import { activeComputers, onlineComputers } from "@atmos/relay-client";
import type { ComputerRow } from "@/api/types";

export function selectableOnlineComputers(computers: ComputerRow[]) {
  return onlineComputers(computers);
}

/**
 * One non-revoked Computer is the default after login or a pair scan.
 * A previous choice is reused only when it is still online. Several Computers
 * and no valid choice stay unselected so the home screen can ask.
 */
/**
 * After a new device credential, keep a Computer id only when it is still in
 * the new account's list. Anything else, including the previous account's
 * selection, is dropped together with the old client session.
 */
export function retainedServerIdAfterAuthMiss(
  computers: { server_id: string }[],
  selectedServerId: string | null,
): string | null {
  if (!selectedServerId) return null;
  return computers.some((computer) => computer.server_id === selectedServerId)
    ? selectedServerId
    : null;
}

export function getAutoConnectComputerId({
  activeClientSession,
  computers,
  selectedServerId,
}: {
  activeClientSession: unknown | null;
  computers: ComputerRow[];
  selectedServerId: string | null;
}) {
  if (activeClientSession) return null;

  const available = activeComputers(computers);
  if (available.length === 1) {
    return available[0]?.server_id ?? null;
  }

  const online = selectableOnlineComputers(computers);
  if (selectedServerId && online.some((computer) => computer.server_id === selectedServerId)) {
    return selectedServerId;
  }

  return null;
}
