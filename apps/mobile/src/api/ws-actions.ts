import type {
  AgentChatBackfillRequest,
  AgentChatConfigureRequest,
  AgentChatCreateRequest,
  AgentChatIdRequest,
  AgentChatListRequest,
  AgentChatMessagesRequest,
  AgentChatPermissionRespondRequest,
  AgentChatPrefsSetRequest,
  AgentChatQueueAddRequest,
  AgentChatQueueDeleteRequest,
  AgentChatQueueReorderRequest,
  AgentChatQueueUpdateRequest,
  AgentChatRenameRequest,
  AgentChatSendRequest,
  AgentChatSessionOpRespondRequest,
  AgentChatSnapshot,
  AgentChatSteerRequest,
  AgentChatSubscribeRequest,
  AgentOptionsGetRequest,
} from "@atmos/api-types/ws/dto/agent-chat";
import type {
  GithubIssuePayload,
  GithubPrPayload,
  WorkspaceSetupProgressNotification,
} from "@/api/types";
import type { AgentSessionStatusListResponse } from "@atmos/api-types/ws/dto/agent-status";
import type { QuotaOverviewRequest } from "@atmos/api-types/ws/dto/quota";
import type { TokenUsageOverviewRequest } from "@atmos/api-types/ws/dto/token-usage";
import type { MobileWsClient } from "@/api/mobile-ws-client";

export const wsActions = {
  projectWorkspaceBootstrap(client: MobileWsClient) {
    return client.request("project_workspace_bootstrap");
  },
  fsGetHomeDir(client: MobileWsClient) {
    return client.request("fs_get_home_dir");
  },
  fsListDir(client: MobileWsClient, path: string, dirsOnly = true) {
    return client.request("fs_list_dir", {
      path,
      dirs_only: dirsOnly,
    });
  },
  fsSearchDirs(client: MobileWsClient, rootPath: string, query: string) {
    return client.request("fs_search_dirs", {
      root_path: rootPath,
      query,
      max_results: 25,
      max_depth: 4,
    });
  },
  fsValidateGitPath(client: MobileWsClient, path: string) {
    return client.request("fs_validate_git_path", { path });
  },
  projectCreate(client: MobileWsClient, payload: { name: string; main_file_path: string }) {
    return client.request("project_create", {
      ...payload,
      sidebar_order: 0,
    });
  },
  workspaceCreate(
    client: MobileWsClient,
    payload: {
      project_guid: string;
      name: string;
      display_name: string;
      branch: string;
      base_branch: string | null;
      github_issue?: GithubIssuePayload | null;
      github_pr?: GithubPrPayload | null;
      auto_extract_todos?: boolean;
      priority?: string | null;
      workflow_status?: string | null;
      label_guids?: string[];
    },
  ) {
    return client.request("workspace_create", {
      initial_requirement: null,
      attachments: [],
      sidebar_order: 0,
      auto_extract_todos: false,
      github_issue: null,
      github_pr: null,
      priority: "no_priority",
      workflow_status: "in_progress",
      label_guids: [],
      ...payload,
    });
  },
  workspaceConfirmTodos(client: MobileWsClient, guid: string, markdown: string) {
    return client.request("workspace_confirm_todos", {
      guid,
      markdown,
    });
  },
  workspaceUpdateWorkflowStatus(client: MobileWsClient, guid: string, workflowStatus: string) {
    return client.request("workspace_update_workflow_status", {
      guid,
      workflow_status: workflowStatus,
    });
  },
  workspaceRetrySetup(
    client: MobileWsClient,
    payload: {
      guid: string;
      failed_step_key: string;
      initial_requirement?: string | null;
      github_issue?: GithubIssuePayload | null;
      github_pr?: GithubPrPayload | null;
      auto_extract_todos?: boolean;
    },
  ) {
    return client.request("workspace_retry_setup", {
      initial_requirement: null,
      github_issue: null,
      github_pr: null,
      auto_extract_todos: false,
      ...payload,
    });
  },
  githubIssueGet(client: MobileWsClient, issueUrl: string) {
    return client.request("github_issue_get", {
      issue_url: issueUrl,
    });
  },
  githubPrGet(client: MobileWsClient, prUrl: string) {
    return client.request("github_pr_get", {
      pr_url: prUrl,
    });
  },
  gitGetStatus(client: MobileWsClient, path: string) {
    return client.request("git_get_status", { path });
  },
  gitChangedFiles(client: MobileWsClient, path: string, baseBranch?: string | null, usePreferredCompare = false) {
    return client.request("git_changed_files", {
      path,
      base_branch: baseBranch ?? null,
      use_preferred_compare: usePreferredCompare,
    });
  },
  gitFileDiff(
    client: MobileWsClient,
    path: string,
    filePath: string,
    baseBranch?: string | null,
    againstIndex = false,
  ) {
    return client.request("git_file_diff", {
      path,
      file_path: filePath,
      base_branch: baseBranch ?? null,
      against_index: againstIndex,
    });
  },
  gitStage(client: MobileWsClient, path: string, files: string[]) {
    return client.request("git_stage", { path, files });
  },
  gitUnstage(client: MobileWsClient, path: string, files: string[]) {
    return client.request("git_unstage", { path, files });
  },
  gitCommit(client: MobileWsClient, path: string, message: string) {
    return client.request("git_commit", { path, message });
  },
  gitPush(client: MobileWsClient, path: string) {
    return client.request("git_push", { path });
  },
  terminalWorkspaceCandidates(
    client: MobileWsClient,
    payload: {
      workspace_id: string;
      project_name?: string | null;
      workspace_name?: string | null;
    },
  ) {
    return client.request("terminal_workspace_candidates", payload);
  },
  codeAgentCustomGet(client: MobileWsClient) {
    return client.request("code_agent_custom_get");
  },
  agentSessionStatusList(client: MobileWsClient, cursor: string | null = null) {
    return client.request("agent_session_status_list", {
      limit: 100,
      cursor,
    }) as Promise<AgentSessionStatusListResponse>;
  },
  agentSessionArchive(client: MobileWsClient, sessionId: string) {
    return client.request("agent_session_archive", { session_id: sessionId });
  },
  githubPrList(
    client: MobileWsClient,
    payload: {
      owner: string;
      repo: string;
      branch: string;
      state?: string | null;
    },
  ) {
    return client.request("github_pr_list", payload);
  },
  agentChatList(client: MobileWsClient, payload: AgentChatListRequest) {
    return client.request("agent_chat_list", payload);
  },
  agentChatCreate(client: MobileWsClient, payload: AgentChatCreateRequest) {
    return client.request("agent_chat_create", payload);
  },
  agentChatMessages(client: MobileWsClient, payload: AgentChatMessagesRequest) {
    return client.request("agent_chat_messages", payload);
  },
  agentChatGet(client: MobileWsClient, payload: AgentChatIdRequest) {
    return client.request("agent_chat_get", payload) as Promise<AgentChatSnapshot>;
  },
  agentChatSubscribe(client: MobileWsClient, payload: AgentChatSubscribeRequest) {
    return client.request("agent_chat_subscribe", payload);
  },
  agentChatBackfill(client: MobileWsClient, payload: AgentChatBackfillRequest) {
    return client.request("agent_chat_backfill", payload);
  },
  agentChatUnsubscribe(client: MobileWsClient, payload: AgentChatIdRequest) {
    return client.request("agent_chat_unsubscribe", payload);
  },
  agentChatSend(client: MobileWsClient, payload: AgentChatSendRequest) {
    return client.request("agent_chat_send", payload);
  },
  agentChatSteer(client: MobileWsClient, payload: AgentChatSteerRequest) {
    return client.request("agent_chat_steer", payload);
  },
  agentChatQueueAdd(client: MobileWsClient, payload: AgentChatQueueAddRequest) {
    return client.request("agent_chat_queue_add", payload);
  },
  agentChatQueueUpdate(client: MobileWsClient, payload: AgentChatQueueUpdateRequest) {
    return client.request("agent_chat_queue_update", payload);
  },
  agentChatQueueReorder(client: MobileWsClient, payload: AgentChatQueueReorderRequest) {
    return client.request("agent_chat_queue_reorder", payload);
  },
  agentChatQueueDelete(client: MobileWsClient, payload: AgentChatQueueDeleteRequest) {
    return client.request("agent_chat_queue_delete", payload);
  },
  agentChatCancel(client: MobileWsClient, payload: AgentChatIdRequest) {
    return client.request("agent_chat_cancel", payload);
  },
  agentChatPermissionRespond(client: MobileWsClient, payload: AgentChatPermissionRespondRequest) {
    return client.request("agent_chat_permission_respond", payload);
  },
  agentChatSessionOpRespond(client: MobileWsClient, payload: AgentChatSessionOpRespondRequest) {
    return client.request("agent_chat_session_op_respond", payload);
  },
  agentChatConfigure(client: MobileWsClient, payload: AgentChatConfigureRequest) {
    return client.request("agent_chat_configure", payload);
  },
  agentOptionsGet(client: MobileWsClient, payload: AgentOptionsGetRequest) {
    return client.request("agent_options_get", payload);
  },
  agentChatPrefsGet(client: MobileWsClient) {
    return client.request("agent_chat_prefs_get");
  },
  agentChatPrefsSet(client: MobileWsClient, payload: AgentChatPrefsSetRequest) {
    return client.request("agent_chat_prefs_set", payload);
  },
  agentChatRename(client: MobileWsClient, payload: AgentChatRenameRequest) {
    return client.request("agent_chat_rename", payload);
  },
  agentChatDelete(client: MobileWsClient, payload: AgentChatIdRequest) {
    return client.request("agent_chat_delete", payload);
  },
  tokenUsageOverview(client: MobileWsClient, input: TokenUsageOverviewRequest = {}) {
    return client.request("token_usage_overview_get", {
      refresh: input.refresh ?? false,
      try_cookies: input.try_cookies ?? false,
      year: input.year ?? null,
      since: input.since ?? null,
      until: input.until ?? null,
      clients: input.clients ?? null,
      group_by: input.group_by ?? null,
    });
  },
  quotaOverview(client: MobileWsClient, input: QuotaOverviewRequest = {}) {
    return client.request("quota_get_overview", {
      refresh: input.refresh ?? false,
      provider_id: input.provider_id ?? null,
    });
  },
  quotaSetProviderSwitch(client: MobileWsClient, providerId: string, enabled: boolean) {
    return client.request("quota_set_provider_switch", { provider_id: providerId, enabled });
  },
  quotaSetAllProvidersSwitch(client: MobileWsClient, enabled: boolean) {
    return client.request("quota_set_all_providers_switch", { enabled });
  },
  quotaSetAutoRefresh(client: MobileWsClient, intervalMinutes: number | null) {
    return client.request("quota_set_auto_refresh", { interval_minutes: intervalMinutes });
  },
  hostSessionKeysForChat(client: MobileWsClient, chatId: string) {
    return client.request("host_session_keys_for_chat", { chat_id: chatId });
  },
  hostSessionSetArchived(client: MobileWsClient, keys: string[], archived: boolean) {
    return client.request("host_session_set_archived", { keys, archived });
  },
  hostSessionDelete(
    client: MobileWsClient,
    input: { keys: string[]; include_atmos_chat: boolean; include_source: boolean },
  ) {
    return client.request("host_session_delete", input);
  },
  functionSettingsGet(client: MobileWsClient) {
    return client.request("function_settings_get");
  },
  functionSettingsUpdate(
    client: MobileWsClient,
    functionName: string,
    key: string,
    value: unknown,
  ) {
    return client.request("function_settings_update", {
      function_name: functionName,
      key,
      value,
    });
  },
  workspaceSetPinned(client: MobileWsClient, guid: string, pinned: boolean) {
    return client.request(pinned ? "workspace_pin" : "workspace_unpin", { guid });
  },
  workspaceArchive(client: MobileWsClient, guid: string) {
    return client.request("workspace_archive", { guid });
  },
  workspaceDelete(client: MobileWsClient, guid: string) {
    return client.request("workspace_delete", { guid });
  },
};

export function isWorkspaceSetupProgressNotification(
  data: unknown,
): data is WorkspaceSetupProgressNotification {
  if (!data || typeof data !== "object") return false;
  const payload = data as Record<string, unknown>;

  return (
    typeof payload.workspace_id === "string" &&
    typeof payload.status === "string" &&
    ["creating", "setting_up", "completed", "error"].includes(payload.status) &&
    typeof payload.step_title === "string" &&
    typeof payload.success === "boolean" &&
    (payload.output == null || typeof payload.output === "string") &&
    (payload.step_key == null || typeof payload.step_key === "string") &&
    (payload.failed_step_key == null || typeof payload.failed_step_key === "string") &&
    (payload.replace_output == null || typeof payload.replace_output === "boolean") &&
    (payload.requires_confirmation == null || typeof payload.requires_confirmation === "boolean") &&
    (payload.countdown == null || typeof payload.countdown === "number")
  );
}
