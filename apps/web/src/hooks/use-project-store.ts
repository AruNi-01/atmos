'use client';

import { create } from 'zustand';
import { Project, Workspace } from '@/types/types';
import { wsProjectApi, wsWorkspaceApi, ProjectModel, WorkspaceModel } from '@/api/ws-api';
import { toastManager } from '@workspace/ui';
import { useWebSocketStore } from './use-websocket';

interface ProjectStore {
  projects: Project[];
  activeWorkspaceId: string | null;
  isLoading: boolean;

  // Actions
  fetchProjects: () => Promise<void>;
  addProject: (data: { name: string; mainFilePath: string; sidebarOrder?: number; borderColor?: string }) => Promise<void>;
  updateProject: (id: string, data: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  
  addWorkspace: (data: { projectId: string; name: string; branch: string }) => Promise<void>;
  deleteWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  
  setActiveWorkspaceId: (id: string | null) => void;
}

// 转换后端 Project 模型到前端 Project 类型
function mapProjectModel(model: ProjectModel, workspaces: Workspace[] = []): Project {
  return {
    id: model.guid,
    name: model.name,
    isOpen: true,
    workspaces,
    mainFilePath: model.main_file_path,
    sidebarOrder: model.sidebar_order,
    borderColor: model.border_color ?? undefined,
  };
}

// 转换后端 Workspace 模型到前端 Workspace 类型
function mapWorkspaceModel(model: WorkspaceModel): Workspace {
  return {
    id: model.guid,
    name: model.name,
    branch: model.branch,
    isActive: false, // 由前端管理
    status: 'clean', // 默认状态，后续可以从 git 获取
    projectId: model.project_guid,
  };
}

// 等待 WebSocket 连接
async function waitForConnection(timeoutMs = 5000): Promise<void> {
  const { connectionState, connect } = useWebSocketStore.getState();
  
  if (connectionState === 'connected') {
    return;
  }
  
  // 触发连接
  if (connectionState === 'disconnected') {
    connect();
  }
  
  // 等待连接建立
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('WebSocket connection timeout'));
    }, timeoutMs);
    
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

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeWorkspaceId: null,
  isLoading: false,

  fetchProjects: async () => {
    set({ isLoading: true });
    try {
      // 确保 WebSocket 连接
      await waitForConnection();
      
      // 获取所有项目
      const projects = await wsProjectApi.list();

      // 为每个项目获取 Workspaces
      const projectsWithWorkspaces = await Promise.all(
        projects.map(async (p) => {
          try {
            const workspaces = await wsWorkspaceApi.listByProject(p.guid);
            return mapProjectModel(p, workspaces.map(mapWorkspaceModel));
          } catch (error) {
            console.warn(`Failed to fetch workspaces for project ${p.guid}:`, error);
            return mapProjectModel(p, []);
          }
        })
      );

      // 按 sidebarOrder 排序
      projectsWithWorkspaces.sort((a, b) => a.sidebarOrder - b.sidebarOrder);

      set({ projects: projectsWithWorkspaces });
    } catch (error) {
      console.error('Error fetching projects:', error);
      toastManager.add({ 
        title: 'Error', 
        description: error instanceof Error ? error.message : 'Failed to load projects', 
        type: 'error' 
      });
    } finally {
      set({ isLoading: false });
    }
  },

  addProject: async (data) => {
    try {
      await waitForConnection();
      
      const newProjectModel = await wsProjectApi.create({
        name: data.name,
        mainFilePath: data.mainFilePath,
        sidebarOrder: data.sidebarOrder ?? get().projects.length,
        borderColor: data.borderColor,
      });
      
      const newProject = mapProjectModel(newProjectModel, []);
      
      set(state => ({ projects: [...state.projects, newProject] }));
      
      toastManager.add({ 
        title: 'Success', 
        description: `Project "${newProject.name}" imported`, 
        type: 'success' 
      });
    } catch (error) {
      console.error('Error adding project:', error);
      toastManager.add({ 
        title: 'Error', 
        description: error instanceof Error ? error.message : 'Failed to import project', 
        type: 'error' 
      });
      throw error; // 重新抛出以便调用者处理
    }
  },

  updateProject: async (id, data) => {
    try {
      await waitForConnection();
      
      await wsProjectApi.update({ 
        guid: id, 
        name: data.name,
        borderColor: data.borderColor,
        sidebarOrder: data.sidebarOrder,
      });
      
      set(state => ({
        projects: state.projects.map(p => 
          p.id === id ? { ...p, ...data } : p
        )
      }));
    } catch (error) {
      console.error('Error updating project:', error);
      toastManager.add({ 
        title: 'Error', 
        description: 'Failed to update project', 
        type: 'error' 
      });
    }
  },

  deleteProject: async (id) => {
    try {
      await waitForConnection();
      
      await wsProjectApi.delete(id);
      
      set(state => ({
        projects: state.projects.filter(p => p.id !== id)
      }));
      
      toastManager.add({ 
        title: 'Deleted', 
        description: 'Project removed', 
        type: 'info' 
      });
    } catch (error) {
      console.error('Error deleting project:', error);
      toastManager.add({ 
        title: 'Error', 
        description: 'Failed to delete project', 
        type: 'error' 
      });
    }
  },

  addWorkspace: async (data) => {
    try {
      await waitForConnection();
      
      const newWorkspaceModel = await wsWorkspaceApi.create({
        projectGuid: data.projectId,
        name: data.name,
        branch: data.branch,
      });
      
      const newWorkspace = mapWorkspaceModel(newWorkspaceModel);

      set(state => ({
        projects: state.projects.map(p => 
          p.id === data.projectId 
            ? { ...p, workspaces: [...p.workspaces, newWorkspace] } 
            : p
        )
      }));
      
      toastManager.add({ 
        title: 'Success', 
        description: `Workspace "${newWorkspace.name}" created`, 
        type: 'success' 
      });
    } catch (error) {
      console.error('Error adding workspace:', error);
      toastManager.add({ 
        title: 'Error', 
        description: error instanceof Error ? error.message : 'Failed to create workspace', 
        type: 'error' 
      });
      throw error;
    }
  },

  deleteWorkspace: async (projectId, workspaceId) => {
    try {
      await waitForConnection();
      
      await wsWorkspaceApi.delete(workspaceId);
      
      set(state => ({
        projects: state.projects.map(p => 
          p.id === projectId 
            ? { ...p, workspaces: p.workspaces.filter(w => w.id !== workspaceId) } 
            : p
        )
      }));
      
      toastManager.add({ 
        title: 'Deleted', 
        description: 'Workspace removed', 
        type: 'info' 
      });
    } catch (error) {
      console.error('Error deleting workspace:', error);
      toastManager.add({ 
        title: 'Error', 
        description: 'Failed to delete workspace', 
        type: 'error' 
      });
    }
  },

  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
}));
