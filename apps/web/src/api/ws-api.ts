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
  has_unpushed_commits: boolean;
  uncommitted_count: number;
  unpushed_count: number;
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
}

// 文件 diff 响应
export interface GitFileDiffResponse {
  file_path: string;
  old_content: string;
  new_content: string;
  status: string;
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
  branch: string;
  project_guid: string;
  project_name: string;
  archived_at: string;
}

// Workspace 类型（后端返回格式）
export interface WorkspaceModel {
  guid: string;
  project_guid: string;
  name: string;
  branch: string;
  sidebar_order: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  is_pinned: boolean;
  pinned_at: string | null;
  is_archived: boolean;
  archived_at: string | null;
  local_path: string;
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

export interface UsageManualSetupResponse {
  selected_region: string | null;
  region_options: UsageManualSetupOptionResponse[];
  api_key_configured: boolean;
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
    return wsRequest<UsageOverviewResponse>(
      "usage_get_overview",
      {
        refresh,
        provider_id: providerId ?? null,
      },
      45_000,
    );
  },

  setProviderSwitch: async (
    providerId: string,
    enabled: boolean,
  ): Promise<UsageOverviewResponse> => {
    return wsRequest<UsageOverviewResponse>(
      "usage_set_provider_switch",
      {
        provider_id: providerId,
        enabled,
      },
      45_000,
    );
  },

  setAllProvidersSwitch: async (
    enabled: boolean,
  ): Promise<UsageOverviewResponse> => {
    return wsRequest<UsageOverviewResponse>(
      "usage_set_all_providers_switch",
      { enabled },
      45_000,
    );
  },

  setProviderManualSetup: async (
    providerId: string,
    region: string | null,
    apiKey?: string | null,
  ): Promise<UsageOverviewResponse> => {
    return wsRequest<UsageOverviewResponse>(
      "usage_set_provider_manual_setup",
      {
        provider_id: providerId,
        region,
        api_key: apiKey ?? null,
      },
      45_000,
    );
  },

  setAutoRefresh: async (
    intervalMinutes?: number | null,
  ): Promise<UsageOverviewResponse> => {
    return wsRequest<UsageOverviewResponse>(
      "usage_set_auto_refresh",
      {
        interval_minutes: intervalMinutes ?? null,
      },
      45_000,
    );
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
  getChangedFiles: async (path: string): Promise<GitChangedFilesResponse> => {
    return wsRequest<GitChangedFilesResponse>("git_changed_files", { path });
  },

  /**
   * 获取单个文件的 diff
   */
  getFileDiff: async (
    path: string,
    filePath: string,
  ): Promise<GitFileDiffResponse> => {
    return wsRequest<GitFileDiffResponse>("git_file_diff", {
      path,
      file_path: filePath,
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
   * 同步 (fetch + pull)
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
    branch: string;
    sidebarOrder?: number;
  }): Promise<WorkspaceModel> => {
    return wsRequest<WorkspaceModel>("workspace_create", {
      project_guid: data.projectGuid,
      name: data.name,
      branch: data.branch,
      sidebar_order: data.sidebarOrder ?? 0,
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

export interface SkillInfo {
  name: string;
  description: string;
  agents: string[];
  scope: "global" | "project";
  project_id: string | null;
  project_name: string | null;
  path: string;
  files: SkillFile[];
  title: string | null;
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
  git_commit?: {
    acp_new_session_switch?: boolean;
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

export interface LlmFeatureBindings {
  session_title?: string | null;
  git_commit?: string | null;
}

export interface LlmProvidersFile {
  version: number;
  default_provider?: string | null;
  features: LlmFeatureBindings;
  providers: Record<string, LlmProviderEntry>;
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
