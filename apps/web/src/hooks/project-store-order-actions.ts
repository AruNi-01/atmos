'use client';

import { toastManager } from '@workspace/ui';
import { wsProjectApi, wsWorkspaceApi } from '@/api/ws-api';
import type { Project, Workspace } from '@/types/types';
import { waitForConnection } from './project-store-connection';
import { sortWorkspaces } from './project-store-mappers';
import type { ProjectStore, ProjectStoreGet, ProjectStoreSet } from './project-store-types';

type ProjectStorePinOrderActions = Pick<ProjectStore, 'updateWorkspacePinOrder'>;
type ProjectStoreReorderActions = Pick<ProjectStore, 'reorderProjects' | 'reorderWorkspaces'>;

export function createProjectStorePinOrderActions(
  set: ProjectStoreSet,
): ProjectStorePinOrderActions {
  return {
    updateWorkspacePinOrder: async (orderedWorkspaceIds) => {
      const orderById = new Map(orderedWorkspaceIds.map((id, index) => [id, index]));

      // Optimistic update first
      set((state) => ({
        projects: state.projects.map((project) => ({
          ...project,
          workspaces: sortWorkspaces(
            project.workspaces.map((workspace) => {
              const pinOrder = orderById.get(workspace.id);
              return pinOrder === undefined ? workspace : { ...workspace, pinOrder };
            }),
          ),
        })),
      }));

      try {
        await waitForConnection();
        await wsWorkspaceApi.updatePinOrder(orderedWorkspaceIds);
      } catch (error) {
        console.error('Error updating pinned order:', error);
      }
    },
  };
}

export function createProjectStoreReorderActions(
  set: ProjectStoreSet,
  get: ProjectStoreGet,
): ProjectStoreReorderActions {
  return {
    reorderProjects: async (newOrder: Project[]) => {
      try {
        await waitForConnection();

        // Optimistically update state
        set({ projects: newOrder });

        // Batch update all project orders in the backend
        await Promise.all(
          newOrder.map((project, index) => wsProjectApi.updateOrder(project.id, index)),
        );

        toastManager.add({
          title: 'Success',
          description: 'Project order saved',
          type: 'success',
        });
      } catch (error) {
        console.error('Error reordering projects:', error);
        toastManager.add({
          title: 'Error',
          description: 'Failed to save project order',
          type: 'error',
        });
        // Revert to original order on error
        get().fetchProjects();
      }
    },

    reorderWorkspaces: async (projectId: string, newOrder: Workspace[]) => {
      try {
        await waitForConnection();

        // Optimistically update state
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId ? { ...project, workspaces: newOrder } : project,
          ),
        }));

        // Batch update all workspace orders in the backend
        await Promise.all(
          newOrder.map((workspace, index) =>
            wsWorkspaceApi.updateOrder(workspace.id, index),
          ),
        );

        toastManager.add({
          title: 'Success',
          description: 'Workspace order saved',
          type: 'success',
        });
      } catch (error) {
        console.error('Error reordering workspaces:', error);
        toastManager.add({
          title: 'Error',
          description: 'Failed to save workspace order',
          type: 'error',
        });
        // Revert to original order on error
        get().fetchProjects();
      }
    },
  };
}
