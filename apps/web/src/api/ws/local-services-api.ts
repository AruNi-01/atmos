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

export type LocalServiceStopMode = "listener" | "tree";

export type LocalServiceStopEscalationReason =
  | "still_listening"
  | "respawned"
  | "term_ignored";

export interface LocalServiceProcessNode {
  pid: number;
  ppid?: number | null;
  pgid?: number | null;
  command_preview: string;
  cwd_display?: string | null;
  is_listener: boolean;
  stop_candidate: boolean;
  protected?: boolean;
}

export interface LocalServiceStopRequest {
  service_id: string;
  pid: number;
  port: number;
  project_id?: string | null;
  workspace_id?: string | null;
  /** Default `listener`. Use `tree` only after explicit user confirmation. */
  mode?: LocalServiceStopMode;
  /** Required when `mode = "tree"`. */
  root_pid?: number | null;
}

export interface LocalServiceStopResponse {
  ok: boolean;
  service_id: string;
  mode?: LocalServiceStopMode | null;
  needs_escalation?: boolean | null;
  reason?: LocalServiceStopEscalationReason | null;
  port?: number | null;
  attempted_pid?: number | null;
  current_listener_pid?: number | null;
  orphan_hints?: string[] | null;
  process_tree?: LocalServiceProcessNode[] | null;
  recommended_root_pid?: number | null;
}

export const localServicesApi = {
  scan: async (request: LocalServicesScanRequest): Promise<LocalServicesScanResponse> => {
    return wsRequest<LocalServicesScanResponse>("local_services_scan", request, 10_000);
  },
  stop: async (request: LocalServiceStopRequest): Promise<LocalServiceStopResponse> => {
    // Tree stop may wait for TERM + KILL verification (~3s+).
    const timeout = request.mode === "tree" ? 20_000 : 12_000;
    return wsRequest<LocalServiceStopResponse>("local_services_stop", request, timeout);
  },
};
