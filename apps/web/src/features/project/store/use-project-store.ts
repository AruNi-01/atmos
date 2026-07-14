'use client';

import { createTranslator } from 'next-intl';
import { create } from 'zustand';
import { WorkspacePriority, WorkspaceWorkflowStatus, type Project } from '@/shared/types/domain';
import { getComputerQueryScope } from '@/api/query/query-scope';
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
import {
  cancelProjectBootstrapQuery,
  ensureProjectBootstrap,
  getProjectBootstrapSnapshot,
  invalidateProjectBootstrap,
  patchProjectBootstrapSnapshotAt,
} from '@/features/project/hooks/use-project-bootstrap-query';

export type { WorkspaceSetupProgress } from './project-store-setup-progress';

const WORKSPACE_VISIBLE_ATTEMPTS = 5;
const WORKSPACE_VISIBLE_IDLE_ATTEMPTS = 40;
const WORKSPACE_VISIBLE_IDLE_DELAY_MS = 50;
const WORKSPACE_VISIBLE_RETRY_DELAY_MS = 100;
let cachedRuntimeLocale: 'en' | 'zh' | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedRuntimeTranslator: any = null;

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

const hasWorkspace = (projects: Project[], workspaceId: string) =>
  projects.some((project) =>
    project.workspaces.some((workspace) => workspace.id === workspaceId),
  );

export const useProjectStore = create<ProjectStore>((set, get) => ({
  activeWorkspaceId: null,
  isLoading: false,
  hasLoadedProjects: false,

  fetchProjects: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      await ensureProjectBootstrap();
      set({ hasLoadedProjects: true });
    } catch (error) {
      console.error('Error fetching projects:', error);
      toastManager.add({
        title: runtimeT('common.error'),
        description: runtimeErrorDescription(error, 'store.errors.failedToLoadProjects'),
        type: 'error',
      });
    } finally {
      set({ isLoading: false });
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
      const currentProjects = getProjectBootstrapSnapshot()?.projects ?? [];
      if (hasWorkspace(currentProjects, workspaceId)) {
        return true;
      }

      // Force a network refetch — ensureQueryData would no-op within staleTime and
      // miss workspaces created externally (CLI, agents, other windows).
      set({ isLoading: true });
      try {
        await invalidateProjectBootstrap();
        await ensureProjectBootstrap();
        set({ hasLoadedProjects: true });
      } catch (error) {
        console.error('Error fetching projects:', error);
      } finally {
        set({ isLoading: false });
      }

      if (hasWorkspace(getProjectBootstrapSnapshot()?.projects ?? [], workspaceId)) {
        return true;
      }

      if (attempt < WORKSPACE_VISIBLE_ATTEMPTS - 1) {
        await sleep(WORKSPACE_VISIBLE_RETRY_DELAY_MS);
      }
    }

    return hasWorkspace(getProjectBootstrapSnapshot()?.projects ?? [], workspaceId);
  },

  resetForConnectionChange: () => {
    set({
      activeWorkspaceId: null,
      isLoading: false,
      hasLoadedProjects: false,
      setupProgress: {},
    });
  },

  addProject: async (data) => {
    try {
      const scope = getComputerQueryScope();
      await waitForConnection();

      const newProjectModel = await wsProjectApi.create({
        name: data.name,
        mainFilePath: data.mainFilePath,
        sidebarOrder: data.sidebarOrder ?? (getProjectBootstrapSnapshot()?.projects.length ?? 0),
        borderColor: data.borderColor,
      });

      const newProject = mapProjectModel(newProjectModel, []);

      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => ({
        ...current,
        projects: [...current.projects, newProject],
      }));
    } catch (error) {
      console.error('Error adding project:', error);
      toastManager.add({
        title: runtimeT('common.error'),
        description: runtimeErrorDescription(error, 'store.errors.failedToImportProject'),
        type: 'error',
      });
      throw error;
    }
  },

  updateProject: async (id, data) => {
    try {
      const scope = getComputerQueryScope();
      await waitForConnection();

      await wsProjectApi.update({
        guid: id,
        name: data.name,
        borderColor: data.borderColor,
        logoPath: data.logoPath,
        sidebarOrder: data.sidebarOrder,
      });

      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => ({
        ...current,
        projects: current.projects.map((p) =>
          p.id === id ? { ...p, ...data } : p
        ),
      }));
    } catch (error) {
      console.error('Error updating project:', error);
      toastManager.add({
        title: runtimeT('common.error'),
        description: runtimeT('store.errors.failedToUpdateProject'),
        type: 'error',
      });
    }
  },

  deleteProject: async (id) => {
    try {
      const scope = getComputerQueryScope();
      await waitForConnection();

      await wsProjectApi.delete(id);

      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => ({
        ...current,
        projects: current.projects.filter((p) => p.id !== id),
      }));

      toastManager.add({
        title: runtimeT('common.deleted'),
        description: runtimeT('store.messages.projectRemoved'),
        type: 'info',
      });
    } catch (error) {
      console.error('Error deleting project:', error);
      toastManager.add({
        title: runtimeT('common.error'),
        description: runtimeT('store.errors.failedToDeleteProject'),
        type: 'error',
      });
    }
  },

  addWorkspace: async (data) => {
    try {
      const scope = getComputerQueryScope();
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
        labelGuids: data.labels?.map((label) => label.id),
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

      set((state) => ({
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
              }),
        },
      }));

      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => ({
        ...current,
        projects: current.projects.map((p) =>
          p.id === data.projectId
            ? {
                ...p,
                targetBranch: p.targetBranch || newWorkspace.baseBranch,
                workspaces: sortWorkspaces([...p.workspaces, newWorkspace]),
              }
            : p
        ),
      }));

      toastManager.add({
        title: runtimeT('store.messages.workspaceSetupStartedTitle'),
        description: runtimeT('store.messages.openingWorkspace', {
          name: newWorkspace.displayName || newWorkspace.name,
        }),
        type: 'info',
      });
      return newWorkspace.id;
    } catch (error) {
      console.error('Error adding workspace:', error);
      throw error;
    }
  },

  addWorkspacesToProject: async (projectId: string, workspaceGuids: string[]) => {
    try {
      const scope = getComputerQueryScope();
      const mappedWorkspaces = await wsWorkspaceApi.listProjectWorkspacesFiltered(projectId, workspaceGuids);

      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => {
        const project = current.projects.find((p) => p.id === projectId);
        if (!project) return current;

        const existingIds = new Set(project.workspaces.map((w) => w.id));
        const uniqueNewWorkspaces = mappedWorkspaces.filter((w) => !existingIds.has(w.id));

        return {
          ...current,
          projects: current.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  workspaces: sortWorkspaces([...p.workspaces, ...uniqueNewWorkspaces]),
                }
              : p
          ),
        };
      });
    } catch (error) {
      console.error('Error adding workspaces to project:', error);
      throw error;
    }
  },

  quickAddWorkspace: async (projectId: string) => {
    try {
      const scope = getComputerQueryScope();
      await waitForConnection();

      const project = getProjectBootstrapSnapshot()?.projects.find((p) => p.id === projectId);
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

      const newWorkspaceModel = await wsWorkspaceApi.create({
        projectGuid: projectId,
        name: '',
        branch: '',
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

      set((state) => ({
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
              }),
        },
      }));

      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => ({
        ...current,
        projects: current.projects.map((p) =>
          p.id === projectId
            ? { ...p, workspaces: sortWorkspaces([...p.workspaces, newWorkspace]) }
            : p
        ),
      }));

      toastManager.add({
        title: runtimeT('store.messages.workspaceSetupStartedTitle'),
        description: runtimeT('store.messages.openingWorkspace', {
          name: newWorkspace.displayName || newWorkspace.name,
        }),
        type: 'info',
      });

      return newWorkspace.id;
    } catch (error) {
      console.error('Error quick adding workspace:', error);
      toastManager.add({
        title: runtimeT('common.error'),
        description: runtimeErrorDescription(error, 'store.errors.failedToCreateWorkspace'),
        type: 'error',
      });
      return null;
    }
  },

  deleteWorkspace: async (projectId, workspaceId) => {
    const scope = getComputerQueryScope();
    const previousSnapshot = getProjectBootstrapSnapshot();
    const previousActiveWorkspaceId = get().activeWorkspaceId;
    const previousSetupProgress = get().setupProgress;
    const workspaceBeingDeleted = previousSnapshot?.projects
      .find((project) => project.id === projectId)
      ?.workspaces.find((workspace) => workspace.id === workspaceId);

    set((state) => {
      const nextSetupProgress = { ...state.setupProgress };
      delete nextSetupProgress[workspaceId];

      return {
        activeWorkspaceId:
          state.activeWorkspaceId === workspaceId ? null : state.activeWorkspaceId,
        setupProgress: nextSetupProgress,
      };
    });

    await cancelProjectBootstrapQuery(scope);
    patchProjectBootstrapSnapshotAt(scope, (current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              workspaces: project.workspaces.filter(
                (workspace) => workspace.id !== workspaceId,
              ),
            }
          : project,
      ),
    }));

    const workspaceName =
      workspaceBeingDeleted?.displayName ||
      workspaceBeingDeleted?.name ||
      runtimeT('common.untitled');

    registerWorkspaceDeleteProgressToast(workspaceId, workspaceName);

    try {
      await waitForConnection();
      await wsWorkspaceApi.delete(workspaceId);

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
      // Restore orchestration fields and reinsert only the deleted workspace into
      // the latest Query snapshot (preserve unrelated updates during the delete).
      if (workspaceBeingDeleted) {
        patchProjectBootstrapSnapshotAt(scope, (current) => ({
          ...current,
          projects: current.projects.map((project) => {
            if (project.id !== projectId) return project;
            if (project.workspaces.some((workspace) => workspace.id === workspaceId)) {
              return project;
            }
            return {
              ...project,
              workspaces: sortWorkspaces([...project.workspaces, workspaceBeingDeleted]),
            };
          }),
        }));
      }
      set({
        activeWorkspaceId: previousActiveWorkspaceId,
        setupProgress: previousSetupProgress,
      });
      console.error('Error deleting workspace:', error);
      throw error;
    }
  },

  pinWorkspace: async (projectId, workspaceId) => {
    try {
      const scope = getComputerQueryScope();
      await waitForConnection();
      await wsWorkspaceApi.pin(workspaceId);

      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => ({
        ...current,
        projects: current.projects.map((p) => ({
          ...p,
          workspaces: sortWorkspaces(
            p.workspaces.map((w) => {
              if (w.id === workspaceId) {
                return { ...w, isPinned: true, pinnedAt: new Date().toISOString(), pinOrder: 0 };
              }
              if (w.isPinned && w.pinOrder !== undefined) {
                return { ...w, pinOrder: w.pinOrder + 1 };
              }
              return w;
            })
          ),
        })),
      }));
    } catch (error) {
      console.error('Error pinning workspace:', error);
      toastManager.add({
        title: runtimeT('common.error'),
        description: runtimeT('store.errors.failedToPinWorkspace'),
        type: 'error',
      });
    }
  },

  unpinWorkspace: async (projectId, workspaceId) => {
    try {
      const scope = getComputerQueryScope();
      await waitForConnection();
      await wsWorkspaceApi.unpin(workspaceId);

      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => ({
        ...current,
        projects: current.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                workspaces: sortWorkspaces(
                  p.workspaces.map((w) =>
                    w.id === workspaceId
                      ? { ...w, isPinned: false, pinnedAt: undefined, pinOrder: undefined }
                      : w
                  )
                ),
              }
            : p
        ),
      }));
    } catch (error) {
      console.error('Error unpinning workspace:', error);
      toastManager.add({
        title: runtimeT('common.error'),
        description: runtimeT('store.errors.failedToUnpinWorkspace'),
        type: 'error',
      });
    }
  },

  ...createProjectStorePinOrderActions(set),

  archiveWorkspace: async (projectId, workspaceId) => {
    try {
      const scope = getComputerQueryScope();
      await waitForConnection();
      await wsWorkspaceApi.archive(workspaceId);

      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => ({
        ...current,
        projects: current.projects.map((p) =>
          p.id === projectId
            ? { ...p, workspaces: p.workspaces.filter((w) => w.id !== workspaceId) }
            : p
        ),
      }));

      toastManager.add({
        title: runtimeT('common.archived'),
        description: runtimeT('store.messages.workspaceArchived'),
        type: 'info',
      });
    } catch (error) {
      console.error('Error archiving workspace:', error);
      toastManager.add({
        title: runtimeT('common.error'),
        description: runtimeT('store.errors.failedToArchiveWorkspace'),
        type: 'error',
      });
    }
  },

  updateWorkspaceName: async (projectId: string, workspaceId: string, name: string) => {
    try {
      const scope = getComputerQueryScope();
      await waitForConnection();
      await wsWorkspaceApi.updateName(workspaceId, name);

      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => ({
        ...current,
        projects: current.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                workspaces: p.workspaces.map((w) =>
                  w.id === workspaceId ? { ...w, displayName: name } : w
                ),
              }
            : p
        ),
      }));
    } catch (error) {
      console.error('Error updating workspace name:', error);
      toastManager.add({
        title: runtimeT('common.error'),
        description: runtimeT('store.errors.failedToUpdateWorkspaceName'),
        type: 'error',
      });
      throw error;
    }
  },

  updateWorkspaceBranch: async (projectId: string, workspaceId: string, branch: string) => {
    try {
      const scope = getComputerQueryScope();
      await waitForConnection();
      await wsWorkspaceApi.updateBranch(workspaceId, branch);

      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => ({
        ...current,
        projects: current.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                workspaces: p.workspaces.map((w) =>
                  w.id === workspaceId ? { ...w, branch } : w
                ),
              }
            : p
        ),
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
      const scope = getComputerQueryScope();
      await waitForConnection();
      await wsWorkspaceApi.updateWorkflowStatus(workspaceId, workflowStatus);

      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => ({
        ...current,
        projects: current.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                workspaces: p.workspaces.map((w) =>
                  w.id === workspaceId ? { ...w, workflowStatus } : w
                ),
              }
            : p
        ),
      }));
    } catch (error) {
      console.error('Error updating workspace workflow status:', error);
      toastManager.add({
        title: runtimeT('common.error'),
        description: runtimeT('store.errors.failedToUpdateWorkspaceStatus'),
        type: 'error',
      });
    }
  },

  updateWorkspacePriority: async (
    projectId: string,
    workspaceId: string,
    priority: WorkspacePriority,
  ) => {
    try {
      const scope = getComputerQueryScope();
      await waitForConnection();
      await wsWorkspaceApi.updatePriority(workspaceId, priority);

      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => ({
        ...current,
        projects: current.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                workspaces: p.workspaces.map((w) =>
                  w.id === workspaceId ? { ...w, priority } : w
                ),
              }
            : p
        ),
      }));
    } catch (error) {
      console.error('Error updating workspace priority:', error);
      toastManager.add({
        title: runtimeT('common.error'),
        description: runtimeT('store.errors.failedToUpdateWorkspacePriority'),
        type: 'error',
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
