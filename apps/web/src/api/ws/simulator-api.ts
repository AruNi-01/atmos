"use client";

import { wsRequest } from "@/api/ws/request";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import type {
  SimulatorAppearance,
  SimulatorCameraLens,
  SimulatorDevicePlatform,
  SimulatorDevicesChanged,
  SimulatorDownloadProgress,
} from "@atmos/api-types/ws/dto/simulator";

export type {
  SimulatorAppearance,
  SimulatorAppearanceResult,
  SimulatorCameraAck,
  SimulatorCameraLens,
  SimulatorCreateRequest,
  SimulatorDeleteResponse,
  SimulatorDevice,
  SimulatorDeviceOpRequest,
  SimulatorDevicePlatform,
  SimulatorDeviceResult,
  SimulatorDevicesChanged,
  SimulatorDownloadProgress,
  SimulatorInventory,
  SimulatorInventoryRequest,
} from "@atmos/api-types/ws/dto/simulator";

export const simulatorApi = {
  probe: () => wsRequest("simulator_probe"),
  start: (
    workspaceId: string,
    opts?: { udid?: string; platform?: SimulatorDevicePlatform },
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
  list: (workspaceId?: string | null) =>
    wsRequest("simulator_list", {
      workspace_id: workspaceId,
    }),
  inventory: (workspaceId?: string | null) =>
    wsRequest("simulator_inventory", {
      workspace_id: workspaceId,
    }),
  create: (input: {
    platform: SimulatorDevicePlatform;
    device_type: string;
    runtime: string;
    name?: string;
  }) =>
    wsRequest("simulator_create", {
      platform: input.platform,
      device_type: input.device_type,
      runtime: input.runtime,
      name: input.name,
    }),
  boot: (
    workspaceId: string,
    udid: string,
    platform: SimulatorDevicePlatform,
  ) =>
    wsRequest("simulator_boot", {
      workspace_id: workspaceId,
      udid,
      platform,
    }),
  shutdown: (
    workspaceId: string,
    udid: string,
    platform: SimulatorDevicePlatform,
  ) =>
    wsRequest("simulator_shutdown", {
      workspace_id: workspaceId,
      udid,
      platform,
    }),
  delete: (
    workspaceId: string,
    udid: string,
    platform: SimulatorDevicePlatform,
  ) =>
    wsRequest("simulator_delete", {
      workspace_id: workspaceId,
      udid,
      platform,
    }),
  appearanceGet: (
    workspaceId: string,
    opts?: { udid?: string; platform?: SimulatorDevicePlatform },
  ) =>
    wsRequest("simulator_appearance_get", {
      workspace_id: workspaceId,
      udid: opts?.udid,
      platform: opts?.platform,
    }),
  appearanceSet: (
    workspaceId: string,
    appearance: SimulatorAppearance,
    opts?: { udid?: string; platform?: SimulatorDevicePlatform },
  ) =>
    wsRequest("simulator_appearance_set", {
      workspace_id: workspaceId,
      appearance,
      udid: opts?.udid,
      platform: opts?.platform,
    }),
  cameraInject: (
    workspaceId: string,
    lens: SimulatorCameraLens,
    source: { path?: string; png_base64?: string },
    opts?: { udid?: string; platform?: SimulatorDevicePlatform },
  ) =>
    wsRequest("simulator_camera_inject", {
      workspace_id: workspaceId,
      lens,
      path: source.path,
      png_base64: source.png_base64,
      udid: opts?.udid,
      platform: opts?.platform,
    }),
  cameraClear: (
    workspaceId: string,
    lens: SimulatorCameraLens,
    opts?: { udid?: string; platform?: SimulatorDevicePlatform },
  ) =>
    wsRequest("simulator_camera_clear", {
      workspace_id: workspaceId,
      lens,
      udid: opts?.udid,
      platform: opts?.platform,
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

export function listenSimulatorDevicesChanged(
  handler: (payload: SimulatorDevicesChanged) => void,
): () => void {
  return useWebSocketStore.getState().onEvent(
    "simulator_devices_changed",
    (data: unknown) => {
      handler(data as SimulatorDevicesChanged);
    },
  );
}
