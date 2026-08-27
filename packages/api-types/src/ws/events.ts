/** Server-aligned main-app WS event wire names (Rust WsEvent snake_case). */

export const WS_EVENTS = [
  "workspace_setup_progress",
  "workspace_gitignore_sync_failed",
  "quota_overview_updated",
  "token_usage_updated",
  "local_services_updated",
  "git_commit_message_chunk",
  "llm_provider_test_chunk",
  "workspace_delete_progress",
  "project_delete_progress",
  "agent_hook_state_changed",
  "agent_hook_sessions_cleared",
  "agent_activity_updated",
  "agent_activity_cleared",
  "agent_attention_raised",
  "agent_attention_cleared",
  "agent_attention_summary_updated",
  "agent_attention_summary_cleared",
  "agent_notification",
  "github_branch_pr_status_refreshed",
  "review_comment_updated",
  "review_message_created",
  "review_file_updated",
  "review_agent_run_updated",
  "local_model_state_changed",
  "canvas_agent_dispatch",
  "pt_design_agent_dispatch",
  "automation_definition_updated",
  "automation_run_updated",
  "automation_run_output",
  "automation_notification",
  "disk_analyzer_scan_progress",
  "simulator_download_progress",
  "resource_monitor_updated",
] as const;

export type WsEvent = (typeof WS_EVENTS)[number];

const WS_EVENT_SET: ReadonlySet<string> = new Set(WS_EVENTS);

export function isWsEvent(value: string): value is WsEvent {
  return WS_EVENT_SET.has(value);
}
