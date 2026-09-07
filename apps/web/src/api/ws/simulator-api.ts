"use client";

import { wsRequest } from "@/api/ws/request";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import type {
  SimulatorDownloadProgress,
} from "@atmos/api-types/ws/dto/simulator";

export const simulatorApi = {
  probe: () => wsRequest("simulator_probe"),
  start: (
    workspaceId: string,
    opts?: { udid?: string; platform?: "ios" | "android" },
  ) =>
    wsRequest("simulator_start", {
      workspace_id: workspaceId,
      udid: opts?.udid,
      platform: opts?.platform,
    }, 600_000),
  stop: (workspaceId: string) =>
    wsRequest("simulator_stop", {
      workspace_id: workspaceId,
    }),
  status: (workspaceId: string) =>
    wsRequest("simulator_status", {
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
