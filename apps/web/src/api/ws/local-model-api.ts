"use client";

import { wsRequest } from "@/api/ws/request";

// Matches the backend `LocalModelState` serde shape:
// #[serde(tag = "status", rename_all = "snake_case")]
export type LocalModelStatus =
  | { status: "not_installed" }
  | { status: "downloading_runtime"; progress: number; eta_seconds?: number | null }
  | { status: "downloading_model"; model_id: string; progress: number; eta_seconds?: number | null }
  | { status: "installed_not_running"; model_id: string }
  | { status: "starting"; model_id: string; stage?: string | null }
  | { status: "running"; endpoint: string; model_id: string }
  | { status: "failed"; error: string };

export interface LocalModelRuntimeInfo {
  installed: boolean;
}

export interface LocalModelEntry {
  id: string;
  display_name: string;
  description: string;
  size_bytes: number;
  ram_footprint_mb: number;
  license: string;
  license_url: string;
  sha256: string;
  tags: string[];
  recommended: boolean;
  installed: boolean;
  custom?: boolean;
  source_url?: string | null;
}

export interface LocalModelHfChoice {
  repo_id: string;
  filename: string;
  url: string;
  size_bytes?: number | null;
  ram_footprint_mb?: number | null;
  discovered?: boolean;
}

export type LocalModelHfResolveResponse =
  | { kind: "model"; model: LocalModelEntry }
  | { kind: "choices"; choices: LocalModelHfChoice[] };

export interface LocalModelListResponse {
  runtime: LocalModelRuntimeInfo;
  models: LocalModelEntry[];
  state: LocalModelStatus;
}

export const localModelApi = {
  list: async (): Promise<LocalModelListResponse> => {
    return wsRequest<LocalModelListResponse>("local_model_list");
  },
  refresh: async (): Promise<LocalModelListResponse> => {
    return wsRequest<LocalModelListResponse>("local_model_refresh");
  },
  downloadRuntime: async (): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("local_model_runtime_download", {}, 600_000);
  },
  download: async (modelId: string): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("local_model_download", { model_id: modelId }, 600_000);
  },
  start: async (modelId: string): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("local_model_start", { model_id: modelId }, 60_000);
  },
  stop: async (): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("local_model_stop");
  },
  delete: async (modelId: string): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("local_model_delete", { model_id: modelId });
  },
  deleteRuntime: async (): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("local_model_delete_runtime", {});
  },
  status: async (): Promise<LocalModelStatus> => {
    return wsRequest<LocalModelStatus>("local_model_status");
  },
  resolveHfUrl: async (url: string): Promise<LocalModelHfResolveResponse> => {
    return wsRequest<LocalModelHfResolveResponse>("local_model_resolve_hf_url", { url }, 60_000);
  },
  addCustom: async (input: {
    url: string;
    displayName?: string;
    ramFootprintMb?: number;
  }): Promise<{ ok: boolean; model: LocalModelEntry }> => {
    return wsRequest<{ ok: boolean; model: LocalModelEntry }>(
      "local_model_custom_add",
      {
        url: input.url,
        display_name: input.displayName,
        ram_footprint_mb: input.ramFootprintMb,
      },
      60_000,
    );
  },
  deleteCustom: async (modelId: string): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("local_model_custom_delete", { model_id: modelId });
  },
};
