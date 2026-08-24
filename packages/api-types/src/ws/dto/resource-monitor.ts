/** Mirrors `core_service::ResourceUsage` serde snake_case. */
export type ResourceUsage = {
  cpu_percent: number;
  memory_rss_bytes: number;
  process_count: number;
};

/** Mirrors `core_service::ResourceAttributionStatus`. */
export type ResourceAttributionStatus = "complete" | "partial" | "unsupported";

/** Mirrors `core_service::ResourceSessionMetrics`. */
export type ResourceSessionMetrics = {
  session_id: string;
  name: string | null;
  terminal_kind: string;
  usage: ResourceUsage;
};

/** Mirrors `core_service::ResourceWorkspaceMetrics`. */
export type ResourceWorkspaceMetrics = {
  workspace_id: string;
  name: string;
  usage: ResourceUsage;
  sessions: ResourceSessionMetrics[];
};

/** Mirrors `core_service::ResourceProjectMetrics`. */
export type ResourceProjectMetrics = {
  project_id: string;
  name: string;
  usage: ResourceUsage;
  direct_usage: ResourceUsage;
  workspaces: ResourceWorkspaceMetrics[];
  sessions: ResourceSessionMetrics[];
};

/** Mirrors `core_service::ResourceHostMetrics`. */
export type ResourceHostMetrics = {
  cpu_percent: number;
  memory_used_bytes: number;
  memory_total_bytes: number;
  logical_cpu_count: number;
};

/** Mirrors `core_service::ResourceMonitorSnapshot`. */
export type ResourceMonitorSnapshot = {
  collected_at_ms: number;
  host: ResourceHostMetrics;
  server: ResourceUsage;
  shared_runtime: ResourceUsage;
  projects: ResourceProjectMetrics[];
  unattributed: ResourceUsage;
  attribution_status: ResourceAttributionStatus;
};
