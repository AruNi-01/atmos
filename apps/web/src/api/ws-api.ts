"use client";

import { useWebSocketStore, WsAction } from "@/hooks/use-websocket";

// ===== 类型定义 =====

// 文件系统类型
export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  is_ignored: boolean;
  symlink_target?: string;
  is_git_repo: boolean;
}

export interface FsListDirResponse {
  path: string;
  parent_path: string | null;
  entries: FsEntry[];
}

export interface FsValidateGitPathResponse {
  is_valid: boolean;
  is_git_repo: boolean;
  suggested_name: string | null;
  default_branch: string | null;
  error: string | null;
}

// 文件读写类型
export interface FsReadFileResponse {
  path: string;
  exists: boolean;
  content: string | null;
  size: number;
}

export interface FsWriteFileResponse {
  path: string;
  success: boolean;
}

export interface FsCreateDirResponse {
  path: string;
  success: boolean;
}

export interface FsRenamePathResponse {
  from: string;
  to: string;
  success: boolean;
}

export interface FsDeletePathResponse {
  path: string;
  success: boolean;
}

export interface FsDuplicatePathResponse {
  from: string;
  to: string;
  success: boolean;
}

// 文件树类型
export interface FileTreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  is_ignored: boolean;
  symlink_target?: string;
  children?: FileTreeNode[];
}

export interface FsListProjectFilesResponse {
  root_path: string;
  tree: FileTreeNode[];
}

// 搜索类型
export interface SearchMatch {
  file_path: string;
  line_number: number;
  line_content: string;
  match_start: number;
  match_end: number;
  context_before: string[];
  context_after: string[];
}

export interface FsSearchContentResponse {
  matches: SearchMatch[];
  truncated: boolean;
}

export interface FsSearchDirsResponse {
  entries: FsEntry[];
}

// Project 类型（后端返回格式）
export interface ProjectModel {
  guid: string;
  name: string;
  main_file_path: string;
  sidebar_order: number;
  border_color: string | null;
  target_branch: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

// Git 状态响应
export interface GitStatusResponse {
  has_uncommitted_changes: boolean;
  has_merge_conflicts: boolean;
  has_unpushed_commits: boolean;
  uncommitted_count: number;
  unpushed_count: number;
  upstream_behind_count: number | null;
  default_branch: string | null;
  default_branch_ahead: number | null;
  default_branch_behind: number | null;
  current_branch: string | null;
  github_owner: string | null;
  github_repo: string | null;
}

// 变更文件信息
export interface GitChangedFile {
  path: string;
  status: string; // M, A, D, R, C, U, ?
  additions: number;
  deletions: number;
  staged: boolean;
}

// 变更文件列表响应
export interface GitChangedFilesResponse {
  staged_files: GitChangedFile[];
  unstaged_files: GitChangedFile[];
  untracked_files: GitChangedFile[];
  total_additions: number;
  total_deletions: number;
  is_branch_published: boolean;
  compare_ref: string | null;
}

// 文件 diff 响应
export interface GitFileDiffResponse {
  file_path: string;
  old_content: string;
  new_content: string;
  status: string;
  compare_ref: string | null;
}

// Git 提交响应
export interface GitCommitResponse {
  success: boolean;
  commit_hash: string | null;
}

export interface GitGenerateCommitMessageResponse {
  message: string;
}

// Archived Workspace 类型
export interface ArchivedWorkspace {
  guid: string;
  name: string;
  display_name?: string | null;
  branch: string;
  base_branch: string;
  project_guid: string;
  project_name: string;
  archived_at: string;
}

// Workspace 类型（后端返回格式）
export interface WorkspaceModel {
  guid: string;
  project_guid: string;
  name: string;
  display_name: string | null;
  branch: string;
  base_branch: string;
  sidebar_order: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  is_pinned: boolean;
  pinned_at: string | null;
  pin_order: number | null;
  is_archived: boolean;
  archived_at: string | null;
  last_visited_at: string | null;
  workflow_status: string;
  priority: string;
  local_path: string;
  github_issue: GithubIssuePayload | null;
  github_pr: GithubPrPayload | null;
  labels: WorkspaceLabelModel[];
}

export interface WorkspaceAttachmentPayload {
  filename: string;
  mime: string;
  dataBase64: string;
}

export interface WorkspaceLabelModel {
  guid: string;
  name: string;
  color: string;
}

export interface ReviewAnchor {
  file_path: string;
  side: string;
  start_line: number;
  end_line: number;
  line_range_kind: string;
  selected_text?: string | null;
  before_context?: string[];
  after_context?: string[];
  hunk_header?: string | null;
}

export interface ReviewMessageModel {
  guid: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  comment_guid: string;
  author_type: string;
  kind: string;
  body_storage_kind: string;
  body: string;
  body_rel_path: string | null;
  fix_run_guid: string | null;
}

export interface ReviewMessageDto {
  body_full: string;
  guid: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  comment_guid: string;
  author_type: string;
  kind: string;
  body_storage_kind: string;
  body: string;
  body_rel_path: string | null;
  fix_run_guid: string | null;
}

export interface ReviewCommentDto {
  guid: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  session_guid: string;
  revision_guid: string;
  file_snapshot_guid: string;
  anchor_side: string;
  anchor_start_line: number;
  anchor_end_line: number;
  anchor_line_range_kind: string;
  anchor_json: string;
  status: string;
  parent_comment_guid: string | null;
  title: string | null;
  created_by: string | null;
  fixed_at: string | null;
  anchor: ReviewAnchor;
  messages: ReviewMessageDto[];
}

export interface ReviewFileSnapshotModel {
  guid: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  revision_guid: string;
  file_identity_guid: string;
  file_path: string;
  git_status: string;
  old_rel_path: string;
  new_rel_path: string;
  meta_rel_path: string;
  old_sha256: string | null;
  new_sha256: string | null;
  old_size: number;
  new_size: number;
  is_binary: boolean;
  display_order: number;
}

export interface ReviewFileStateModel {
  guid: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  revision_guid: string;
  file_identity_guid: string;
  file_snapshot_guid: string;
  reviewed: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
  inherited_from_file_state_guid: string | null;
  last_code_change_at: string | null;
}

export interface ReviewFileDto {
  snapshot: ReviewFileSnapshotModel;
  state: ReviewFileStateModel;
  changed_after_review: boolean;
  open_comment_count: number;
  additions: number;
  deletions: number;
}

export interface ReviewRevisionDto {
  guid: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  session_guid: string;
  parent_revision_guid: string | null;
  source_kind: string;
  fix_run_guid: string | null;
  title: string | null;
  storage_root_rel_path: string;
  base_revision_guid: string | null;
  created_by: string | null;
  files: ReviewFileDto[];
}

export interface ReviewRevisionModel {
  guid: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  session_guid: string;
  parent_revision_guid: string | null;
  source_kind: string;
  fix_run_guid: string | null;
  title: string | null;
  storage_root_rel_path: string;
  base_revision_guid: string | null;
  created_by: string | null;
}

export interface ReviewFixRunModel {
  guid: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  session_guid: string;
  base_revision_guid: string;
  result_revision_guid: string | null;
  execution_mode: string;
  status: string;
  prompt_rel_path: string | null;
  result_rel_path: string | null;
  patch_rel_path: string | null;
  summary_rel_path: string | null;
  agent_session_ref: string | null;
  finalize_attempts: number;
  failure_reason: string | null;
  created_by: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface ReviewSessionDto {
  guid: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  workspace_guid: string;
  project_guid: string;
  repo_path: string;
  storage_root_rel_path: string;
  base_ref: string | null;
  base_commit: string | null;
  head_commit: string;
  current_revision_guid: string;
  status: string;
  title: string | null;
  created_by: string | null;
  closed_at: string | null;
  archived_at: string | null;
  revisions: ReviewRevisionDto[];
  runs: ReviewFixRunModel[];
  open_comment_count: number;
  reviewed_file_count: number;
  reviewed_then_changed_count: number;
}

export interface ReviewFixRunCreatedDto {
  run: ReviewFixRunModel;
  revision: ReviewRevisionDto;
  prompt: string;
}

export interface ReviewFixRunFinalizedDto {
  run: ReviewFixRunModel;
  revision: ReviewRevisionModel;
}

export type ReviewFixRunStatusDto =
  | { kind: "run"; run: ReviewFixRunModel }
  | { kind: "finalized"; run: ReviewFixRunModel; revision: ReviewRevisionModel };

export interface ReviewFileContentDto {
  file_snapshot: ReviewFileSnapshotModel;
  old_content: string;
  new_content: string;
}

export interface ReviewRunArtifactDto {
  run: ReviewFixRunModel;
  kind: string;
  content: string;
}

export interface GithubIssueLabelPayload {
  name: string;
  color: string | null;
  description: string | null;
}

export interface GithubIssuePayload {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: string;
  labels: GithubIssueLabelPayload[];
}

export interface GithubPrPayload {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: string;
  head_ref: string;
  base_ref: string;
  is_draft: boolean;
  labels: GithubIssueLabelPayload[];
}

export type UsageDetailRowTone =
  | "default"
  | "muted"
  | "success"
  | "warning"
  | "danger";
export type UsageProviderKind = "cli" | "desktop" | "api" | "hybrid";
export type UsageAuthStateStatus = "detected" | "missing" | "unsupported";
export type UsageFetchStateStatus =
  | "ready"
  | "unavailable"
  | "partial"
  | "error"
  | "unsupported";

export interface UsageDetailRowResponse {
  label: string;
  value: string;
  tone: UsageDetailRowTone;
}

export interface UsageDetailSectionResponse {
  title: string;
  rows: UsageDetailRowResponse[];
}

export interface UsageAuthStateResponse {
  status: UsageAuthStateStatus;
  source: string | null;
  detail: string | null;
  setup_hint: string | null;
}

export interface UsageFetchStateResponse {
  status: UsageFetchStateStatus;
  message: string | null;
}

export interface UsageManualSetupOptionResponse {
  value: string;
  label: string;
}

export interface UsageConfiguredApiKey {
  id: string;
  region: string | null;
}

export interface UsageManualSetupResponse {
  selected_region: string | null;
  region_options: UsageManualSetupOptionResponse[];
  api_key_configured: boolean;
  configured_keys: UsageConfiguredApiKey[];
}

export interface UsageSubscriptionSummaryResponse {
  plan_label: string | null;
  window_label: string | null;
  credits_label: string | null;
  billing_state: string | null;
  reset_at: number | null;
}

export interface UsageSummaryResponse {
  unit: string | null;
  currency: string | null;
  used: number | null;
  remaining: number | null;
  cap: number | null;
  percent: number | null;
  used_label: string | null;
  remaining_label: string | null;
  cap_label: string | null;
}

export interface UsageProviderResponse {
  id: string;
  label: string;
  kind: UsageProviderKind;
  enabled: boolean;
  switch_enabled: boolean;
  footer_carousel_show: boolean;
  healthy: boolean;
  last_updated_at: number | null;
  subscription_summary: UsageSubscriptionSummaryResponse | null;
  usage_summary: UsageSummaryResponse | null;
  detail_sections: UsageDetailSectionResponse[];
  warnings: string[];
  auth_state: UsageAuthStateResponse;
  fetch_state: UsageFetchStateResponse;
  manual_setup: UsageManualSetupResponse | null;
}

export interface UsageAggregateResponse {
  enabled_count: number;
  total_count: number;
  active_subscription_count: number;
  comparable_credit_currency: string | null;
  total_credits_used: number | null;
  total_credits_remaining: number | null;
  near_limit_sources: string[];
  degraded_sources: string[];
  soonest_reset_at: number | null;
}

export interface UsageFetchIssueResponse {
  provider_id: string;
  provider_label: string;
  message: string;
}

export interface UsageAutoRefreshResponse {
  interval_minutes: number | null;
}

export interface UsageOverviewResponse {
  all: UsageAggregateResponse;
  providers: UsageProviderResponse[];
  generated_at: number;
  partial_failures: UsageFetchIssueResponse[];
  auto_refresh: UsageAutoRefreshResponse;
}

// ===== WebSocket API 客户端 =====

/**
 * 发送 WebSocket 请求的通用函数
 */
async function wsRequest<T>(
  action: WsAction,
  data: unknown = {},
  timeoutMs?: number,
): Promise<T> {
  const { send, connectionState, connect } = useWebSocketStore.getState();

  // 如果未连接，尝试连接
  if (connectionState !== "connected") {
    connect();

    // 等待连接建立
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("WebSocket connection timeout"));
      }, 5000);

      const checkConnection = setInterval(() => {
        const state = useWebSocketStore.getState();
        if (state.connectionState === "connected") {
          clearInterval(checkConnection);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });
  }

  return send<T>(action, data, timeoutMs);
}

function emitUsageOverviewUpdated(overview: UsageOverviewResponse): void {
  const listeners = useWebSocketStore.getState().eventListeners.get("usage_overview_updated");
  if (!listeners) return;
  listeners.forEach((listener) => listener(overview));
}

// ===== 文件系统 API =====

export const fsApi = {
  /**
   * 获取用户主目录
   */
  getHomeDir: async (): Promise<string> => {
    const result = await wsRequest<{ path: string }>("fs_get_home_dir");
    return result.path;
  },

  /**
   * 列出目录内容
   */
  listDir: async (
    path: string,
    options?: {
      dirsOnly?: boolean;
      showHidden?: boolean;
      ignoreNotFound?: boolean;
    },
  ): Promise<FsListDirResponse> => {
    return wsRequest<FsListDirResponse>("fs_list_dir", {
      path,
      dirs_only: options?.dirsOnly ?? true, // 默认只显示目录
      show_hidden: options?.showHidden ?? false,
      ignore_not_found: options?.ignoreNotFound ?? false,
    });
  },

  /**
   * 验证 Git 仓库路径
   */
  validateGitPath: async (path: string): Promise<FsValidateGitPathResponse> => {
    return wsRequest<FsValidateGitPathResponse>("fs_validate_git_path", {
      path,
    });
  },

  /**
   * 读取文件内容
   */
  readFile: async (path: string): Promise<FsReadFileResponse> => {
    return wsRequest<FsReadFileResponse>("fs_read_file", { path });
  },

  /**
   * 写入文件内容
   */
  writeFile: async (
    path: string,
    content: string,
  ): Promise<FsWriteFileResponse> => {
    return wsRequest<FsWriteFileResponse>("fs_write_file", { path, content });
  },

  createDir: async (path: string): Promise<FsCreateDirResponse> => {
    return wsRequest<FsCreateDirResponse>("fs_create_dir", { path });
  },

  renamePath: async (from: string, to: string): Promise<FsRenamePathResponse> => {
    return wsRequest<FsRenamePathResponse>("fs_rename_path", { from, to });
  },

  deletePath: async (path: string): Promise<FsDeletePathResponse> => {
    return wsRequest<FsDeletePathResponse>("fs_delete_path", { path });
  },

  duplicatePath: async (
    from: string,
    to: string,
  ): Promise<FsDuplicatePathResponse> => {
    return wsRequest<FsDuplicatePathResponse>("fs_duplicate_path", { from, to });
  },

  /**
   * 列出项目文件树
   */
  listProjectFiles: async (
    rootPath: string,
    options?: { showHidden?: boolean },
  ): Promise<FsListProjectFilesResponse> => {
    return wsRequest<FsListProjectFilesResponse>("fs_list_project_files", {
      root_path: rootPath,
      show_hidden: options?.showHidden ?? false,
    });
  },

  /**
   * 搜索文件内容（使用 ripgrep）
   */
  searchContent: async (
    rootPath: string,
    query: string,
    options?: { maxResults?: number; caseSensitive?: boolean },
  ): Promise<FsSearchContentResponse> => {
    return wsRequest<FsSearchContentResponse>("fs_search_content", {
      root_path: rootPath,
      query,
      max_results: options?.maxResults ?? 50,
      case_sensitive: options?.caseSensitive ?? false,
    });
  },

  /**
   * 搜索目录（按名称）
   */
  searchDirs: async (
    rootPath: string,
    query: string,
    options?: { maxResults?: number; maxDepth?: number },
  ): Promise<FsSearchDirsResponse> => {
    return wsRequest<FsSearchDirsResponse>("fs_search_dirs", {
      root_path: rootPath,
      query,
      max_results: options?.maxResults ?? 50,
      max_depth: options?.maxDepth ?? 4,
    });
  },
};

// ===== App API =====

export interface AppOpenResponse {
  success: boolean;
  app_name: string;
  path: string;
}

export const appApi = {
  /**
   * 使用外部应用打开路径
   */
  openWith: async (appName: string, path: string): Promise<AppOpenResponse> => {
    return wsRequest<AppOpenResponse>("app_open", {
      app_name: appName,
      path,
    });
  },
};

export const usageWsApi = {
  getOverview: async (
    refresh = false,
    providerId?: string | null,
  ): Promise<UsageOverviewResponse> => {
    const overview = await wsRequest<UsageOverviewResponse>(
      "usage_get_overview",
      {
        refresh,
        provider_id: providerId ?? null,
      },
      45_000,
    );
    emitUsageOverviewUpdated(overview);
    return overview;
  },

  setProviderSwitch: async (
    providerId: string,
    enabled: boolean,
  ): Promise<UsageOverviewResponse> => {
    const overview = await wsRequest<UsageOverviewResponse>(
      "usage_set_provider_switch",
      {
        provider_id: providerId,
        enabled,
      },
      45_000,
    );
    emitUsageOverviewUpdated(overview);
    return overview;
  },

  setProviderFooterCarousel: async (
    providerId: string,
    enabled: boolean,
  ): Promise<UsageOverviewResponse> => {
    const overview = await wsRequest<UsageOverviewResponse>(
      "usage_set_provider_footer_carousel",
      {
        provider_id: providerId,
        enabled,
      },
      45_000,
    );
    emitUsageOverviewUpdated(overview);
    return overview;
  },

  setAllProvidersSwitch: async (
    enabled: boolean,
  ): Promise<UsageOverviewResponse> => {
    const overview = await wsRequest<UsageOverviewResponse>(
      "usage_set_all_providers_switch",
      { enabled },
      45_000,
    );
    emitUsageOverviewUpdated(overview);
    return overview;
  },

  setProviderManualSetup: async (
    providerId: string,
    region: string | null,
    apiKey?: string | null,
  ): Promise<UsageOverviewResponse> => {
    const overview = await wsRequest<UsageOverviewResponse>(
      "usage_set_provider_manual_setup",
      {
        provider_id: providerId,
        region,
        api_key: apiKey ?? null,
      },
      45_000,
    );
    emitUsageOverviewUpdated(overview);
    return overview;
  },

  addProviderApiKey: async (
    providerId: string,
    region: string | null,
    apiKey: string,
  ): Promise<UsageOverviewResponse> => {
    const overview = await wsRequest<UsageOverviewResponse>(
      "usage_add_provider_api_key",
      {
        provider_id: providerId,
        region,
        api_key: apiKey,
      },
      45_000,
    );
    emitUsageOverviewUpdated(overview);
    return overview;
  },

  deleteProviderApiKey: async (
    providerId: string,
    keyId: string,
  ): Promise<UsageOverviewResponse> => {
    const overview = await wsRequest<UsageOverviewResponse>(
      "usage_delete_provider_api_key",
      {
        provider_id: providerId,
        key_id: keyId,
      },
      45_000,
    );
    emitUsageOverviewUpdated(overview);
    return overview;
  },

  setAutoRefresh: async (
    intervalMinutes?: number | null,
  ): Promise<UsageOverviewResponse> => {
    const overview = await wsRequest<UsageOverviewResponse>(
      "usage_set_auto_refresh",
      {
        interval_minutes: intervalMinutes ?? null,
      },
      45_000,
    );
    emitUsageOverviewUpdated(overview);
    return overview;
  },
};

// ===== Git API =====

export const gitApi = {
  /**
   * 获取 Git 状态（未提交/未推送的更改）
   */
  getStatus: async (path: string): Promise<GitStatusResponse> => {
    return wsRequest<GitStatusResponse>("git_get_status", { path });
  },

  /**
   * 获取当前 HEAD 提交 hash
   */
  getHeadCommit: async (path: string): Promise<{ commit_hash: string }> => {
    return wsRequest<{ commit_hash: string }>("git_get_head_commit", { path });
  },

  getCommitCount: async (
    path: string,
    baseCommit: string,
    headCommit: string,
  ): Promise<{ count: number }> => {
    return wsRequest<{ count: number }>("git_get_commit_count", {
      path,
      base_commit: baseCommit,
      head_commit: headCommit,
    });
  },

  /**
   * 列出仓库所有分支
   */
  listBranches: async (path: string): Promise<string[]> => {
    const result = await wsRequest<{ branches: string[] }>(
      "git_list_branches",
      { path },
    );
    return result.branches;
  },

  /**
   * 列出仓库所有远程分支
   */
  listRemoteBranches: async (path: string): Promise<string[]> => {
    const result = await wsRequest<{ branches: string[] }>(
      "git_list_remote_branches",
      { path },
    );
    return result.branches;
  },

  /**
   * 重命名 Git 分支
   */
  renameBranch: async (
    path: string,
    oldName: string,
    newName: string,
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("git_rename_branch", {
      path,
      old_name: oldName,
      new_name: newName,
    });
  },

  /**
   * 获取变更文件列表
   */
  getChangedFiles: async (
    path: string,
    baseBranch?: string | null,
    usePreferredCompare?: boolean,
  ): Promise<GitChangedFilesResponse> => {
    return wsRequest<GitChangedFilesResponse>("git_changed_files", {
      path,
      base_branch: baseBranch ?? null,
      use_preferred_compare: usePreferredCompare ?? false,
    });
  },

  /**
   * 获取单个文件的 diff
   */
  getFileDiff: async (
    path: string,
    filePath: string,
    baseBranch?: string | null,
  ): Promise<GitFileDiffResponse> => {
    return wsRequest<GitFileDiffResponse>("git_file_diff", {
      path,
      file_path: filePath,
      base_branch: baseBranch ?? null,
    });
  },

  /**
   * 提交更改
   */
  commit: async (path: string, message: string): Promise<GitCommitResponse> => {
    return wsRequest<GitCommitResponse>("git_commit", {
      path,
      message,
    });
  },

  /**
   * 生成 Git commit message
   */
  generateCommitMessage: async (
    path: string,
  ): Promise<GitGenerateCommitMessageResponse> => {
    return wsRequest<GitGenerateCommitMessageResponse>(
      "git_generate_commit_message",
      { path },
    );
  },

  /**
   * 推送到远程
   */
  push: async (path: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("git_push", { path });
  },

  /**
   * 暂存文件
   */
  stage: async (
    path: string,
    files: string[],
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("git_stage", { path, files });
  },

  /**
   * 取消暂存
   */
  unstage: async (
    path: string,
    files: string[],
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("git_unstage", { path, files });
  },

  /**
   * 放弃工作区更改
   */
  discardUnstaged: async (
    path: string,
    files: string[],
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("git_discard_unstaged", {
      path,
      files,
    });
  },

  /**
   * 放弃未追踪文件
   */
  discardUntracked: async (
    path: string,
    files: string[],
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("git_discard_untracked", {
      path,
      files,
    });
  },

  /**
   * 拉取变更
   */
  pull: async (path: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("git_pull", { path });
  },

  /**
   * 获取远程变更
   */
  fetch: async (path: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("git_fetch", { path });
  },

  /**
   * 同步本地与远端（已发布分支会先 pull 再 push；未发布分支会直接 publish/push）
   */
  sync: async (path: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("git_sync", { path });
  },
};

// ===== Project API =====

export const wsProjectApi = {
  /**
   * 获取所有项目
   */
  list: async (): Promise<ProjectModel[]> => {
    return wsRequest<ProjectModel[]>("project_list");
  },

  /**
   * 创建项目
   */
  create: async (data: {
    name: string;
    mainFilePath: string;
    sidebarOrder?: number;
    borderColor?: string;
  }): Promise<ProjectModel> => {
    return wsRequest<ProjectModel>("project_create", {
      name: data.name,
      main_file_path: data.mainFilePath,
      sidebar_order: data.sidebarOrder ?? 0,
      border_color: data.borderColor,
    });
  },

  /**
   * 更新项目
   */
  update: async (data: {
    guid: string;
    name?: string;
    borderColor?: string;
    sidebarOrder?: number;
  }): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("project_update", {
      guid: data.guid,
      name: data.name,
      border_color: data.borderColor,
      sidebar_order: data.sidebarOrder,
    });
  },

  /**
   * 删除项目
   */
  delete: async (guid: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("project_delete", { guid });
  },

  /**
   * 验证项目路径
   */
  validatePath: async (path: string): Promise<FsValidateGitPathResponse> => {
    return wsRequest<FsValidateGitPathResponse>("project_validate_path", {
      path,
    });
  },

  /**
   * 更新项目目标分支
   */
  updateTargetBranch: async (
    guid: string,
    targetBranch: string | null,
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("project_update_target_branch", {
      guid,
      target_branch: targetBranch,
    });
  },

  /**
   * 更新项目排序
   */
  updateOrder: async (
    guid: string,
    sidebarOrder: number,
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("project_update_order", {
      guid,
      sidebar_order: sidebarOrder,
    });
  },

  /**
   * 检查项目是否可以删除
   */
  checkCanDelete: async (
    guid: string,
  ): Promise<{ can_delete: boolean; active_workspace_count: number }> => {
    return wsRequest<{ can_delete: boolean; active_workspace_count: number }>(
      "project_check_can_delete",
      { guid },
    );
  },
};

// ===== Workspace API =====

export const wsWorkspaceApi = {
  /**
   * 获取项目下的所有 Workspace
   */
  listByProject: async (projectGuid: string): Promise<WorkspaceModel[]> => {
    return wsRequest<WorkspaceModel[]>("workspace_list", {
      project_guid: projectGuid,
    });
  },

  /**
   * 创建 Workspace
   */
  create: async (data: {
    projectGuid: string;
    name: string;
    displayName?: string | null;
    branch: string;
    baseBranch?: string | null;
    sidebarOrder?: number;
    initialRequirement?: string | null;
    githubIssue?: GithubIssuePayload | null;
    githubPr?: GithubPrPayload | null;
    autoExtractTodos?: boolean;
    priority?: string | null;
    workflowStatus?: string | null;
    labelGuids?: string[];
    attachments?: WorkspaceAttachmentPayload[];
  }): Promise<WorkspaceModel> => {
    return wsRequest<WorkspaceModel>("workspace_create", {
      project_guid: data.projectGuid,
      name: data.name,
      display_name: data.displayName ?? null,
      branch: data.branch,
      base_branch: data.baseBranch ?? null,
      sidebar_order: data.sidebarOrder ?? 0,
      initial_requirement: data.initialRequirement ?? null,
      github_issue: data.githubIssue ?? null,
      github_pr: data.githubPr ?? null,
      auto_extract_todos: data.autoExtractTodos ?? false,
      priority: data.priority ?? null,
      workflow_status: data.workflowStatus ?? null,
      label_guids: data.labelGuids ?? null,
      attachments: (data.attachments ?? []).map((a) => ({
        filename: a.filename,
        mime: a.mime,
        data_base64: a.dataBase64,
      })),
    });
  },

  /**
   * 更新 Workspace 名称
   */
  updateName: async (
    guid: string,
    name: string,
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("workspace_update_name", {
      guid,
      name,
    });
  },

  /**
   * 更新 Workspace 分支
   */
  updateBranch: async (
    guid: string,
    branch: string,
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("workspace_update_branch", {
      guid,
      branch,
    });
  },

  updateWorkflowStatus: async (
    guid: string,
    workflowStatus: string,
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("workspace_update_workflow_status", {
      guid,
      workflow_status: workflowStatus,
    });
  },

  updatePriority: async (
    guid: string,
    priority: string,
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("workspace_update_priority", {
      guid,
      priority,
    });
  },

  listLabels: async (): Promise<WorkspaceLabelModel[]> => {
    return wsRequest<WorkspaceLabelModel[]>("workspace_label_list", {});
  },

  createLabel: async (data: {
    name: string;
    color: string;
  }): Promise<WorkspaceLabelModel> => {
    return wsRequest<WorkspaceLabelModel>("workspace_label_create", data);
  },

  updateLabel: async (
    guid: string,
    data: {
      name: string;
      color: string;
    },
  ): Promise<WorkspaceLabelModel> => {
    return wsRequest<WorkspaceLabelModel>("workspace_label_update", {
      guid,
      ...data,
    });
  },

  updateLabels: async (
    guid: string,
    labelGuids: string[],
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("workspace_update_labels", {
      guid,
      label_guids: labelGuids,
    });
  },

  confirmTodos: async (
    guid: string,
    markdown: string,
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("workspace_confirm_todos", {
      guid,
      markdown,
    });
  },

  skipSetupScript: async (
    guid: string,
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("workspace_skip_setup_script", {
      guid,
    });
  },

  skipSetupStep: async (
    guid: string,
    failedStepKey: string,
    context?: {
      initialRequirement?: string | null;
      githubIssue?: GithubIssuePayload | null;
      autoExtractTodos?: boolean;
    },
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("workspace_skip_setup_step", {
      guid,
      failed_step_key: failedStepKey,
      initial_requirement: context?.initialRequirement ?? null,
      github_issue: context?.githubIssue ?? null,
      auto_extract_todos: context?.autoExtractTodos ?? false,
    });
  },

  /**
   * 更新 Workspace 排序
   */
  updateOrder: async (
    guid: string,
    sidebarOrder: number,
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("workspace_update_order", {
      guid,
      sidebar_order: sidebarOrder,
    });
  },

  markVisited: async (guid: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("workspace_mark_visited", { guid });
  },

  /**
   * 删除 Workspace
   */
  delete: async (guid: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("workspace_delete", { guid });
  },

  /**
   * 置顶 Workspace
   */
  pin: async (guid: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("workspace_pin", { guid });
  },

  /**
   * 取消置顶 Workspace
   */
  unpin: async (guid: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("workspace_unpin", { guid });
  },

  /**
   * 更新置顶工作区顺序
   */
  updatePinOrder: async (workspaceIds: string[]): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("workspace_update_pin_order", {
      workspace_ids: workspaceIds,
    });
  },

  /**
   * 归档 Workspace
   */
  archive: async (guid: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("workspace_archive", { guid });
  },

  /**
   * 获取所有归档的 Workspace
   */
  listArchived: async (): Promise<{ workspaces: ArchivedWorkspace[] }> => {
    return wsRequest<{ workspaces: ArchivedWorkspace[] }>(
      "workspace_list_archived",
      {},
    );
  },

  /**
   * 取消归档 Workspace
   */
  unarchive: async (guid: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("workspace_unarchive", { guid });
  },
};

export const reviewWsApi = {
  listSessions: async (
    workspaceGuid: string,
    includeArchived = false,
  ): Promise<ReviewSessionDto[]> => {
    return wsRequest<ReviewSessionDto[]>("review_session_list", {
      workspace_guid: workspaceGuid,
      include_archived: includeArchived,
    });
  },

  getSession: async (sessionGuid: string): Promise<ReviewSessionDto | null> => {
    return wsRequest<ReviewSessionDto | null>("review_session_get", {
      session_guid: sessionGuid,
    });
  },

  createSession: async (data: {
    workspaceGuid: string;
    title?: string | null;
    createdBy?: string | null;
  }): Promise<ReviewSessionDto> => {
    return wsRequest<ReviewSessionDto>("review_session_create", {
      workspace_guid: data.workspaceGuid,
      title: data.title ?? null,
      created_by: data.createdBy ?? null,
    }, 60_000);
  },

  closeSession: async (sessionGuid: string): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("review_session_close", {
      session_guid: sessionGuid,
    });
  },

  archiveSession: async (sessionGuid: string): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("review_session_archive", {
      session_guid: sessionGuid,
    });
  },

  activateSession: async (sessionGuid: string): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("review_session_activate", {
      session_guid: sessionGuid,
    });
  },

  renameSession: async (sessionGuid: string, title: string): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("review_session_rename", {
      session_guid: sessionGuid,
      title,
    });
  },

  listFilesByRevision: async (revisionGuid: string): Promise<ReviewFileDto[]> => {
    return wsRequest<ReviewFileDto[]>("review_file_list", {
      revision_guid: revisionGuid,
    });
  },

  getFileContent: async (
    fileSnapshotGuid: string,
  ): Promise<ReviewFileContentDto> => {
    return wsRequest<ReviewFileContentDto>("review_file_content_get", {
      file_snapshot_guid: fileSnapshotGuid,
    });
  },

  setFileReviewed: async (data: {
    fileStateGuid: string;
    reviewed: boolean;
    reviewedBy?: string | null;
  }): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("review_file_set_reviewed", {
      file_state_guid: data.fileStateGuid,
      reviewed: data.reviewed,
      reviewed_by: data.reviewedBy ?? null,
    });
  },

  listComments: async (data: {
    sessionGuid: string;
    revisionGuid?: string | null;
  }): Promise<ReviewCommentDto[]> => {
    return wsRequest<ReviewCommentDto[]>("review_comment_list", {
      session_guid: data.sessionGuid,
      revision_guid: data.revisionGuid ?? null,
    });
  },

  createComment: async (data: {
    sessionGuid: string;
    revisionGuid: string;
    fileSnapshotGuid: string;
    anchor: ReviewAnchor;
    body: string;
    title?: string | null;
    createdBy?: string | null;
    parentCommentGuid?: string | null;
  }): Promise<ReviewCommentDto> => {
    return wsRequest<ReviewCommentDto>("review_comment_create", {
      session_guid: data.sessionGuid,
      revision_guid: data.revisionGuid,
      file_snapshot_guid: data.fileSnapshotGuid,
      anchor: data.anchor,
      body: data.body,
      title: data.title ?? null,
      created_by: data.createdBy ?? null,
      parent_comment_guid: data.parentCommentGuid ?? null,
    });
  },

  updateCommentStatus: async (
    commentGuid: string,
    status: string,
  ): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("review_comment_update_status", {
      comment_guid: commentGuid,
      status,
    });
  },

  addMessage: async (data: {
    commentGuid: string;
    authorType: string;
    kind: string;
    body: string;
    fixRunGuid?: string | null;
  }): Promise<ReviewMessageDto> => {
    return wsRequest<ReviewMessageDto>("review_message_add", {
      comment_guid: data.commentGuid,
      author_type: data.authorType,
      kind: data.kind,
      body: data.body,
      fix_run_guid: data.fixRunGuid ?? null,
    });
  },

  updateMessage: async (messageGuid: string, body: string): Promise<ReviewMessageDto> => {
    return wsRequest<ReviewMessageDto>("review_message_update", {
      message_guid: messageGuid,
      body,
    });
  },

  deleteMessage: async (messageGuid: string): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("review_message_delete", {
      message_guid: messageGuid,
    });
  },

  listFixRuns: async (sessionGuid: string): Promise<ReviewFixRunModel[]> => {
    return wsRequest<ReviewFixRunModel[]>("review_fix_run_list", {
      session_guid: sessionGuid,
    });
  },

  createFixRun: async (data: {
    sessionGuid: string;
    baseRevisionGuid: string;
    executionMode: string;
    selectedCommentGuids?: string[];
    createdBy?: string | null;
  }): Promise<ReviewFixRunCreatedDto> => {
    return wsRequest<ReviewFixRunCreatedDto>("review_fix_run_create", {
      session_guid: data.sessionGuid,
      base_revision_guid: data.baseRevisionGuid,
      execution_mode: data.executionMode,
      selected_comment_guids: data.selectedCommentGuids ?? [],
      created_by: data.createdBy ?? null,
    }, 60_000);
  },

  getRunArtifact: async (data: {
    runGuid: string;
    kind: "prompt" | "patch" | "summary";
  }): Promise<ReviewRunArtifactDto> => {
    return wsRequest<ReviewRunArtifactDto>("review_fix_run_artifact_get", {
      run_guid: data.runGuid,
      kind: data.kind,
    });
  },

  finalizeFixRun: async (data: {
    runGuid: string;
    title?: string | null;
  }): Promise<ReviewFixRunFinalizedDto> => {
    return wsRequest<ReviewFixRunFinalizedDto>("review_fix_run_finalize", {
      run_guid: data.runGuid,
      title: data.title ?? null,
    }, 60_000);
  },

  setFixRunStatus: async (data: {
    runGuid: string;
    status: "running" | "succeeded" | "failed";
    message?: string | null;
    title?: string | null;
    summary?: string | null;
  }): Promise<ReviewFixRunStatusDto> => {
    return wsRequest<ReviewFixRunStatusDto>("review_fix_run_set_status", {
      run_guid: data.runGuid,
      status: data.status,
      message: data.message ?? null,
      title: data.title ?? null,
      summary: data.summary ?? null,
    }, 60_000);
  },
};

export const wsGithubApi = {
  listIssues: async (params: {
    owner: string;
    repo: string;
    state?: string;
    limit?: number;
  }): Promise<GithubIssuePayload[]> => {
    return wsRequest<GithubIssuePayload[]>("github_issue_list", {
      owner: params.owner,
      repo: params.repo,
      state: params.state ?? "open",
      limit: params.limit ?? 50,
    });
  },

  getIssue: async (params:
    | { owner: string; repo: string; issueNumber: number; issueUrl?: undefined }
    | { issueUrl: string; owner?: undefined; repo?: undefined; issueNumber?: undefined },
  ): Promise<GithubIssuePayload> => {
    return wsRequest<GithubIssuePayload>("github_issue_get", {
      owner: params.owner ?? null,
      repo: params.repo ?? null,
      issue_number: params.issueNumber ?? null,
      issue_url: params.issueUrl ?? null,
    });
  },

  listPrs: async (params: {
    owner: string;
    repo: string;
    state?: string;
    limit?: number;
  }): Promise<GithubPrPayload[]> => {
    return wsRequest<GithubPrPayload[]>("github_pr_list_repo", {
      owner: params.owner,
      repo: params.repo,
      state: params.state ?? "open",
      limit: params.limit ?? 50,
    });
  },

  getPr: async (params:
    | { owner: string; repo: string; prNumber: number; prUrl?: undefined }
    | { prUrl: string; owner?: undefined; repo?: undefined; prNumber?: undefined },
  ): Promise<GithubPrPayload> => {
    return wsRequest<GithubPrPayload>("github_pr_get", {
      owner: params.owner ?? null,
      repo: params.repo ?? null,
      pr_number: params.prNumber ?? null,
      pr_url: params.prUrl ?? null,
    });
  },
};

// ===== Script API =====

export const wsScriptApi = {
  /**
   * 获取项目脚本
   */
  get: async (projectGuid: string): Promise<Record<string, string>> => {
    return wsRequest<Record<string, string>>("script_get", {
      project_guid: projectGuid,
    });
  },

  /**
   * 保存项目脚本
   */
  save: async (
    projectGuid: string,
    scripts: Record<string, string>,
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("script_save", {
      project_guid: projectGuid,
      scripts,
    });
  },
};

// ===== Skills API =====

export interface SkillFile {
  name: string;
  relative_path: string;
  absolute_path: string;
  content: string | null;
  is_main: boolean;
}

export interface SkillPlacement {
  id: string;
  agent: string;
  scope: 'global' | 'project' | 'inside_project';
  project_id: string | null;
  project_name: string | null;
  path: string;
  original_path: string;
  resolved_path: string | null;
  status: 'enabled' | 'disabled';
  entry_kind: 'directory' | 'file' | 'symlink';
  symlink_target: string | null;
  can_delete: boolean;
  can_toggle: boolean;
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  agents: string[];
  scope: "global" | "project" | "inside_project";
  project_id: string | null;
  project_name: string | null;
  path: string;
  files: SkillFile[];
  title: string | null;
  status: 'enabled' | 'disabled' | 'partial';
  manageable: boolean;
  can_delete: boolean;
  can_toggle: boolean;
  placements: SkillPlacement[];
}

export type AgentId = "claude_code" | "codex" | "gemini_cli";

export interface AgentStatus {
  id: AgentId;
  registry_id: string;
  name: string;
  description: string;
  npm_package: string;
  executable: string;
  installed: boolean;
  executable_path: string | null;
  auth_detected: boolean;
  auth_source: string | null;
}

export interface AgentInstallResponse {
  id: AgentId;
  installed: boolean;
  install_method: string;
  message: string;
}

export interface AgentConfigState {
  id: AgentId;
  has_stored_api_key: boolean;
  auth_detected: boolean;
  auth_source: string | null;
}

export interface RegistryAgent {
  id: string;
  name: string;
  version: string;
  description: string;
  repository: string | null;
  icon: string | null;
  cli_command: string;
  install_method: string;
  package: string | null;
  installed: boolean;
  /** The version currently installed (if installed). May differ from `version` which is the latest. */
  installed_version?: string;
  default_config?: Record<string, string>;
}

export interface CustomAgent {
  name: string;
  type: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  default_config?: Record<string, string>;
}

export interface RegistryInstallResponse {
  registry_id: string;
  installed: boolean;
  install_method: string;
  message: string;
  needs_confirmation?: boolean;
  overwrite_message?: string;
}

export const skillsApi = {
  /**
   * 获取已安装的 Skills 列表
   */
  list: async (): Promise<{ skills: SkillInfo[] }> => {
    return wsRequest<{ skills: SkillInfo[] }>("skills_list");
  },

  /**
   * 获取单个 Skill 详情
   */
  get: async (scope: string, id: string): Promise<SkillInfo> => {
    return wsRequest<SkillInfo>("skills_get", { scope, id });
  },

  setEnabled: async (
    id: string,
    enabled: boolean,
    placementIds?: string[],
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('skills_set_enabled', {
      id,
      enabled,
      placement_ids: placementIds,
    });
  },

  delete: async (id: string, placementIds?: string[]): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('skills_delete', {
      id,
      placement_ids: placementIds,
    });
  },

  /**
   * Install project-wiki skill to ~/.atmos/skills/.system/project-wiki
   */
  installProjectWiki: async (): Promise<{
    success: boolean;
    path: string;
    message: string;
  }> => {
    return wsRequest<{ success: boolean; path: string; message: string }>(
      "wiki_skill_install",
    );
  },

  /**
   * Check if project-wiki, project-wiki-update, and project-wiki-specify are all installed
   * in ~/.atmos/skills/.system/
   */
  isProjectWikiInstalledInSystem: async (): Promise<boolean> => {
    const res = await wsRequest<{ installed: boolean }>(
      "wiki_skill_system_status",
    );
    return res.installed;
  },

  /**
   * Check if all three code review skills (code-reviewer, code-review-expert, typescript-react-reviewer)
   * are installed in ~/.atmos/skills/.system/
   */
  isCodeReviewSkillsInstalledInSystem: async (): Promise<boolean> => {
    const res = await wsRequest<{ installed: boolean }>(
      "code_review_skill_system_status",
    );
    return res.installed;
  },

  /**
   * Check if git-commit skill is installed in ~/.atmos/skills/.system/git-commit/
   */
  isGitCommitSkillInstalledInSystem: async (): Promise<boolean> => {
    const res = await wsRequest<{ installed: boolean }>(
      "git_commit_skill_system_status",
    );
    return res.installed;
  },

  /**
   * Sync a single system skill by name
   */
  syncSingleSystemSkill: async (
    skillName: string,
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("sync_single_system_skill", {
      skill_name: skillName,
    });
  },

  /**
   * Manually trigger sync of all system skills from project/GitHub
   */
  syncSystemSkills: async (): Promise<{ initiated: boolean }> => {
    return wsRequest<{ initiated: boolean }>("skills_system_sync");
  },
};

// ===== Function Settings API =====

export interface FunctionSettings {
  editor?: {
    auto_save?: boolean;
    line_wrap?: boolean;
  };
  workspace_kanban_view?: {
    state?: unknown;
    [key: string]: unknown;
  };
  workspace_sidebar?: {
    grouping_mode?: 'project' | 'status' | 'time';
    [key: string]: unknown;
  };
  inner_browser?: {
    favorite_site?: Array<{
      url: string;
      name?: string;
    }>;
  };
  terminal?: {
    file_link_open_mode?: 'atmos' | 'finder' | 'app';
    file_link_open_app?: string;
  };
  git_commit?: {
    acp_new_session_switch?: boolean;
  };
  workspace_settings?: {
    close_pr_on_delete?: boolean;
    close_issue_on_delete?: boolean;
    delete_remote_branch?: boolean;
    confirm_before_delete?: boolean;
    branch_prefix?: string;
    confirm_before_archive?: boolean;
    kill_tmux_on_archive?: boolean;
    close_acp_on_archive?: boolean;
  };
  [key: string]: unknown;
}

export type LlmProviderKind = "openai-compatible" | "anthropic-compatible";

export interface LlmProviderEntry {
  enabled: boolean;
  displayName?: string | null;
  kind: LlmProviderKind;
  base_url: string;
  api_key: string;
  model: string;
  timeout_ms?: number | null;
  max_output_tokens?: number | null;
}

export interface SessionTitleFormatConfig {
  include_agent_name?: boolean;
  include_project_name?: boolean;
  include_intent_emoji?: boolean;
}

export interface LlmFeatureBindings {
  session_title?: string | null;
  git_commit?: string | null;
  git_commit_language?: string | null;
  workspace_issue_todo?: string | null;
  workspace_issue_todo_language?: string | null;
  session_title_format?: SessionTitleFormatConfig | null;
}

export interface LlmProvidersFile {
  version: number;
  default_provider?: string | null;
  features: LlmFeatureBindings;
  providers: Record<string, LlmProviderEntry>;
}

export interface LlmProviderTestResponse {
  text: string;
}

export const functionSettingsApi = {
  get: async (): Promise<FunctionSettings> => {
    return wsRequest<FunctionSettings>("function_settings_get");
  },

  update: async (
    functionName: string,
    key: string,
    value: unknown,
  ): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("function_settings_update", {
      function_name: functionName,
      key,
      value,
    });
  },
};

export const llmProvidersApi = {
  get: async (): Promise<LlmProvidersFile> => {
    return wsRequest<LlmProvidersFile>("llm_providers_get");
  },

  update: async (config: LlmProvidersFile): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("llm_providers_update", { config });
  },

  testProvider: async (params: {
    stream_id: string;
    provider_id?: string | null;
    provider: LlmProviderEntry;
  }): Promise<LlmProviderTestResponse> => {
    return wsRequest<LlmProviderTestResponse>("llm_provider_test", params, 120_000);
  },
};

export interface CodeAgentCustomEntry {
  id: string;
  label: string;
  cmd: string;
  flags: string;
  enabled?: boolean;
}

export const codeAgentCustomApi = {
  get: async (): Promise<{ agents: CodeAgentCustomEntry[] }> => {
    return wsRequest<{ agents: CodeAgentCustomEntry[] }>("code_agent_custom_get");
  },

  update: async (agents: CodeAgentCustomEntry[]): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("code_agent_custom_update", { agents });
  },
};

export interface AgentBehaviourSettings {
  idle_session_timeout_mins: number;
}

export const agentBehaviourSettingsApi = {
  get: async (): Promise<AgentBehaviourSettings> => {
    return wsRequest<AgentBehaviourSettings>("agent_behaviour_settings_get");
  },
  update: async (settings: AgentBehaviourSettings): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("agent_behaviour_settings_update", settings);
  },
};

// ===== Agent API =====

export const agentApi = {
  list: async (): Promise<{ agents: AgentStatus[] }> => {
    return wsRequest<{ agents: AgentStatus[] }>("agent_list");
  },

  install: async (id: AgentId): Promise<AgentInstallResponse> => {
    return wsRequest<AgentInstallResponse>("agent_install", { id });
  },

  getConfig: async (id: AgentId): Promise<AgentConfigState> => {
    return wsRequest<AgentConfigState>("agent_config_get", { id });
  },

  setConfig: async (
    id: AgentId,
    apiKey: string,
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("agent_config_set", {
      id,
      api_key: apiKey,
    });
  },

  listRegistry: async (
    forceRefresh = false,
  ): Promise<{ agents: RegistryAgent[] }> => {
    return wsRequest<{ agents: RegistryAgent[] }>("agent_registry_list", {
      force_refresh: forceRefresh,
    });
  },

  installRegistry: async (
    registryId: string,
    forceOverwrite = false,
  ): Promise<RegistryInstallResponse> => {
    return wsRequest<RegistryInstallResponse>(
      "agent_registry_install",
      {
        registry_id: registryId,
        force_overwrite: forceOverwrite,
      },
      180_000,
    );
  },

  removeRegistry: async (
    registryId: string,
  ): Promise<RegistryInstallResponse> => {
    return wsRequest<RegistryInstallResponse>(
      "agent_registry_remove",
      {
        registry_id: registryId,
      },
      180_000,
    );
  },

  listCustomAgents: async (): Promise<{ agents: CustomAgent[] }> => {
    return wsRequest<{ agents: CustomAgent[] }>("custom_agent_list");
  },

  addCustomAgent: async (agent: {
    name: string;
    command: string;
    args: string[];
    env: Record<string, string>;
  }): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("custom_agent_add", agent);
  },

  removeCustomAgent: async (name: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("custom_agent_remove", { name });
  },

  getCustomAgentsJson: async (): Promise<{ json: string }> => {
    return wsRequest<{ json: string }>("custom_agent_get_json");
  },

  setCustomAgentsJson: async (json: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("custom_agent_set_json", { json });
  },

  getManifestPath: async (): Promise<{ path: string }> => {
    return wsRequest<{ path: string }>("custom_agent_get_manifest_path");
  },
};
