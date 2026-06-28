'use client';

import { createTranslator } from 'next-intl';
import { create } from 'zustand';
import { WorkspacePriority, WorkspaceWorkflowStatus } from '@/shared/types/domain';
import { wsProjectApi, wsScriptApi, wsWorkspaceApi } from '@/api/ws-api';
import { currentAppLocale } from '@/shared/lib/current-app-locale';
import { toastManager } from '@workspace/ui';
import enMessages from '../../../../messages/en.json';
import zhMessages from '../../../../messages/zh.json';
import { waitForConnection } from './project-store-connection';
import { createProjectStoreLabelActions } from './project-store-label-actions';
import { mapProjectModel, mapWorkspaceModel, sortWorkspaces } from './project-store-mappers';
import {
  createProjectStorePinOrderActions,
  createProjectStoreReorderActions,
} from './project-store-order-actions';
import { createProjectStoreSetupActions } from './project-store-setup-actions';
import { buildInitialWorkspaceSetupProgress } from './project-store-setup-progress';
import {
  clearWorkspaceDeleteProgressToast,
  hasWorkspaceDeleteProgressToast,
  registerWorkspaceDeleteProgressToast,
  subscribeToWorkspaceDeleteProgressEvent,
  subscribeToWorkspaceGitignoreSyncFailedEvent,
  subscribeToWorkspaceSetupProgressEvent,
} from './project-store-subscriptions';
import type { ProjectStore } from './project-store-types';

export type { WorkspaceSetupProgress } from './project-store-setup-progress';

const WORKSPACE_VISIBLE_ATTEMPTS = 5;
const WORKSPACE_VISIBLE_IDLE_ATTEMPTS = 40;
const WORKSPACE_VISIBLE_IDLE_DELAY_MS = 50;
const WORKSPACE_VISIBLE_RETRY_DELAY_MS = 100;
let cachedRuntimeLocale: 'en' | 'zh' | null = null;
let cachedRuntimeTranslator: ReturnType<typeof createTranslator> | null = null;

function runtimeT(
  key: string,
  values?: Record<string, string | number>,
): string {
  const locale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedRuntimeTranslator || cachedRuntimeLocale !== locale) {
    cachedRuntimeLocale = locale;
    cachedRuntimeTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'project.runtime',
    });
  }
  return cachedRuntimeTranslator(key as never, values as never);
}

function runtimeErrorDescription(error: unknown, fallbackKey: string): string {
  if (!(error instanceof Error)) {
    return runtimeT(fallbackKey);
  }

  const message = error.message.trim();
  if (!message) {
    return runtimeT(fallbackKey);
  }

  return /^[\x00-\x7F]*$/.test(message) ? runtimeT(fallbackKey) : message;
}

const sleep = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

const hasWorkspace = (projects: ProjectStore['projects'], workspaceId: string) =>
  projects.some((project) =>
    project.workspaces.some((workspace) => workspace.id === workspaceId),
  );

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  workspaceLabels: [],
  activeWorkspaceId: null,
  isLoading: false,
  connectionEpoch: 0,

  fetchProjects: async () => {
    if (get().isLoading) return;
    const epoch = get().connectionEpoch;
    set({ isLoading: true });
    try {
      // 确保 WebSocket 连接
      await waitForConnection();
      
      const bootstrap = await wsProjectApi.bootstrap();
      if (get().connectionEpoch !== epoch) {
        return;
      }
      set({
        workspaceLabels: bootstrap.workspace_labels.map(label => ({
          id: label.guid,
          name: label.name,
          color: label.color,
          source: (label.source as 'manual' | 'gitHub_issue' | 'gitHub_pr') || 'manual',
          createdAt: label.created_at,
        })),
      });

      const projectsWithWorkspaces = bootstrap.projects.map((p) => {
        const workspaces = bootstrap.workspaces_by_project[p.guid] ?? [];
        const mappedWorkspaces = workspaces.map(mapWorkspaceModel);
        const sortedWorkspaces = sortWorkspaces(mappedWorkspaces);
        return mapProjectModel(p, sortedWorkspaces);
      });

      // 按 sidebarOrder 排序
      projectsWithWorkspaces.sort((a, b) => a.sidebarOrder - b.sidebarOrder);
      if (get().connectionEpoch !== epoch) {
        return;
      }

      set({ projects: projectsWithWorkspaces });
    } catch (error) {
      if (get().connectionEpoch !== epoch) {
        return;
      }
      console.error('Error fetching projects:', error);
      toastManager.add({ 
        title: runtimeT('common.error'),
        description: runtimeErrorDescription(error, 'store.errors.failedToLoadProjects'),
        type: 'error' 
      });
    } finally {
      if (get().connectionEpoch === epoch) {
        set({ isLoading: false });
      }
    }
  },

  ensureWorkspaceVisible: async (workspaceId) => {
    const waitForIdle = async () => {
      for (
        let attempt = 0;
        attempt < WORKSPACE_VISIBLE_IDLE_ATTEMPTS && get().isLoading;
        attempt += 1
      ) {
        await sleep(WORKSPACE_VISIBLE_IDLE_DELAY_MS);
      }
    };

    for (let attempt = 0; attempt < WORKSPACE_VISIBLE_ATTEMPTS; attempt += 1) {
      await waitForIdle();
      if (hasWorkspace(get().projects, workspaceId)) {
        return true;
      }

      await get().fetchProjects();
      if (hasWorkspace(get().projects, workspaceId)) {
        return true;
      }

      if (attempt < WORKSPACE_VISIBLE_ATTEMPTS - 1) {
        await sleep(WORKSPACE_VISIBLE_RETRY_DELAY_MS);
      }
    }

    return hasWorkspace(get().projects, workspaceId);
  },

  resetForConnectionChange: () => {
    set(state => ({
      projects: [],
      workspaceLabels: [],
      activeWorkspaceId: null,
      isLoading: false,
      setupProgress: {},
      connectionEpoch: state.connectionEpoch + 1,
    }));
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
        title: runtimeT('common.error'),
        description: runtimeErrorDescription(error, 'store.errors.failedToImportProject'),
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
        logoPath: data.logoPath,
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
        title: runtimeT('common.error'),
        description: runtimeT('store.errors.failedToUpdateProject'),
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
        title: runtimeT('common.deleted'),
        description: runtimeT('store.messages.projectRemoved'),
        type: 'info' 
      });
    } catch (error) {
      console.error('Error deleting project:', error);
      toastManager.add({ 
        title: runtimeT('common.error'),
        description: runtimeT('store.errors.failedToDeleteProject'),
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
        hasGithubIssue: !!data.githubIssue && !data.githubPr,
        hasGithubPr: !!data.githubPr,
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
        title: runtimeT('store.messages.workspaceSetupStartedTitle'),
        description: runtimeT('store.messages.openingWorkspace', {
          name: newWorkspace.displayName || newWorkspace.name,
        }),
        type: 'info' 
      });
      return newWorkspace.id;
    } catch (error) {
      console.error('Error adding workspace:', error);
      throw error;
    }
  },

  addWorkspacesToProject: async (projectId: string, workspaceGuids: string[]) => {
    try {
      const mappedWorkspaces = await wsWorkspaceApi.listProjectWorkspacesFiltered(projectId, workspaceGuids);

      set(state => {
        const project = state.projects.find(p => p.id === projectId);
        if (!project) {
          return state;
        }

        // Deduplicate by id using latest state
        const existingIds = new Set(project.workspaces.map(w => w.id));
        const uniqueNewWorkspaces = mappedWorkspaces.filter(w => !existingIds.has(w.id));

        return {
          projects: state.projects.map(p =>
            p.id === projectId
              ? {
                  ...p,
                  workspaces: sortWorkspaces([...p.workspaces, ...uniqueNewWorkspaces]),
                }
              : p
          )
        };
      });
    } catch (error) {
      console.error('Error adding workspaces to project:', error);
      throw error;
    }
  },

  quickAddWorkspace: async (projectId: string) => {
    try {
      await waitForConnection();
      
      const project = get().projects.find(p => p.id === projectId);
      if (!project) {
        throw new Error(runtimeT('store.errors.projectNotFound'));
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
        hasGithubPr: false,
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
        title: runtimeT('store.messages.workspaceSetupStartedTitle'),
        description: runtimeT('store.messages.openingWorkspace', {
          name: newWorkspace.displayName || newWorkspace.name,
        }),
        type: 'info' 
      });
      
      return newWorkspace.id;
    } catch (error) {
      console.error('Error quick adding workspace:', error);
      toastManager.add({ 
        title: runtimeT('common.error'),
        description: runtimeErrorDescription(error, 'store.errors.failedToCreateWorkspace'),
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

    const workspaceName =
      workspaceBeingDeleted?.displayName ||
      workspaceBeingDeleted?.name ||
      runtimeT('common.untitled');

    // Store workspace name so the WS event handler can show a toast when deletion completes
    registerWorkspaceDeleteProgressToast(workspaceId, workspaceName);

    try {
      await waitForConnection();
      await wsWorkspaceApi.delete(workspaceId);

      // Safety timeout: if no WS progress event arrives within 30s, show a toast
      setTimeout(() => {
        if (hasWorkspaceDeleteProgressToast(workspaceId)) {
          clearWorkspaceDeleteProgressToast(workspaceId);
          toastManager.add({
            title: runtimeT('common.deleted'),
            description: runtimeT('store.messages.workspaceRemovedCleanupMayStillRun', {
              name: workspaceName,
            }),
            type: 'info',
            timeout: 5000,
          });
        }
      }, 30_000);
    } catch (error) {
      clearWorkspaceDeleteProgressToast(workspaceId);
      toastManager.add({
        title: runtimeT('common.error'),
        description: runtimeErrorDescription(error, 'store.errors.failedToDeleteWorkspace'),
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
        title: runtimeT('common.error'),
        description: runtimeT('store.errors.failedToPinWorkspace'),
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
        title: runtimeT('common.error'),
        description: runtimeT('store.errors.failedToUnpinWorkspace'),
        type: 'error' 
      });
    }
  },

  ...createProjectStorePinOrderActions(set),

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
        title: runtimeT('common.archived'),
        description: runtimeT('store.messages.workspaceArchived'),
        type: 'info' 
      });
    } catch (error) {
      console.error('Error archiving workspace:', error);
      toastManager.add({ 
        title: runtimeT('common.error'),
        description: runtimeT('store.errors.failedToArchiveWorkspace'),
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
        title: runtimeT('common.error'),
        description: runtimeT('store.errors.failedToUpdateWorkspaceName'),
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
        title: runtimeT('common.error'),
        description: runtimeT('store.errors.failedToUpdateWorkspaceStatus'),
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
        title: runtimeT('common.error'),
        description: runtimeT('store.errors.failedToUpdateWorkspacePriority'),
        type: 'error'
      });
      throw error;
    }
  },

  ...createProjectStoreLabelActions(set, get),
  ...createProjectStoreReorderActions(set, get),

  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

  setupProgress: {},
  ...createProjectStoreSetupActions(set, get),
}));

/**
 * Subscribe to workspace_setup_progress events.
 * Must be called inside a React effect so the returned unsubscribe
 * function can be invoked on cleanup to prevent memory leaks.
 */
export function subscribeToWorkspaceSetupProgress(): () => void {
  return subscribeToWorkspaceSetupProgressEvent((progress) => {
    useProjectStore.getState().setSetupProgress(progress);
  });
}

/**
 * Subscribe to workspace_delete_progress events.
 * Shows toast when deletion completes.
 */
export function subscribeToWorkspaceDeleteProgress(): () => void {
  return subscribeToWorkspaceDeleteProgressEvent();
}

export function subscribeToWorkspaceGitignoreSyncFailed(): () => void {
  return subscribeToWorkspaceGitignoreSyncFailedEvent();
}
