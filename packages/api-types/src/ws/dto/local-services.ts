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

export type LocalServicesScanRequest = {
  scope?: LocalServicesScope;
  project_id?: string | null;
  workspace_id?: string | null;
  force?: boolean;
  include_diagnostics?: boolean;
};

export type LocalServiceOwner = {
  project_id?: string | null;
  project_name?: string | null;
  workspace_id?: string | null;
  workspace_name?: string | null;
  root_path: string;
};

export type LocalService = {
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
};

export type LocalServicesUnavailable = {
  reason: string;
  message: string;
};

export type LocalServicesScanResponse = {
  scanned_at: string;
  cache_ttl_ms: number;
  services: LocalService[];
  unavailable?: LocalServicesUnavailable | null;
};

export type LocalServiceStopMode = "listener" | "tree";

export type LocalServiceStopEscalationReason =
  | "still_listening"
  | "respawned"
  | "term_ignored";

export type LocalServiceProcessNode = {
  pid: number;
  ppid?: number | null;
  pgid?: number | null;
  command_preview: string;
  cwd_display?: string | null;
  is_listener: boolean;
  stop_candidate: boolean;
  protected?: boolean;
};

export type LocalServiceStopRequest = {
  service_id: string;
  pid: number;
  port: number;
  project_id?: string | null;
  workspace_id?: string | null;
  mode?: LocalServiceStopMode;
  root_pid?: number | null;
};

export type LocalServiceStopResponse = {
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
};
