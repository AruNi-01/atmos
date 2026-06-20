import type { ComputerRow } from "@/api/types";

export function selectableOnlineComputers(computers: ComputerRow[]) {
  return computers.filter((computer) => !computer.revoked && computer.online);
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

  const onlineComputers = selectableOnlineComputers(computers);
  if (selectedServerId && onlineComputers.some((computer) => computer.server_id === selectedServerId)) {
    return selectedServerId;
  }

  if (!selectedServerId && onlineComputers.length === 1) {
    return onlineComputers[0]?.server_id ?? null;
  }

  return null;
}
