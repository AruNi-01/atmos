export type AutomationTriggerKind = "manual" | "scheduled" | "github";
export type AutomationTriggerStatus = "active" | "needs_setup" | "paused" | "error";
export type GithubEventFamily =
  | "pull_request"
  | "issues"
  | "pull_request_comment"
  | "push"
  | "workflow_run";
export type GithubInt64 = string;

export type GithubTriggerFilters = {
  branch?: string | null;
  comment_contains?: string | null;
  comment_contains_any?: string[];
  label?: string | null;
  sender_logins?: string[];
  workflow_name?: string | null;
  workflow_conclusions?: string[];
};

export type GithubTriggerConfig = {
  route_id: string;
  installation_id: GithubInt64;
  repository_id?: GithubInt64 | null;
  repository_full_name: string;
  event_family: GithubEventFamily;
  actions: string[];
  filters: GithubTriggerFilters;
};

export type AutomationTriggerInput = {
  kind: AutomationTriggerKind;
  enabled?: boolean | null;
  status?: AutomationTriggerStatus | null;
  config?: GithubTriggerConfig | null;
};

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

export type AutomationArtifactKind = "prompt" | "final" | "run_json";

export type AutomationDefinitionChange =
  | "created"
  | "updated"
  | "deleted"
  | "paused"
  | "resumed"
  | "schedule_normalized"
  | "next_run_advanced"
  | "paused_after_start_failure";

export type AutomationSummary = {
  guid: string;
  display_name: string;
  agent_id: string;
  agent_config_json: string | null;
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
};

export type AutomationListResponse = {
  automations: AutomationSummary[];
};

export type AutomationDetail = AutomationSummary & {
  instructions: string;
  memory?: string;
  memory_path?: string;
};

export type AutomationAgentCapability = {
  agent_id: string;
  label: string;
  installed: boolean;
  automation_supported: boolean;
  model_input_mode: "none" | "manual" | "catalog";
  reasoning_mode: "none" | "enum" | "manual" | "encoded_in_model";
  supports_extra_args: boolean;
  unavailable_reason: string | null;
};

export type AutomationAgentCapabilitiesResponse = {
  agents: AutomationAgentCapability[];
};

export type AutomationTargetInput = {
  target_kind: AutomationTargetKind;
  project_guid?: string | null;
  workspace_guid?: string | null;
};

export type AutomationScheduleInput = {
  kind: AutomationScheduleKind;
  expr?: string | null;
  timezone?: string | null;
  hour?: number | null;
  minute?: number | null;
  day_of_week?: number | null;
  day_of_month?: number | null;
};

export type AutomationAttachmentPayload = {
  filename: string;
  mime?: string | null;
  data_base64: string;
};

export type AutomationCreateRequest = {
  display_name: string;
  instructions: string;
  memory?: string;
  agent_id: string;
  agent_config?: unknown;
  target: AutomationTargetInput;
  schedule: AutomationScheduleInput | null;
  trigger?: AutomationTriggerInput | null;
  attachments?: AutomationAttachmentPayload[];
};

export type AutomationUpdateRequest = {
  automation_guid: string;
  display_name?: string;
  instructions?: string;
  memory?: string;
  agent_id?: string;
  agent_config?: unknown;
  target?: AutomationTargetInput;
  schedule?: AutomationScheduleInput | null;
  trigger?: AutomationTriggerInput | null;
  attachments?: AutomationAttachmentPayload[];
};

export type AutomationGuidRequest = {
  automation_guid: string;
};

export type AutomationListRequest = {
  include_paused?: boolean;
};

export type AutomationRunListRequest = {
  automation_guid?: string | null;
  limit?: number;
  page_token?: string | null;
};

export type AutomationRunGuidRequest = {
  run_guid: string;
};

export type AutomationArtifactGetRequest = {
  run_guid: string;
  artifact: AutomationArtifactKind;
};

export type AutomationSchedulePreviewRequest = {
  schedule: AutomationScheduleInput;
  timezone: string;
  count?: number;
};

export type AutomationRunSummary = {
  guid: string;
  automation_guid: string;
  agent_id: string | null;
  agent_label: string | null;
  agent_config_json: string | null;
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
  terminal_display_name: string;
  tmux_session_name: string | null;
  tmux_window_name: string | null;
  tmux_window_index: number | null;
  started_at: string;
  completed_at: string | null;
  exit_code: number | null;
};

export type AutomationRunListResponse = {
  runs: AutomationRunSummary[];
  next_page_token: string | null;
};

export type AutomationRunDetail = AutomationRunSummary;

export type AutomationArtifactResponse = {
  run_guid: string;
  artifact: AutomationArtifactKind;
  path: string;
  content: string;
};

export type AutomationContinueInTerminalResponse = {
  run_guid: string;
  automation_guid: string;
  agent_id: string;
  agent_label: string | null;
  target_kind: AutomationTargetKind;
  project_guid: string | null;
  workspace_guid: string | null;
  command: string;
  terminal_label: string;
  prompt_path: string;
  prompt_content: string;
};

export type AutomationSchedulePreviewResponse = {
  next_run_at: string | null;
  occurrences: string[];
  normalized_expr: string;
  timezone: string;
};

export type AutomationDefinitionUpdatedEvent = {
  automation_guid: string;
  change: AutomationDefinitionChange;
  automation: AutomationSummary | null;
};

export type AutomationRunUpdatedEvent = {
  automation_guid: string;
  run_guid: string;
  status: AutomationRunStatus;
  run: AutomationRunSummary;
};

export type AutomationRunOutputEvent = {
  automation_guid: string;
  run_guid: string;
  ts: string;
  stream: "stdout" | "stderr" | string;
  chunk: string;
  final_chunk?: boolean;
};

export type AutomationNotificationPayload = {
  title: string;
  body: string;
  automation_guid: string;
  automation_display_name: string;
  run_guid: string;
  status: string;
  result_path?: string | null;
};

export type AutomationGithubRelayRequest = {
  relay_url: string;
  relay_secret_key?: string | null;
  device_credential?: string;
} & Record<string, unknown>;
