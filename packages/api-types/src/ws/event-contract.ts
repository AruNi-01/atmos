import type { WsEvent } from "./events";
import type {
  AgentActivity,
  AgentActivityClearedNotification,
  AgentHookSessionsClearedNotification,
  AgentHookStateNotification,
  AgentNotificationPayload,
  GitCommitMessageChunkNotification,
  LlmProviderTestChunkNotification,
  LocalModelStateNotification,
  RefreshNotification,
} from "./dto/events";
import type { DiskScanProgress } from "./dto/disk-analyzer";
import type {
  AutomationDefinitionUpdatedEvent,
  AutomationNotificationPayload,
  AutomationRunOutputEvent,
  AutomationRunUpdatedEvent,
} from "./dto/automation";
import type { ResourceMonitorSnapshot } from "./dto/resource-monitor";
import type { SimulatorDownloadProgress } from "./dto/simulator";
import type {
  ProjectDeleteProgressNotification,
  WorkspaceDeleteProgressNotification,
  WorkspaceGitignoreSyncFailedNotification,
  WorkspaceSetupProgressNotification,
} from "./dto/workspace";

export type WsEventContract = {
  workspace_setup_progress: { payload: WorkspaceSetupProgressNotification };
  workspace_gitignore_sync_failed: {
    payload: WorkspaceGitignoreSyncFailedNotification;
  };
  quota_overview_updated: { payload: RefreshNotification };
  token_usage_updated: { payload: RefreshNotification };
  local_services_updated: { payload: RefreshNotification };
  git_commit_message_chunk: { payload: GitCommitMessageChunkNotification };
  llm_provider_test_chunk: { payload: LlmProviderTestChunkNotification };
  workspace_delete_progress: { payload: WorkspaceDeleteProgressNotification };
  project_delete_progress: { payload: ProjectDeleteProgressNotification };
  agent_hook_state_changed: { payload: AgentHookStateNotification };
  agent_hook_sessions_cleared: { payload: AgentHookSessionsClearedNotification };
  agent_activity_updated: { payload: AgentActivity };
  agent_activity_cleared: { payload: AgentActivityClearedNotification };
  agent_attention_raised: { payload: RefreshNotification };
  agent_attention_cleared: { payload: RefreshNotification };
  agent_attention_summary_updated: { payload: RefreshNotification };
  agent_attention_summary_cleared: { payload: RefreshNotification };
  agent_notification: { payload: AgentNotificationPayload };
  github_branch_pr_status_refreshed: { payload: RefreshNotification };
  review_comment_updated: { payload: RefreshNotification };
  review_message_created: { payload: RefreshNotification };
  review_file_updated: { payload: RefreshNotification };
  review_agent_run_updated: { payload: RefreshNotification };
  local_model_state_changed: { payload: LocalModelStateNotification };
  canvas_agent_dispatch: { payload: RefreshNotification };
  pt_design_agent_dispatch: { payload: RefreshNotification };
  automation_definition_updated: { payload: AutomationDefinitionUpdatedEvent };
  automation_run_updated: { payload: AutomationRunUpdatedEvent };
  automation_run_output: { payload: AutomationRunOutputEvent };
  automation_notification: { payload: AutomationNotificationPayload };
  disk_analyzer_scan_progress: { payload: DiskScanProgress };
  simulator_download_progress: { payload: SimulatorDownloadProgress };
  resource_monitor_updated: { payload: ResourceMonitorSnapshot };
};

export type MappedWsEvent = keyof WsEventContract & WsEvent;
export type WsEventPayload<E extends MappedWsEvent> = WsEventContract[E]["payload"];

type MissingEvents = Exclude<WsEvent, keyof WsEventContract>;
type ExtraEvents = Exclude<keyof WsEventContract, WsEvent>;
type AssertNever<T extends never> = T;
type _NoMissingEvents = AssertNever<MissingEvents>;
type _NoExtraEvents = AssertNever<ExtraEvents>;
