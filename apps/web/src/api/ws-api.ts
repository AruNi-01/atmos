'use client';

import { useWebSocketStore, WsAction } from '@/hooks/use-websocket';

// ===== 类型定义 =====

// 文件系统类型
export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
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

// Project 类型（后端返回格式）
export interface ProjectModel {
  guid: string;
  name: string;
  main_file_path: string;
  sidebar_order: number;
  border_color: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
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
};
