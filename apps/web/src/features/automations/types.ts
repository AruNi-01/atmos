import type {
  AutomationTriggerInput,
  AutomationTriggerKind,
  AutomationTriggerStatus,
} from "@/api/ws/automation-dtos";

export type {
  AutomationTriggerInput,
  AutomationTriggerKind,
  AutomationTriggerStatus,
  GithubEventFamily,
  GithubInt64,
  GithubTriggerConfig,
  GithubTriggerFilters,
} from "@/api/ws/automation-dtos";

export type AutomationRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type AutomationTargetKind =
  | "project"
  | "workspace"
  | "new_workspace"
  | "standalone";

export type AutomationScheduleKind =
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "cron";

export type AutomationArtifactKind = "prompt" | "output" | "final" | "run_json";

export type AutomationDefinitionChange =
  | "created"
  | "updated"
  | "deleted"
  | "paused"
  | "resumed"
  | "schedule_normalized"
  | "next_run_advanced"
  | "paused_after_start_failure";

export interface AutomationSummary {
  guid: string;
  display_name: string;
  agent_id: string;
  target_kind: AutomationTargetKind;
  project_guid: string | null;
  workspace_guid: string | null;
  schedule_enabled: boolean;
  schedule_paused: boolean;
  schedule_kind: AutomationScheduleKind | null;
  schedule_expr: string | null;
  schedule_timezone: string;
  next_run_at: string | null;
  trigger_kind: AutomationTriggerKind;
  trigger_enabled: boolean;
  trigger_status: AutomationTriggerStatus;
  trigger_config_json: string | null;
  last_run_guid: string | null;
  last_status: AutomationRunStatus | null;
  run_count: number;
}

export interface AutomationListResponse {
  automations: AutomationSummary[];
}

export interface AutomationDetail extends AutomationSummary {
  instructions: string;
}

export interface AutomationAgentCapability {
  agent_id: string;
  label: string;
  installed: boolean;
  automation_supported: boolean;
  unavailable_reason: string | null;
}

export interface AutomationAgentCapabilitiesResponse {
  agents: AutomationAgentCapability[];
}

export interface AutomationTargetInput {
  target_kind: AutomationTargetKind;
  project_guid?: string | null;
  workspace_guid?: string | null;
}

export interface AutomationScheduleInput {
  kind: AutomationScheduleKind;
  expr?: string | null;
  timezone?: string | null;
  hour?: number | null;
  minute?: number | null;
  day_of_week?: number | null;
  day_of_month?: number | null;
}

export interface AutomationCreateRequest {
  display_name: string;
  instructions: string;
  agent_id: string;
  target: AutomationTargetInput;
  schedule: AutomationScheduleInput | null;
  trigger?: AutomationTriggerInput | null;
}

export interface AutomationUpdateRequest {
  automation_guid: string;
  display_name?: string;
  instructions?: string;
  agent_id?: string;
  target?: AutomationTargetInput;
  schedule?: AutomationScheduleInput | null;
  trigger?: AutomationTriggerInput | null;
}

export interface AutomationRunSummary {
  guid: string;
  automation_guid: string;
  trigger_kind: AutomationTriggerKind;
  trigger_source_json: string | null;
  status: AutomationRunStatus;
  failure_kind: string | null;
  error_message: string | null;
  target_kind: AutomationTargetKind;
  project_guid: string | null;
  workspace_guid: string | null;
  created_workspace_guid: string | null;
  run_dir: string;
  result_path: string;
  output_path: string;
  terminal_display_name: string;
  tmux_session_name: string | null;
  tmux_window_name: string | null;
  tmux_window_index: number | null;
  started_at: string;
  completed_at: string | null;
  exit_code: number | null;
}

export interface AutomationRunListResponse {
  runs: AutomationRunSummary[];
  next_page_token: string | null;
}

export type AutomationRunDetail = AutomationRunSummary;

export interface AutomationArtifactResponse {
  run_guid: string;
  artifact: AutomationArtifactKind;
  path: string;
  content: string;
}

export interface AutomationSchedulePreviewResponse {
  next_run_at: string | null;
  occurrences: string[];
  normalized_expr: string;
  timezone: string;
}

export interface AutomationDefinitionUpdatedEvent {
  automation_guid: string;
  change: AutomationDefinitionChange;
  automation: AutomationSummary | null;
}

export interface AutomationRunUpdatedEvent {
  automation_guid: string;
  run_guid: string;
  status: AutomationRunStatus;
  run: AutomationRunSummary;
}
