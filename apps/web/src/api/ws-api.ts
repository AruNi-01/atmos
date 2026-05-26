"use client";

import { wsRequest } from "@/api/ws/request";
import type { Workspace, WorkspaceCreateSource, WorkspaceWorkflowStatus, WorkspacePriority, WorkspaceLabel } from "@/shared/types/domain";
import type { GithubIssuePayload, GithubPrPayload } from "@/api/ws/github-api";
import type {
  ArchivedWorkspace,
  FsDeletePathResponse,
  FsDuplicatePathResponse,
  FsCreateDirResponse,
  FsListDirResponse,
  FsListProjectFilesResponse,
  FsReadFileResponse,
  FsRenamePathResponse,
  FsSearchContentResponse,
  FsSearchDirsResponse,
  FsValidateGitPathResponse,
  FsWriteFileResponse,
  GitChangedFilesResponse,
  GitCommitResponse,
  GitFileDiffResponse,
  GitGenerateCommitMessageResponse,
  GitPatchChunkResponse,
  GitStatusResponse,
  ProjectModel,
  WorkspaceAttachmentPayload,
  WorkspaceImportGithubIssuesResult,
  WorkspaceLabelModel,
  WorkspaceModel,
} from "@/api/ws-api-types";

export type {
  ArchivedWorkspace,
  FileTreeNode,
  FsCreateDirResponse,
  FsDeletePathResponse,
  FsDuplicatePathResponse,
  FsEntry,
  FsListDirResponse,
  FsListProjectFilesResponse,
  FsReadFileResponse,
  FsRenamePathResponse,
  FsSearchContentResponse,
  FsSearchDirsResponse,
  FsValidateGitPathResponse,
  FsWriteFileResponse,
  GitChangedFile,
  GitChangedFilesResponse,
  GitCommitResponse,
  GitFileDiffResponse,
  GitGenerateCommitMessageResponse,
  GitPatchChunkResponse,
  GitStatusResponse,
  ProjectModel,
  SearchMatch,
  WorkspaceAttachmentPayload,
  WorkspaceImportGithubIssuesResult,
  WorkspaceLabelModel,
  WorkspaceModel,
} from "@/api/ws-api-types";

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

// ===== Canvas API =====

export interface CanvasBoardResponse {
  guid: string;
  slug: string;
  name: string;
  document_json: string;
  updated_at: string;
}

export const canvasWsApi = {
  getDefaultBoard: async (): Promise<CanvasBoardResponse> => {
    return wsRequest<CanvasBoardResponse>("canvas_get_default_board");
  },

  updateDefaultBoard: async (documentJson: string): Promise<CanvasBoardResponse> => {
    return wsRequest<CanvasBoardResponse>("canvas_update_default_board", {
      document_json: documentJson,
    });
  },
};

// ===== Canvas terminal-agent bridge (APP-015) =====

export interface CanvasBridgeRegisterPayload {
  client_id: string;
  label?: string;
  accepts_commands?: boolean;
  capabilities?: string[];
}

export interface CanvasAgentDispatchResultPayload {
  request_id: string;
  success: boolean;
  error_code?: string;
  error_message?: string;
  recoverable?: boolean;
  data?: unknown;
}

export const canvasAgentBridgeWsApi = {
  register: (payload: CanvasBridgeRegisterPayload) =>
    wsRequest<unknown>("canvas_bridge_register", payload),
  unregister: (clientId: string) =>
    wsRequest<unknown>("canvas_bridge_unregister", { client_id: clientId }),
  postResult: (payload: CanvasAgentDispatchResultPayload) =>
    wsRequest<unknown>("canvas_agent_dispatch_result", {
      ...payload,
      data: payload.data ?? null,
    }),
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
    options?: { againstIndex?: boolean },
  ): Promise<GitFileDiffResponse> => {
    return wsRequest<GitFileDiffResponse>("git_file_diff", {
      path,
      file_path: filePath,
      base_branch: baseBranch ?? null,
      against_index: options?.againstIndex ?? false,
    });
  },

  /**
   * 将单块 unified diff 应用到暂存区
   */
  stagePatchChunk: async (
    path: string,
    filePath: string,
    patch: string,
    fileStatus: string,
  ): Promise<GitPatchChunkResponse> => {
    return wsRequest<GitPatchChunkResponse>("git_stage_patch_chunk", {
      path,
      file_path: filePath,
      patch,
      file_status: fileStatus,
    });
  },

  /**
   * 逆向将单块 unified diff 应用到工作区（撤销未暂存改动）
   */
  restorePatchChunk: async (
    path: string,
    filePath: string,
    patch: string,
    fileStatus: string,
  ): Promise<GitPatchChunkResponse> => {
    return wsRequest<GitPatchChunkResponse>("git_restore_patch_chunk", {
      path,
      file_path: filePath,
      patch,
      file_status: fileStatus,
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
    logoPath?: string | null;
    sidebarOrder?: number;
  }): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("project_update", {
      guid: data.guid,
      name: data.name,
      border_color: data.borderColor,
      logo_path: data.logoPath,
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

function mapWorkspaceCreateSource(source: WorkspaceModel["create_source"]): WorkspaceCreateSource {
  return source === "issue_only" || source === "automation" ? source : "manual";
}

export const wsWorkspaceApi = {
  /**
   * 获取项目下的所有 Workspace
   */
  listByProject: async (projectGuid: string, includeIssueOnly = false): Promise<WorkspaceModel[]> => {
    return wsRequest<WorkspaceModel[]>("workspace_list", {
      project_guid: projectGuid,
      include_issue_only: includeIssueOnly,
    });
  },

  listProjectWorkspacesFiltered: async (projectId: string, guids: string[]): Promise<Workspace[]> => {
    const allWorkspaces = await wsWorkspaceApi.listByProject(projectId, true);
    const filtered = allWorkspaces.filter(w => guids.includes(w.guid));
    return filtered.map((model): Workspace => ({
      id: model.guid,
      name: model.name,
      displayName: model.display_name ?? undefined,
      branch: model.branch,
      baseBranch: model.base_branch,
      isActive: false,
      status: "clean",
      projectId: model.project_guid,
      isPinned: model.is_pinned,
      pinnedAt: model.pinned_at ?? undefined,
      pinOrder: model.pin_order ?? undefined,
      isArchived: model.is_archived,
      archivedAt: model.archived_at ?? undefined,
      createdAt: model.created_at,
      lastVisitedAt: model.last_visited_at ?? undefined,
      workflowStatus: model.workflow_status as WorkspaceWorkflowStatus,
      priority: model.priority as WorkspacePriority,
      labels: (model.labels ?? []).map((label): WorkspaceLabel => ({
        id: label.guid,
        name: label.name,
        color: label.color,
        source: (label.source as 'manual' | 'gitHub_issue' | 'gitHub_pr') || 'manual',
      })),
      localPath: model.local_path,
      githubIssue: model.github_issue,
      githubPr: model.github_pr,
      createSource: mapWorkspaceCreateSource(model.create_source),
    }));
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
   * 从 GitHub Issues 导入创建 Issue Only Workspaces
   */
  importGithubIssues: async (data: {
    projectGuid: string;
    issues: GithubIssuePayload[];
    workflowStatus?: string | null;
    priority?: string | null;
    labelGuids?: string[] | null;
  }): Promise<WorkspaceImportGithubIssuesResult> => {
    return wsRequest<WorkspaceImportGithubIssuesResult>("workspace_import_github_issues", {
      project_guid: data.projectGuid,
      issues: data.issues,
      workflow_status: data.workflowStatus ?? null,
      priority: data.priority ?? null,
      label_guids: data.labelGuids ?? null,
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

  listLabels: async (deletedOnly: boolean = false): Promise<WorkspaceLabelModel[]> => {
    return wsRequest<WorkspaceLabelModel[]>("workspace_label_list", { deleted_only: deletedOnly });
  },

  createLabel: async (data: {
    name: string;
    color: string;
    source?: string;
  }): Promise<WorkspaceLabelModel> => {
    return wsRequest<WorkspaceLabelModel>("workspace_label_create", data);
  },

  updateLabel: async (
    guid: string,
    data: {
      name: string;
      color: string;
      source?: string;
    },
  ): Promise<WorkspaceLabelModel> => {
    return wsRequest<WorkspaceLabelModel>("workspace_label_update", {
      guid,
      ...data,
    });
  },

  deleteLabel: async (guid: string): Promise<void> => {
    return wsRequest<void>("workspace_label_delete", { guid });
  },

  restoreLabel: async (guid: string): Promise<void> => {
    return wsRequest<void>("workspace_label_restore", { guid });
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

export * from "@/api/ws/agent-api";
export * from "@/api/ws/settings-api";
export * from "@/api/ws/skills-api";
export * from "@/api/ws/review-api";
export * from "@/api/ws/github-api";
export * from "@/api/ws/usage-api";
export * from "@/api/ws/local-model-api";
