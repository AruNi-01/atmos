"use client";

import { wsRequest } from "@/api/ws/request";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import type {
  SimulatorClaim,
  SimulatorDownloadProgress,
  SimulatorProbe,
  SimulatorReason,
} from "@/features/simulator/types";

export type SimulatorStartResult = {
  ready: boolean;
  reason?: SimulatorReason;
  url?: string | null;
  udid?: string | null;
} & Partial<SimulatorProbe>;

export const simulatorApi = {
  probe: () => wsRequest<SimulatorProbe>("simulator_probe"),
  start: (workspaceId: string, udid?: string) =>
    wsRequest<SimulatorStartResult>(
      "simulator_start",
      { workspace_id: workspaceId, udid },
      600_000,
    ),
  stop: (workspaceId: string) =>
    wsRequest<{ stopped: boolean }>("simulator_stop", {
      workspace_id: workspaceId,
    }),
  status: (workspaceId: string) =>
    wsRequest<SimulatorClaim | null>("simulator_status", {
      workspace_id: workspaceId,
    }),
};

export function listenSimulatorDownload(
  handler: (payload: SimulatorDownloadProgress) => void,
): () => void {
  return useWebSocketStore.getState().onEvent(
    "simulator_download_progress",
    (data: unknown) => {
      handler(data as SimulatorDownloadProgress);
    },
  );
}
