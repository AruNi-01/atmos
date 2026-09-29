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
