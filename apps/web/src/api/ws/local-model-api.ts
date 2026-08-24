"use client";

import { wsRequest } from "@/api/ws/request";
import type {
  LocalModelEntry,
  LocalModelHfResolveResponse,
  LocalModelListResponse,
  LocalModelStatus,
} from "@atmos/api-types/ws/dto/local-model";

export type {
  LocalModelEntry,
  LocalModelHfChoice,
  LocalModelHfResolveResponse,
  LocalModelListResponse,
  LocalModelRuntimeInfo,
  LocalModelStatus,
} from "@atmos/api-types/ws/dto/local-model";

export const localModelApi = {
  list: async (): Promise<LocalModelListResponse> => {
    return wsRequest("local_model_list");
  },
  refresh: async (): Promise<LocalModelListResponse> => {
    return wsRequest("local_model_refresh");
  },
  downloadRuntime: async (): Promise<{ ok: boolean }> => {
    return wsRequest("local_model_runtime_download", {}, 600_000);
  },
  download: async (modelId: string): Promise<{ ok: boolean }> => {
    return wsRequest("local_model_download", { model_id: modelId }, 600_000);
  },
  start: async (modelId: string): Promise<{ ok: boolean }> => {
    return wsRequest("local_model_start", { model_id: modelId }, 60_000);
  },
  stop: async (): Promise<{ ok: boolean }> => {
    return wsRequest("local_model_stop");
  },
  delete: async (modelId: string): Promise<{ ok: boolean }> => {
    return wsRequest("local_model_delete", { model_id: modelId });
  },
  deleteRuntime: async (): Promise<{ ok: boolean }> => {
    return wsRequest("local_model_delete_runtime", {});
  },
  status: async (): Promise<LocalModelStatus> => {
    return wsRequest("local_model_status");
  },
  resolveHfUrl: async (url: string): Promise<LocalModelHfResolveResponse> => {
    return wsRequest("local_model_resolve_hf_url", { url }, 60_000);
  },
  addCustom: async (input: {
    url: string;
    displayName?: string;
    ramFootprintMb?: number;
  }): Promise<{ ok: boolean; model: LocalModelEntry }> => {
    return wsRequest("local_model_custom_add",
      {
        url: input.url,
        display_name: input.displayName,
        ram_footprint_mb: input.ramFootprintMb,
      },
      60_000,
    );
  },
  deleteCustom: async (modelId: string): Promise<{ ok: boolean }> => {
    return wsRequest("local_model_custom_delete", { model_id: modelId });
  },
};
