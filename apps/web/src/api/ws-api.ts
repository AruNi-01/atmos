'use client';

import { useWebSocketStore, WsAction } from '@/hooks/use-websocket';

// ===== 类型定义 =====

// 文件系统类型
export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
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
  content: string;
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

// ===== WebSocket API 客户端 =====

/**
 * 发送 WebSocket 请求的通用函数
 */
async function wsRequest<T>(action: WsAction, data: unknown = {}): Promise<T> {
  const { send, connectionState, connect } = useWebSocketStore.getState();
  
  // 如果未连接，尝试连接
  if (connectionState !== 'connected') {
    connect();
    
    // 等待连接建立
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 5000);
      
      const checkConnection = setInterval(() => {
        const state = useWebSocketStore.getState();
        if (state.connectionState === 'connected') {
          clearInterval(checkConnection);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });
  }
  
  return send<T>(action, data);
}

// ===== 文件系统 API =====

export const fsApi = {
  /**
   * 获取用户主目录
   */
  getHomeDir: async (): Promise<string> => {
    const result = await wsRequest<{ path: string }>('fs_get_home_dir');
    return result.path;
  },
  
  /**
   * 列出目录内容
   */
  listDir: async (
    path: string,
    options?: { dirsOnly?: boolean; showHidden?: boolean }
  ): Promise<FsListDirResponse> => {
    return wsRequest<FsListDirResponse>('fs_list_dir', {
      path,
      dirs_only: options?.dirsOnly ?? true,  // 默认只显示目录
      show_hidden: options?.showHidden ?? false,
    });
  },
  
  /**
   * 验证 Git 仓库路径
   */
  validateGitPath: async (path: string): Promise<FsValidateGitPathResponse> => {
    return wsRequest<FsValidateGitPathResponse>('fs_validate_git_path', { path });
  },

  /**
   * 读取文件内容
   */
  readFile: async (path: string): Promise<FsReadFileResponse> => {
    return wsRequest<FsReadFileResponse>('fs_read_file', { path });
  },

  /**
   * 写入文件内容
   */
  writeFile: async (path: string, content: string): Promise<FsWriteFileResponse> => {
    return wsRequest<FsWriteFileResponse>('fs_write_file', { path, content });
  },

  /**
   * 列出项目文件树
   */
  listProjectFiles: async (
    rootPath: string,
    options?: { showHidden?: boolean }
  ): Promise<FsListProjectFilesResponse> => {
    return wsRequest<FsListProjectFilesResponse>('fs_list_project_files', {
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
    options?: { maxResults?: number; caseSensitive?: boolean }
  ): Promise<FsSearchContentResponse> => {
    return wsRequest<FsSearchContentResponse>('fs_search_content', {
      root_path: rootPath,
      query,
      max_results: options?.maxResults ?? 50,
      case_sensitive: options?.caseSensitive ?? false,
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
    return wsRequest<AppOpenResponse>('app_open', {
      app_name: appName,
      path,
    });
  },
};

// ===== Git API =====

export const gitApi = {
  /**
   * 获取 Git 状态（未提交/未推送的更改）
   */
  getStatus: async (path: string): Promise<GitStatusResponse> => {
    return wsRequest<GitStatusResponse>('git_get_status', { path });
  },

  /**
   * 列出仓库所有分支
   */
  listBranches: async (path: string): Promise<string[]> => {
    const result = await wsRequest<{ branches: string[] }>('git_list_branches', { path });
    return result.branches;
  },

  /**
   * 重命名 Git 分支
   */
  renameBranch: async (path: string, oldName: string, newName: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('git_rename_branch', {
      path,
      old_name: oldName,
      new_name: newName,
    });
  },

  /**
   * 获取变更文件列表
   */
  getChangedFiles: async (path: string): Promise<GitChangedFilesResponse> => {
    return wsRequest<GitChangedFilesResponse>('git_changed_files', { path });
  },

  /**
   * 获取单个文件的 diff
   */
  getFileDiff: async (path: string, filePath: string): Promise<GitFileDiffResponse> => {
    return wsRequest<GitFileDiffResponse>('git_file_diff', {
      path,
      file_path: filePath,
    });
  },

  /**
   * 提交更改
   */
  commit: async (path: string, message: string): Promise<GitCommitResponse> => {
    return wsRequest<GitCommitResponse>('git_commit', {
      path,
      message,
    });
  },

  /**
   * 推送到远程
   */
  push: async (path: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('git_push', { path });
  },

  /**
   * 暂存文件
   */
  stage: async (path: string, files: string[]): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('git_stage', { path, files });
  },

  /**
   * 取消暂存
   */
  unstage: async (path: string, files: string[]): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('git_unstage', { path, files });
  },

  /**
   * 放弃工作区更改
   */
  discardUnstaged: async (path: string, files: string[]): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('git_discard_unstaged', { path, files });
  },

  /**
   * 放弃未追踪文件
   */
  discardUntracked: async (path: string, files: string[]): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('git_discard_untracked', { path, files });
  },

  /**
   * 拉取变更
   */
  pull: async (path: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('git_pull', { path });
  },

  /**
   * 获取远程变更
   */
  fetch: async (path: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('git_fetch', { path });
  },

  /**
   * 同步 (fetch + pull)
   */
  sync: async (path: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('git_sync', { path });
  },
};

// ===== Project API =====

export const wsProjectApi = {
  /**
   * 获取所有项目
   */
  list: async (): Promise<ProjectModel[]> => {
    return wsRequest<ProjectModel[]>('project_list');
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
    return wsRequest<ProjectModel>('project_create', {
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
    return wsRequest<{ success: boolean }>('project_update', {
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
    return wsRequest<{ success: boolean }>('project_delete', { guid });
  },
  
  /**
   * 验证项目路径
   */
  validatePath: async (path: string): Promise<FsValidateGitPathResponse> => {
    return wsRequest<FsValidateGitPathResponse>('project_validate_path', { path });
  },

  /**
   * 更新项目目标分支
   */
  updateTargetBranch: async (guid: string, targetBranch: string | null): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('project_update_target_branch', {
      guid,
      target_branch: targetBranch,
    });
  },

  /**
   * 更新项目排序
   */
  updateOrder: async (guid: string, sidebarOrder: number): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('project_update_order', {
      guid,
      sidebar_order: sidebarOrder,
    });
  },

  /**
   * 检查项目是否可以删除
   */
  checkCanDelete: async (guid: string): Promise<{ can_delete: boolean; active_workspace_count: number }> => {
    return wsRequest<{ can_delete: boolean; active_workspace_count: number }>('project_check_can_delete', { guid });
  },
};

// ===== Workspace API =====

export const wsWorkspaceApi = {
  /**
   * 获取项目下的所有 Workspace
   */
  listByProject: async (projectGuid: string): Promise<WorkspaceModel[]> => {
    return wsRequest<WorkspaceModel[]>('workspace_list', { project_guid: projectGuid });
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
    return wsRequest<WorkspaceModel>('workspace_create', {
      project_guid: data.projectGuid,
      name: data.name,
      branch: data.branch,
      sidebar_order: data.sidebarOrder ?? 0,
    });
  },
  
  /**
   * 更新 Workspace 名称
   */
  updateName: async (guid: string, name: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('workspace_update_name', { guid, name });
  },
  
  /**
   * 更新 Workspace 分支
   */
  updateBranch: async (guid: string, branch: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('workspace_update_branch', { guid, branch });
  },
  
  /**
   * 更新 Workspace 排序
   */
  updateOrder: async (guid: string, sidebarOrder: number): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('workspace_update_order', { guid, sidebar_order: sidebarOrder });
  },
  
  /**
   * 删除 Workspace
   */
  delete: async (guid: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('workspace_delete', { guid });
  },

  /**
   * 置顶 Workspace
   */
  pin: async (guid: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('workspace_pin', { guid });
  },

  /**
   * 取消置顶 Workspace
   */
  unpin: async (guid: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('workspace_unpin', { guid });
  },

  /**
   * 归档 Workspace
   */
  archive: async (guid: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('workspace_archive', { guid });
  },

  /**
   * 获取所有归档的 Workspace
   */
  listArchived: async (): Promise<{ workspaces: ArchivedWorkspace[] }> => {
    return wsRequest<{ workspaces: ArchivedWorkspace[] }>('workspace_list_archived', {});
  },

  /**
   * 取消归档 Workspace
   */
  unarchive: async (guid: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('workspace_unarchive', { guid });
  },
};

// ===== Script API =====

export const wsScriptApi = {
  /**
   * 获取项目脚本
   */
  get: async (projectGuid: string): Promise<Record<string, string>> => {
    return wsRequest<Record<string, string>>('script_get', { project_guid: projectGuid });
  },
  
  /**
   * 保存项目脚本
   */
  save: async (projectGuid: string, scripts: Record<string, string>): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>('script_save', { project_guid: projectGuid, scripts });
  },
};

