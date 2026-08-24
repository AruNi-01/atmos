export type SettingsBootstrapPayload = {
  function_settings: unknown;
  llm_providers: unknown;
  code_agent_custom: unknown;
  agent_behaviour_settings: unknown;
};

export type FunctionSettingsUpdateRequest = {
  function_name: string;
  key: string;
  value: unknown;
};

export type TerminalAgentModelOption = {
  id: string;
  label: string;
  group?: string | null;
  is_default?: boolean;
};

export type TerminalAgentModelCatalog = {
  agent_id: string;
  status: "ok" | "unsupported" | "auth_required" | "error";
  models: TerminalAgentModelOption[];
  message: string | null;
  source: "live" | "cache";
};

export type TerminalAgentModelsGetRequest = {
  agent_id: string;
  refresh?: boolean | null;
};

export type LlmProviderKind =
  | "openai-compatible"
  | "anthropic-compatible"
  | "local-managed"
  | "agent-cli";

export type LlmProviderEntry = {
  enabled: boolean;
  displayName?: string | null;
  kind: LlmProviderKind;
  base_url: string;
  api_key: string;
  model: string;
  timeout_ms?: number | null;
  max_output_tokens?: number | null;
  local_model_id?: string | null;
  agent_id?: string | null;
};

export type LlmFeatureBindings = {
  git_commit?: string | null;
  git_commit_language?: string | null;
  workspace_issue_todo?: string | null;
  workspace_issue_todo_language?: string | null;
};

export type LlmProvidersFile = {
  version: number;
  default_provider?: string | null;
  features: LlmFeatureBindings;
  providers: Record<string, LlmProviderEntry>;
};

export type LlmProvidersUpdateRequest = {
  config: LlmProvidersFile;
};

export type LlmProviderTestRequest = {
  stream_id: string;
  provider_id?: string | null;
  provider: LlmProviderEntry;
};

export type LlmProviderTestResponse = {
  text: string;
};

export type CodeAgentCustomEntry = {
  id: string;
  label: string;
  cmd: string;
  flags: string;
  interactiveFlags?: string;
  enabled?: boolean;
};

export type CodeAgentCustomPayload = {
  agents: CodeAgentCustomEntry[];
  [key: string]: unknown;
};

export type CodeAgentCustomUpdateRequest = {
  agents: CodeAgentCustomEntry[];
};

export type AgentBehaviourSettings = {
  idle_session_timeout_mins: number;
  attention_summary_enabled?: boolean;
  attention_summary_delay_mins?: number;
  attention_summary_agent_id?: string | null;
  attention_summary_model?: string | null;
};

export type AgentBehaviourSettingsUpdateRequest = {
  idle_session_timeout_mins: number;
  attention_summary_enabled?: boolean | null;
  attention_summary_delay_mins?: number | null;
  attention_summary_agent_id?: string | null;
  attention_summary_model?: string | null;
};

export type PushServerType = "ntfy" | "bark" | "gotify" | "custom_webhook";

export type PushServerConfig = {
  id: string;
  enabled: boolean;
  type: PushServerType;
  url: string;
  token?: string | null;
  topic?: string | null;
  device_key?: string | null;
  custom_body_template?: string | null;
};

export type NotificationSettings = {
  browser_notification: boolean;
  desktop_notification: boolean;
  app_toast_notification: boolean;
  system_notification_when_focused: boolean;
  notify_on_permission_request: boolean;
  notify_on_task_complete: boolean;
  notify_on_automation_outcome: boolean;
  push_automation_outcomes: boolean;
  push_servers: PushServerConfig[];
};

export type NotificationSettingsUpdateRequest = {
  settings: NotificationSettings;
};

export type NotificationTestPushRequest = {
  server_index: number;
};

export type NotificationTestPushResponse = {
  ok: boolean;
  error?: string;
};
