'use client';

import { create } from 'zustand';
import { Project, Workspace } from '@/types/types';
import { wsProjectApi, wsWorkspaceApi, ProjectModel, WorkspaceModel } from '@/api/ws-api';
import { toastManager } from '@workspace/ui';
import { useWebSocketStore } from './use-websocket';

// Sort workspaces: pinned first (by pinnedAt DESC), then by createdAt DESC
function sortWorkspaces(workspaces: Workspace[]): Workspace[] {
  return [...workspaces].sort((a, b) => {
    // Pinned items first
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    
    // Among pinned items, sort by pinnedAt DESC (most recently pinned first)
    if (a.isPinned && b.isPinned) {
      const aTime = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
      const bTime = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
      return bTime - aTime;
    }
    
    // Among non-pinned items, sort by createdAt DESC (newest first)
    const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bCreated - aCreated;
  });
}

export interface WorkspaceSetupProgress {
  workspaceId: string;
  status: 'creating' | 'setting_up' | 'completed' | 'error';
  lastStatus?: 'creating' | 'setting_up' | 'completed'; // Track previous success
  stepTitle: string;
  output: string;
  success: boolean;
  countdown?: number;
}

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
  quickAddWorkspace: (projectId: string) => Promise<string | null>;
  deleteWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  pinWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  unpinWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  archiveWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  updateWorkspaceBranch: (projectId: string, workspaceId: string, branch: string) => Promise<void>;
  
  reorderProjects: (newOrder: Project[]) => Promise<void>;
  reorderWorkspaces: (projectId: string, newOrder: Workspace[]) => Promise<void>;
  
  setActiveWorkspaceId: (id: string | null) => void;

  // Setup Progress
  setupProgress: Record<string, WorkspaceSetupProgress>;
  setSetupProgress: (progress: WorkspaceSetupProgress) => void;
  clearSetupProgress: (workspaceId: string) => void;
  retryWorkspaceSetup: (workspaceId: string) => Promise<void>;
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
    targetBranch: model.target_branch ?? undefined,
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
    isPinned: model.is_pinned,
    pinnedAt: model.pinned_at ?? undefined,
    isArchived: model.is_archived,
    archivedAt: model.archived_at ?? undefined,
    createdAt: model.created_at,
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
            const mappedWorkspaces = workspaces.map(mapWorkspaceModel);
            const sortedWorkspaces = sortWorkspaces(mappedWorkspaces);
            return mapProjectModel(p, sortedWorkspaces);
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
            ? { ...p, workspaces: sortWorkspaces([...p.workspaces, newWorkspace]) } 
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

  quickAddWorkspace: async (projectId: string) => {
    try {
      await waitForConnection();
      
      const project = get().projects.find(p => p.id === projectId);
      if (!project) {
        throw new Error('Project not found');
      }
      
      // Pass empty string to let backend generate Pokemon name
      const newWorkspaceModel = await wsWorkspaceApi.create({
        projectGuid: projectId,
        name: '',  // Backend will generate a unique Pokemon name
        branch: '', // Backend will use the generated name as branch,
      });
      
      const newWorkspace = mapWorkspaceModel(newWorkspaceModel);

      set(state => ({
        projects: state.projects.map(p => 
          p.id === projectId 
            ? { ...p, workspaces: sortWorkspaces([...p.workspaces, newWorkspace]) } 
            : p
        )
      }));
      
      toastManager.add({ 
        title: 'Quick Workspace Created', 
        description: `"${newWorkspace.name}" created`, 
        type: 'success' 
      });
      
      return newWorkspace.id;
    } catch (error) {
      console.error('Error quick adding workspace:', error);
      toastManager.add({ 
        title: 'Error', 
        description: error instanceof Error ? error.message : 'Failed to create workspace', 
        type: 'error' 
      });
      return null;
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

  pinWorkspace: async (projectId, workspaceId) => {
    try {
      await waitForConnection();
      await wsWorkspaceApi.pin(workspaceId);
      
      set(state => ({
        projects: state.projects.map(p => 
          p.id === projectId 
            ? { 
                ...p, 
                workspaces: sortWorkspaces(
                  p.workspaces.map(w => 
                    w.id === workspaceId 
                      ? { ...w, isPinned: true, pinnedAt: new Date().toISOString() } 
                      : w
                  )
                )
              } 
            : p
        )
      }));
      
      toastManager.add({ 
        title: 'Pinned', 
        description: 'Workspace pinned', 
        type: 'success' 
      });
    } catch (error) {
      console.error('Error pinning workspace:', error);
      toastManager.add({ 
        title: 'Error', 
        description: 'Failed to pin workspace', 
        type: 'error' 
      });
    }
  },

  unpinWorkspace: async (projectId, workspaceId) => {
    try {
      await waitForConnection();
      await wsWorkspaceApi.unpin(workspaceId);
      
      set(state => ({
        projects: state.projects.map(p => 
          p.id === projectId 
            ? { 
                ...p, 
                workspaces: sortWorkspaces(
                  p.workspaces.map(w => 
                    w.id === workspaceId 
                      ? { ...w, isPinned: false, pinnedAt: undefined } 
                      : w
                  )
                )
              } 
            : p
        )
      }));
      
      toastManager.add({ 
        title: 'Unpinned', 
        description: 'Workspace unpinned', 
        type: 'info' 
      });
    } catch (error) {
      console.error('Error unpinning workspace:', error);
      toastManager.add({ 
        title: 'Error', 
        description: 'Failed to unpin workspace', 
        type: 'error' 
      });
    }
  },

  archiveWorkspace: async (projectId, workspaceId) => {
    try {
      await waitForConnection();
      await wsWorkspaceApi.archive(workspaceId);
      
      set(state => ({
        projects: state.projects.map(p => 
          p.id === projectId 
            ? { ...p, workspaces: p.workspaces.filter(w => w.id !== workspaceId) } 
            : p
        )
      }));
      
      toastManager.add({ 
        title: 'Archived', 
        description: 'Workspace archived', 
        type: 'info' 
      });
    } catch (error) {
      console.error('Error archiving workspace:', error);
      toastManager.add({ 
        title: 'Error', 
        description: 'Failed to archive workspace', 
        type: 'error' 
      });
    }
  },

  updateWorkspaceBranch: async (projectId: string, workspaceId: string, branch: string) => {
    try {
      await waitForConnection();
      await wsWorkspaceApi.updateBranch(workspaceId, branch);
      
      set(state => ({
        projects: state.projects.map(p => 
          p.id === projectId 
            ? { 
                ...p, 
                workspaces: p.workspaces.map(w => 
                  w.id === workspaceId ? { ...w, branch } : w
                )
              } 
            : p
        )
      }));
    } catch (error) {
      console.error('Error updating workspace branch:', error);
      throw error;
    }
  },

  reorderProjects: async (newOrder: Project[]) => {
    try {
      await waitForConnection();
      
      // Optimistically update state
      set({ projects: newOrder });
      
      // Batch update all project orders in the backend
      await Promise.all(
        newOrder.map((project, index) => 
          wsProjectApi.updateOrder(project.id, index)
        )
      );
      
      toastManager.add({ 
        title: 'Success', 
        description: 'Project order saved', 
        type: 'success' 
      });
    } catch (error) {
      console.error('Error reordering projects:', error);
      toastManager.add({ 
        title: 'Error', 
        description: 'Failed to save project order', 
        type: 'error' 
      });
      // Revert to original order on error
      get().fetchProjects();
    }
  },

  reorderWorkspaces: async (projectId: string, newOrder: Workspace[]) => {
    try {
      await waitForConnection();
      
      // Optimistically update state
      set(state => ({
        projects: state.projects.map(p => 
          p.id === projectId ? { ...p, workspaces: newOrder } : p
        )
      }));
      
      // Batch update all workspace orders in the backend
      await Promise.all(
        newOrder.map((workspace, index) => 
          wsWorkspaceApi.updateOrder(workspace.id, index)
        )
      );
      
      toastManager.add({ 
        title: 'Success', 
        description: 'Workspace order saved', 
        type: 'success' 
      });
    } catch (error) {
      console.error('Error reordering workspaces:', error);
      toastManager.add({ 
        title: 'Error', 
        description: 'Failed to save workspace order', 
        type: 'error' 
      });
      // Revert to original order on error
      get().fetchProjects();
    }
  },

  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

  setupProgress: {},
  setSetupProgress: (progress) => set(state => {
    const existing = state.setupProgress[progress.workspaceId];
    let newStatus = progress.status;
    let lastStatus = existing?.lastStatus;

    if (progress.status === 'error') {
      lastStatus = existing?.status !== 'error' ? existing?.status : existing?.lastStatus;
    } else if (progress.status !== existing?.status) {
      // If moving to a new status that isn't error, update lastStatus to the PREVIOUS status
      if (existing?.status && existing.status !== 'error') {
        lastStatus = existing.status;
      }
    }

    return {
      setupProgress: {
        ...state.setupProgress,
        [progress.workspaceId]: {
          ...existing,
          ...progress,
          status: newStatus,
          lastStatus: lastStatus,
          output: (existing?.output || '') + (progress.output || '')
        }
      }
    };
  }),
  clearSetupProgress: (workspaceId) => set(state => {
    const newProgress = { ...state.setupProgress };
    delete newProgress[workspaceId];
    return { setupProgress: newProgress };
  }),
  retryWorkspaceSetup: async (workspaceId) => {
    try {
      await useWebSocketStore.getState().send('workspace_retry_setup', { guid: workspaceId });
    } catch (error) {
      console.error('Failed to retry setup:', error);
      toastManager.add({
        title: 'Retry Failed',
        description: 'Could not trigger setup retry',
        type: 'error'
      });
    }
  },
}));

// Listen for setup progress events
if (typeof window !== 'undefined') {
  useWebSocketStore.getState().onEvent('workspace_setup_progress', (data) => {
    useProjectStore.getState().setSetupProgress({
      workspaceId: data.workspace_id,
      status: data.status,
      stepTitle: data.step_title,
      output: data.output || '',
      success: data.success,
      countdown: data.countdown,
    });
  });
}
