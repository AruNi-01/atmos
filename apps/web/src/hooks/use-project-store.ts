'use client';

import { create } from 'zustand';
import { Project, Workspace, WorkspaceLabel, WorkspacePriority, WorkspaceWorkflowStatus } from '@/types/types';
import { wsProjectApi, wsScriptApi, wsWorkspaceApi, ProjectModel, WorkspaceModel, type WorkspaceAttachmentPayload } from '@/api/ws-api';
import { toastManager } from '@workspace/ui';
import { useWebSocketStore } from './use-websocket';

// Sort workspaces: pinned first (by pinOrder ASC), then by createdAt DESC
function sortWorkspaces(workspaces: Workspace[]): Workspace[] {
  return [...workspaces].sort((a, b) => {
    // Pinned items first
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    
    // Among pinned items, sort by persisted pin order first.
    if (a.isPinned && b.isPinned) {
      const aOrder = a.pinOrder;
      const bOrder = b.pinOrder;
      if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      if (aOrder !== undefined && bOrder === undefined) return -1;
      if (aOrder === undefined && bOrder !== undefined) return 1;

      const aTime = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
      const bTime = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.id.localeCompare(b.id);
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
  stepKey?:
    | 'create_worktree'
    | 'write_requirement'
    | 'extract_todos'
    | 'run_setup_script'
    | 'ready';
  lastStepKey?:
    | 'create_worktree'
    | 'write_requirement'
    | 'extract_todos'
    | 'run_setup_script'
    | 'ready';
  failedStepKey?:
    | 'create_worktree'
    | 'write_requirement'
    | 'extract_todos'
    | 'run_setup_script'
    | 'ready';
  stepTitle: string;
  output: string;
  replaceOutput?: boolean;
  requiresConfirmation?: boolean;
  success: boolean;
  countdown?: number;
  setupContext?: {
    hasGithubIssue: boolean;
    hasRequirementStep: boolean;
    autoExtractTodos: boolean;
    hasSetupScript: boolean;
  };
  retryContext?: {
    initialRequirement?: string | null;
    githubIssue?: WorkspaceModel['github_issue'];
    autoExtractTodos: boolean;
  };
}

interface WorkspaceSetupContextPayload {
  has_github_issue: boolean;
  has_requirement_step: boolean;
  auto_extract_todos: boolean;
  has_setup_script: boolean;
}

interface WorkspaceSetupProgressEventPayload {
  workspace_id: string;
  status: WorkspaceSetupProgress['status'];
  step_key?: WorkspaceSetupProgress['stepKey'];
  failed_step_key?: WorkspaceSetupProgress['failedStepKey'];
  step_title: string;
  output?: string;
  replace_output?: boolean;
  requires_confirmation?: boolean;
  success: boolean;
  countdown?: number;
  setup_context?: WorkspaceSetupContextPayload | null;
}

const SETUP_STEP_ORDER: Record<
  NonNullable<WorkspaceSetupProgress["stepKey"]>,
  number
> = {
  create_worktree: 0,
  write_requirement: 1,
  extract_todos: 2,
  run_setup_script: 3,
  ready: 4,
};

function getSetupStepOrder(
  stepKey: WorkspaceSetupProgress["stepKey"] | WorkspaceSetupProgress["lastStepKey"],
): number {
  if (!stepKey) return -1;
  return SETUP_STEP_ORDER[stepKey] ?? -1;
}

function getInitialAsyncSetupState(input: {
  hasGithubIssue: boolean;
  hasRequirementStep: boolean;
  autoExtractTodos: boolean;
  hasSetupScript: boolean;
}): Pick<WorkspaceSetupProgress, 'status' | 'stepKey' | 'stepTitle' | 'success'> {
  if (input.hasGithubIssue || input.hasRequirementStep) {
    return {
      status: 'creating',
      stepKey: 'write_requirement',
      stepTitle: input.hasGithubIssue
        ? 'Filling Requirement Specification'
        : 'Writing Requirement Specification',
      success: true,
    };
  }

  if (input.autoExtractTodos) {
    return {
      status: 'creating',
      stepKey: 'extract_todos',
      stepTitle: 'Extracting Initial TODOs',
      success: true,
    };
  }

  if (input.hasSetupScript) {
    return {
      status: 'setting_up',
      stepKey: 'run_setup_script',
      stepTitle: 'Running Setup Script',
      success: true,
    };
  }

  return {
    status: 'completed',
    stepKey: 'ready',
    stepTitle: 'Ready to Build',
    success: true,
  };
}

function buildInitialWorkspaceSetupProgress(input: {
  workspaceId: string;
  setupContext: WorkspaceSetupProgress['setupContext'];
  retryContext: WorkspaceSetupProgress['retryContext'];
}): WorkspaceSetupProgress {
  return {
    workspaceId: input.workspaceId,
    ...getInitialAsyncSetupState({
      hasGithubIssue: !!input.setupContext?.hasGithubIssue,
      hasRequirementStep: !!input.setupContext?.hasRequirementStep,
      autoExtractTodos: !!input.setupContext?.autoExtractTodos,
      hasSetupScript: !!input.setupContext?.hasSetupScript,
    }),
    output: '',
    setupContext: input.setupContext,
    retryContext: input.retryContext,
  };
}


function isWorkspaceSetupProgressEventPayload(
  data: unknown,
): data is WorkspaceSetupProgressEventPayload {
  if (!data || typeof data !== 'object') return false;

  const payload = data as Record<string, unknown>;
  const validStatus = ['creating', 'setting_up', 'completed', 'error'];
  const validStepKeys = [
    'create_worktree',
    'write_requirement',
    'extract_todos',
    'run_setup_script',
    'ready',
  ];

  return (
    typeof payload.workspace_id === 'string' &&
    typeof payload.step_title === 'string' &&
    typeof payload.success === 'boolean' &&
    typeof payload.status === 'string' &&
    (payload.replace_output == null || typeof payload.replace_output === 'boolean') &&
    (payload.requires_confirmation == null ||
      typeof payload.requires_confirmation === 'boolean') &&
    (payload.setup_context == null ||
      (typeof payload.setup_context === 'object' &&
        typeof (payload.setup_context as Record<string, unknown>).has_github_issue === 'boolean' &&
        typeof (payload.setup_context as Record<string, unknown>).has_requirement_step === 'boolean' &&
        typeof (payload.setup_context as Record<string, unknown>).auto_extract_todos === 'boolean' &&
        typeof (payload.setup_context as Record<string, unknown>).has_setup_script === 'boolean')) &&
    (payload.step_key == null ||
      (typeof payload.step_key === 'string' && validStepKeys.includes(payload.step_key))) &&
    (payload.failed_step_key == null ||
      (typeof payload.failed_step_key === 'string' && validStepKeys.includes(payload.failed_step_key))) &&
    validStatus.includes(payload.status)
  );
}

interface ProjectStore {
  projects: Project[];
  workspaceLabels: WorkspaceLabel[];
  activeWorkspaceId: string | null;
  isLoading: boolean;

  // Actions
  fetchProjects: () => Promise<void>;
  addProject: (data: { name: string; mainFilePath: string; sidebarOrder?: number; borderColor?: string }) => Promise<void>;
  updateProject: (id: string, data: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  
  addWorkspace: (data: {
    projectId: string;
    name: string;
    displayName?: string | null;
    branch: string;
    baseBranch?: string | null;
    initialRequirement?: string | null;
    githubIssue?: WorkspaceModel['github_issue'];
    githubPr?: WorkspaceModel['github_pr'];
    autoExtractTodos?: boolean;
    hasSetupScript?: boolean;
    priority?: WorkspacePriority;
    workflowStatus?: WorkspaceWorkflowStatus;
    labels?: WorkspaceLabel[];
    attachments?: WorkspaceAttachmentPayload[];
  }) => Promise<string>;
  quickAddWorkspace: (projectId: string) => Promise<string | null>;
  deleteWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  pinWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  unpinWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  archiveWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  updateWorkspaceName: (projectId: string, workspaceId: string, name: string) => Promise<void>;
  updateWorkspaceBranch: (projectId: string, workspaceId: string, branch: string) => Promise<void>;
  updateWorkspaceWorkflowStatus: (
    projectId: string,
    workspaceId: string,
    workflowStatus: WorkspaceWorkflowStatus,
  ) => Promise<void>;
  updateWorkspacePriority: (
    projectId: string,
    workspaceId: string,
    priority: WorkspacePriority,
  ) => Promise<void>;
  fetchWorkspaceLabels: () => Promise<void>;
  createWorkspaceLabel: (data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  updateWorkspaceLabel: (
    labelId: string,
    data: { name: string; color: string },
  ) => Promise<WorkspaceLabel>;
  updateWorkspaceLabels: (
    projectId: string,
    workspaceId: string,
    labels: WorkspaceLabel[],
  ) => Promise<void>;
  markWorkspaceVisited: (workspaceId: string) => Promise<void>;
  
  updateWorkspacePinOrder: (orderedWorkspaceIds: string[]) => Promise<void>;
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
    displayName: model.display_name ?? undefined,
    branch: model.branch,
    baseBranch: model.base_branch,
    isActive: false, // 由前端管理
    status: 'clean', // 默认状态，后续可以从 git 获取
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
    labels: (model.labels ?? []).map(label => ({
      id: label.guid,
      name: label.name,
      color: label.color,
    })),
    localPath: model.local_path,
    githubIssue: model.github_issue,
    githubPr: model.github_pr,
  };
}

// 等待 WebSocket 连接
// Track delete progress toast IDs by workspace ID
const deleteProgressToasts = new Map<string, { toastId: string; workspaceName: string }>();

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
  workspaceLabels: [],
  activeWorkspaceId: null,
  isLoading: false,

  fetchProjects: async () => {
    set({ isLoading: true });
    try {
      // 确保 WebSocket 连接
      await waitForConnection();
      
      // 获取所有项目；标签失败不应阻断侧边栏主数据加载。
      const [projects, labels] = await Promise.all([
        wsProjectApi.list(),
        wsWorkspaceApi.listLabels().catch((error) => {
          console.warn('Failed to fetch workspace labels:', error);
          return [];
        }),
      ]);
      set({
        workspaceLabels: labels.map(label => ({
          id: label.guid,
          name: label.name,
          color: label.color,
        })),
      });

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
        displayName: data.displayName,
        branch: data.branch,
        baseBranch: data.baseBranch,
        initialRequirement: data.initialRequirement,
        githubIssue: data.githubIssue,
        githubPr: data.githubPr,
        autoExtractTodos: data.autoExtractTodos,
        priority: data.priority,
        workflowStatus: data.workflowStatus,
        labelGuids: data.labels?.map(label => label.id),
        attachments: data.attachments,
      });
      
      const newWorkspace = mapWorkspaceModel(newWorkspaceModel);
      const setupContext = {
        hasGithubIssue: !!data.githubIssue || !!data.githubPr,
        hasRequirementStep:
          !!data.githubIssue || !!data.githubPr || !!data.initialRequirement?.trim(),
        autoExtractTodos: !!data.autoExtractTodos,
        hasSetupScript: !!data.hasSetupScript,
      };
      const retryContext = {
        initialRequirement: data.initialRequirement ?? null,
        githubIssue: data.githubIssue,
        autoExtractTodos: !!data.autoExtractTodos,
      };

      set(state => ({
        setupProgress: {
          ...state.setupProgress,
          [newWorkspace.id]: state.setupProgress[newWorkspace.id]
            ? {
                ...state.setupProgress[newWorkspace.id],
                setupContext,
                retryContext:
                  state.setupProgress[newWorkspace.id].retryContext ?? retryContext,
              }
            : buildInitialWorkspaceSetupProgress({
                workspaceId: newWorkspace.id,
                setupContext,
                retryContext,
              })
        },
        projects: state.projects.map(p => 
          p.id === data.projectId 
            ? {
                ...p,
                targetBranch: p.targetBranch || newWorkspace.baseBranch,
                workspaces: sortWorkspaces([...p.workspaces, newWorkspace]),
              }
            : p
        )
      }));
      
      toastManager.add({ 
        title: 'Workspace setup started', 
        description: `Opening "${newWorkspace.displayName || newWorkspace.name}"`, 
        type: 'info' 
      });
      return newWorkspace.id;
    } catch (error) {
      console.error('Error adding workspace:', error);
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

      let hasSetupScript = false;
      try {
        const scripts = await wsScriptApi.get(projectId);
        hasSetupScript = typeof scripts.setup === 'string' && scripts.setup.trim().length > 0;
      } catch {
        hasSetupScript = false;
      }
      
      // Pass empty string to let backend generate Pokemon name
      const newWorkspaceModel = await wsWorkspaceApi.create({
        projectGuid: projectId,
        name: '',  // Backend will generate a unique Pokemon name
        branch: '', // Backend will use the generated name as branch,
        priority: 'no_priority',
        workflowStatus: 'in_progress',
        labelGuids: [],
      });
      
      const newWorkspace = mapWorkspaceModel(newWorkspaceModel);
      const setupContext = {
        hasGithubIssue: false,
        hasRequirementStep: false,
        autoExtractTodos: false,
        hasSetupScript,
      };
      const retryContext = {
        initialRequirement: null,
        githubIssue: undefined,
        autoExtractTodos: false,
      };

      set(state => ({
        setupProgress: {
          ...state.setupProgress,
          [newWorkspace.id]: state.setupProgress[newWorkspace.id]
            ? {
                ...state.setupProgress[newWorkspace.id],
                setupContext,
                retryContext:
                  state.setupProgress[newWorkspace.id].retryContext ?? retryContext,
              }
            : buildInitialWorkspaceSetupProgress({
                workspaceId: newWorkspace.id,
                setupContext,
                retryContext,
              })
        },
        projects: state.projects.map(p => 
          p.id === projectId 
            ? { ...p, workspaces: sortWorkspaces([...p.workspaces, newWorkspace]) } 
            : p
        )
      }));
      
      toastManager.add({ 
        title: 'Workspace setup started', 
        description: `Opening "${newWorkspace.displayName || newWorkspace.name}"`, 
        type: 'info' 
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
    const previousState = get();
    const workspaceBeingDeleted = previousState.projects
      .find((project) => project.id === projectId)
      ?.workspaces.find((workspace) => workspace.id === workspaceId);

    set((state) => {
      const nextSetupProgress = { ...state.setupProgress };
      delete nextSetupProgress[workspaceId];

      return {
        activeWorkspaceId:
          state.activeWorkspaceId === workspaceId ? null : state.activeWorkspaceId,
        setupProgress: nextSetupProgress,
        projects: state.projects.map((project) =>
          project.id === projectId
            ? {
                ...project,
                workspaces: project.workspaces.filter(
                  (workspace) => workspace.id !== workspaceId,
                ),
              }
            : project,
        ),
      };
    });

    const workspaceName = workspaceBeingDeleted?.displayName || workspaceBeingDeleted?.name || 'Untitled';
    const toastId = String(toastManager.add({
      title: 'Deleting workspace',
      description: `"${workspaceName}" — cleaning up files...`,
      type: 'loading',
      timeout: 0,
    }));

    // Store toast id so the WS event handler can update it
    deleteProgressToasts.set(workspaceId, { toastId, workspaceName });

    try {
      await waitForConnection();
      await wsWorkspaceApi.delete(workspaceId);

      // Safety timeout: if no WS progress event arrives within 30s, resolve the toast
      // Use 'info' instead of 'success' since we don't know the actual cleanup outcome
      setTimeout(() => {
        if (deleteProgressToasts.has(workspaceId)) {
          deleteProgressToasts.delete(workspaceId);
          toastManager.update(toastId, {
            title: 'Deleted',
            description: `Workspace "${workspaceName}" removed (cleanup may still be running)`,
            type: 'info',
            timeout: 5000,
          });
        }
      }, 30_000);
    } catch (error) {
      deleteProgressToasts.delete(workspaceId);
      toastManager.update(toastId, {
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete workspace',
        type: 'error',
        timeout: 5000,
      });
      set({
        projects: previousState.projects,
        activeWorkspaceId: previousState.activeWorkspaceId,
        setupProgress: previousState.setupProgress,
      });
      console.error('Error deleting workspace:', error);
      throw error;
    }
  },

  pinWorkspace: async (projectId, workspaceId) => {
    try {
      await waitForConnection();
      await wsWorkspaceApi.pin(workspaceId);
      
      set(state => ({
        projects: state.projects.map(p =>
          ({
            ...p,
            workspaces: sortWorkspaces(
              p.workspaces.map(w => {
                if (w.id === workspaceId) {
                  return { ...w, isPinned: true, pinnedAt: new Date().toISOString(), pinOrder: 0 };
                }
                if (w.isPinned && w.pinOrder !== undefined) {
                  return { ...w, pinOrder: w.pinOrder + 1 };
                }
                return w;
              })
            )
          })
        )
      }));
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
                      ? { ...w, isPinned: false, pinnedAt: undefined, pinOrder: undefined }
                      : w
                  )
                )
              } 
            : p
        )
      }));
    } catch (error) {
      console.error('Error unpinning workspace:', error);
      toastManager.add({ 
        title: 'Error', 
        description: 'Failed to unpin workspace', 
        type: 'error' 
      });
    }
  },

  updateWorkspacePinOrder: async (orderedWorkspaceIds) => {
    const orderById = new Map(orderedWorkspaceIds.map((id, index) => [id, index]));

    // Optimistic update first
    set(state => ({
      projects: state.projects.map(p =>
        ({
          ...p,
          workspaces: sortWorkspaces(
            p.workspaces.map(w => {
              const pinOrder = orderById.get(w.id);
              return pinOrder === undefined ? w : { ...w, pinOrder };
            })
          )
        })
      )
    }));

    try {
      await waitForConnection();
      await wsWorkspaceApi.updatePinOrder(orderedWorkspaceIds);
    } catch (error) {
      console.error('Error updating pinned order:', error);
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

  updateWorkspaceName: async (projectId: string, workspaceId: string, name: string) => {
    try {
      await waitForConnection();
      await wsWorkspaceApi.updateName(workspaceId, name);

      set(state => ({
        projects: state.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                workspaces: p.workspaces.map(w =>
                  w.id === workspaceId ? { ...w, displayName: name } : w
                ),
              }
            : p
        )
      }));
    } catch (error) {
      console.error('Error updating workspace name:', error);
      toastManager.add({
        title: 'Error',
        description: 'Failed to update workspace name',
        type: 'error'
      });
      throw error;
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

  updateWorkspaceWorkflowStatus: async (
    projectId: string,
    workspaceId: string,
    workflowStatus: WorkspaceWorkflowStatus,
  ) => {
    try {
      await waitForConnection();
      await wsWorkspaceApi.updateWorkflowStatus(workspaceId, workflowStatus);

      set(state => ({
        projects: state.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                workspaces: p.workspaces.map(w =>
                  w.id === workspaceId ? { ...w, workflowStatus } : w
                ),
              }
            : p
        )
      }));
    } catch (error) {
      console.error('Error updating workspace workflow status:', error);
      toastManager.add({
        title: 'Error',
        description: 'Failed to update workspace status',
        type: 'error'
      });
    }
  },

  updateWorkspacePriority: async (
    projectId: string,
    workspaceId: string,
    priority: WorkspacePriority,
  ) => {
    try {
      await waitForConnection();
      await wsWorkspaceApi.updatePriority(workspaceId, priority);

      set(state => ({
        projects: state.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                workspaces: p.workspaces.map(w =>
                  w.id === workspaceId ? { ...w, priority } : w
                ),
              }
            : p
        )
      }));
    } catch (error) {
      console.error('Error updating workspace priority:', error);
      toastManager.add({
        title: 'Error',
        description: 'Failed to update workspace priority',
        type: 'error'
      });
      throw error;
    }
  },

  fetchWorkspaceLabels: async () => {
    await waitForConnection();
    const labels = await wsWorkspaceApi.listLabels();
    set({
      workspaceLabels: labels.map(label => ({
        id: label.guid,
        name: label.name,
        color: label.color,
      })),
    });
  },

  createWorkspaceLabel: async ({ name, color }) => {
    await waitForConnection();
    const label = await wsWorkspaceApi.createLabel({ name, color });
    const mappedLabel = { id: label.guid, name: label.name, color: label.color };
    set(state => ({
      workspaceLabels: [
        ...state.workspaceLabels.filter(existing => existing.id !== mappedLabel.id),
        mappedLabel,
      ].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return mappedLabel;
  },

  updateWorkspaceLabel: async (labelId, { name, color }) => {
    await waitForConnection();
    const label = await wsWorkspaceApi.updateLabel(labelId, { name, color });
    const mappedLabel = { id: label.guid, name: label.name, color: label.color };
    set(state => ({
      workspaceLabels: state.workspaceLabels
        .map(existing => existing.id === mappedLabel.id ? mappedLabel : existing)
        .sort((a, b) => a.name.localeCompare(b.name)),
      projects: state.projects.map(project => ({
        ...project,
        workspaces: project.workspaces.map(workspace => ({
          ...workspace,
          labels: workspace.labels.map(existing =>
            existing.id === mappedLabel.id ? mappedLabel : existing
          ),
        })),
      })),
    }));
    return mappedLabel;
  },

  updateWorkspaceLabels: async (
    projectId: string,
    workspaceId: string,
    labels: WorkspaceLabel[],
  ) => {
    try {
      await waitForConnection();
      await wsWorkspaceApi.updateLabels(workspaceId, labels.map(label => label.id));

      set(state => ({
        projects: state.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                workspaces: p.workspaces.map(w =>
                  w.id === workspaceId ? { ...w, labels } : w
                ),
              }
            : p
        )
      }));
    } catch (error) {
      console.error('Error updating workspace labels:', error);
      toastManager.add({
        title: 'Error',
        description: 'Failed to update workspace labels',
        type: 'error'
      });
      throw error;
    }
  },

  markWorkspaceVisited: async (workspaceId: string) => {
    try {
      await waitForConnection();
      await wsWorkspaceApi.markVisited(workspaceId);
      const visitedAt = new Date().toISOString();
      set(state => ({
        projects: state.projects.map(project => ({
          ...project,
          workspaces: project.workspaces.map(workspace =>
            workspace.id === workspaceId
              ? { ...workspace, lastVisitedAt: visitedAt }
              : workspace
          ),
        })),
      }));
    } catch (error) {
      console.error('Error marking workspace visited:', error);
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
    const newStatus = progress.status;
    const existingStepOrder = getSetupStepOrder(existing?.stepKey);
    const incomingStepOrder = getSetupStepOrder(progress.stepKey);
    const shouldIgnoreCompletedRegression =
      !!existing &&
      existing.status === 'completed' &&
      newStatus !== 'completed';
    const shouldIgnoreRegression =
      !shouldIgnoreCompletedRegression &&
      !!existing &&
      existing.status !== 'error' &&
      existing.status !== 'completed' &&
      newStatus !== 'error' &&
      newStatus !== 'completed' &&
      incomingStepOrder >= 0 &&
      existingStepOrder > incomingStepOrder;
    const shouldIgnoreIncomingState =
      shouldIgnoreCompletedRegression || shouldIgnoreRegression;
    let lastStatus = existing?.lastStatus;
    let lastStepKey = existing?.lastStepKey;

    if (shouldIgnoreIncomingState) {
      lastStatus = existing?.lastStatus;
      lastStepKey = existing?.lastStepKey;
    } else if (progress.status === 'error') {
      lastStatus = existing?.status !== 'error' ? existing?.status : existing?.lastStatus;
      lastStepKey = progress.stepKey ?? existing?.stepKey ?? existing?.lastStepKey;
    } else if (progress.status === 'completed') {
      lastStatus = existing?.status !== 'error' ? existing?.status : existing?.lastStatus;
      lastStepKey = progress.stepKey ?? existing?.stepKey ?? existing?.lastStepKey;
    } else if (progress.status !== existing?.status) {
      // If moving to a new status that isn't error, update lastStatus to the PREVIOUS status
      if (existing?.status && existing.status !== 'error') {
        lastStatus = existing.status;
      }
      if (existing?.stepKey) {
        lastStepKey = existing.stepKey;
      }
    }

    return {
      setupProgress: {
        ...state.setupProgress,
        [progress.workspaceId]: {
          ...existing,
          ...progress,
          status: shouldIgnoreIncomingState ? existing?.status ?? newStatus : newStatus,
          stepKey: shouldIgnoreIncomingState ? existing?.stepKey : progress.stepKey,
          stepTitle: shouldIgnoreIncomingState
            ? existing?.stepTitle ?? progress.stepTitle
            : progress.stepTitle,
          lastStatus: lastStatus,
          lastStepKey,
          failedStepKey:
            progress.status === 'error'
              ? progress.failedStepKey ?? progress.stepKey ?? existing?.failedStepKey
              : progress.status === 'completed'
                ? undefined
                : existing?.failedStepKey,
          setupContext: progress.setupContext ?? existing?.setupContext,
          retryContext: progress.retryContext ?? existing?.retryContext,
          output: shouldIgnoreIncomingState
              ? (existing?.output || '')
              : progress.output !== undefined &&
                (progress.replaceOutput ||
                  progress.stepKey !== existing?.stepKey ||
                  progress.status !== existing?.status)
                ? progress.output
                : (existing?.output || '') + (progress.output || '')
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
      const progress = get().setupProgress[workspaceId];
      const retryStep = progress?.failedStepKey ?? progress?.stepKey ?? 'create_worktree';

      await useWebSocketStore.getState().send('workspace_retry_setup', {
        guid: workspaceId,
        failed_step_key: retryStep,
        initial_requirement: progress?.retryContext?.initialRequirement ?? null,
        github_issue: progress?.retryContext?.githubIssue ?? null,
        auto_extract_todos: progress?.retryContext?.autoExtractTodos ?? false,
      });
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

/**
 * Subscribe to workspace_setup_progress events.
 * Must be called inside a React effect so the returned unsubscribe
 * function can be invoked on cleanup to prevent memory leaks.
 */
export function subscribeToWorkspaceSetupProgress(): () => void {
  return useWebSocketStore.getState().onEvent('workspace_setup_progress', (data: unknown) => {
    if (!isWorkspaceSetupProgressEventPayload(data)) return;
    useProjectStore.getState().setSetupProgress({
      workspaceId: data.workspace_id,
      status: data.status,
      stepKey: data.step_key,
      failedStepKey: data.failed_step_key,
      stepTitle: data.step_title,
      output: data.output || '',
      replaceOutput: data.replace_output,
      requiresConfirmation: data.requires_confirmation,
      success: data.success,
      countdown: data.countdown,
      setupContext: data.setup_context
        ? {
            hasGithubIssue: data.setup_context.has_github_issue,
            hasRequirementStep: data.setup_context.has_requirement_step,
            autoExtractTodos: data.setup_context.auto_extract_todos,
            hasSetupScript: data.setup_context.has_setup_script,
          }
        : undefined,
    });
  });
}

interface WorkspaceDeleteProgressPayload {
  workspace_id: string;
  step: string;
  message: string;
  success: boolean;
}

function isWorkspaceDeleteProgressPayload(data: unknown): data is WorkspaceDeleteProgressPayload {
  return (
    typeof data === 'object' &&
    data !== null &&
    'workspace_id' in data &&
    'step' in data &&
    'message' in data
  );
}

/**
 * Subscribe to workspace_delete_progress events.
 * Updates the loading toast with step-by-step cleanup progress.
 */
export function subscribeToWorkspaceDeleteProgress(): () => void {
  return useWebSocketStore.getState().onEvent('workspace_delete_progress', (data: unknown) => {
    if (!isWorkspaceDeleteProgressPayload(data)) return;

    const entry = deleteProgressToasts.get(data.workspace_id);
    if (!entry) return;

    const { toastId, workspaceName } = entry;

    if (data.step === 'completed') {
      toastManager.update(toastId, {
        title: 'Deleted',
        description: `Workspace "${workspaceName}" removed`,
        type: 'success',
        timeout: 3000,
      });
      deleteProgressToasts.delete(data.workspace_id);
    } else if (data.step === 'error') {
      toastManager.update(toastId, {
        title: 'Cleanup warning',
        description: `"${workspaceName}" deleted but cleanup failed: ${data.message}`,
        type: 'warning',
        timeout: 5000,
      });
      deleteProgressToasts.delete(data.workspace_id);
    } else {
      toastManager.update(toastId, {
        title: 'Deleting workspace',
        description: `"${workspaceName}" — ${data.message}`,
        type: 'loading',
      });
    }
  });
}
