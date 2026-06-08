"use client";

import { wsRequest } from "@/api/ws/request";

export type LocalServicesScope = "all_atmos_projects" | "current_context";

export type LocalServiceKind =
  | "workspace_dev_server"
  | "likely_workspace_server"
  | "workspace_dependency"
  | "workspace_container_proxy"
  | "protected_atmos_internal";

export type LocalServiceStatus =
  | "online"
  | "probing"
  | "not_http"
  | "stale"
  | "protected"
  | "unsupported";

export interface LocalServicesScanRequest {
  scope?: LocalServicesScope;
  project_id?: string | null;
  workspace_id?: string | null;
  force?: boolean;
  include_diagnostics?: boolean;
}

export interface LocalServiceOwner {
  project_id?: string | null;
  project_name?: string | null;
  workspace_id?: string | null;
  workspace_name?: string | null;
  root_path: string;
}

export interface LocalService {
  id: string;
  owner: LocalServiceOwner;
  kind: LocalServiceKind;
  status: LocalServiceStatus;
  confidence: number;
  reasons: string[];
  url?: string | null;
  display_url: string;
  port: number;
  pid?: number | null;
  process_name?: string | null;
  command_preview?: string | null;
  cwd_display?: string | null;
  launch_dir_display?: string | null;
  title?: string | null;
  can_open: boolean;
  can_stop: boolean;
  protected: boolean;
  last_seen_at: string;
}

export interface LocalServicesUnavailable {
  reason: string;
  message: string;
}

export interface LocalServicesScanResponse {
  scanned_at: string;
  cache_ttl_ms: number;
  services: LocalService[];
  unavailable?: LocalServicesUnavailable | null;
}

export interface LocalServiceStopRequest {
  service_id: string;
  pid: number;
  port: number;
  project_id?: string | null;
  workspace_id?: string | null;
}

export const localServicesApi = {
  scan: async (request: LocalServicesScanRequest): Promise<LocalServicesScanResponse> => {
    return wsRequest<LocalServicesScanResponse>("local_services_scan", request, 10_000);
  },
  stop: async (request: LocalServiceStopRequest): Promise<{ ok: boolean; service_id: string }> => {
    return wsRequest<{ ok: boolean; service_id: string }>("local_services_stop", request, 10_000);
  },
};
