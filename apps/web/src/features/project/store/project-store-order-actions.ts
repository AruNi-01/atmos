'use client';

import { toastManager } from '@workspace/ui';
import { getComputerQueryScope } from '@/api/query/query-scope';
import { wsProjectApi, wsWorkspaceApi } from '@/api/ws-api';
import type { Project, Workspace } from '@/shared/types/domain';
import { waitForConnection } from './project-store-connection';
import { sortWorkspaces } from './project-store-mappers';
import type { ProjectStore, ProjectStoreGet, ProjectStoreSet } from './project-store-types';
import {
  cancelProjectBootstrapQuery,
  getProjectBootstrapSnapshot,
  invalidateProjectBootstrap,
  patchProjectBootstrapSnapshotAt,
  setProjectBootstrapSnapshotAt,
} from '@/features/project/hooks/use-project-bootstrap-query';

type ProjectStorePinOrderActions = Pick<ProjectStore, 'updateWorkspacePinOrder'>;
type ProjectStoreReorderActions = Pick<ProjectStore, 'reorderProjects' | 'reorderWorkspaces'>;

export function createProjectStorePinOrderActions(
  _set: ProjectStoreSet,
): ProjectStorePinOrderActions {
  return {
    updateWorkspacePinOrder: async (orderedWorkspaceIds) => {
      const scope = getComputerQueryScope();
      const previousSnapshot = getProjectBootstrapSnapshot();
      const orderById = new Map(orderedWorkspaceIds.map((id, index) => [id, index]));

      // Optimistic update first
      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => ({
        ...current,
        projects: current.projects.map((project) => ({
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
        if (previousSnapshot) {
          setProjectBootstrapSnapshotAt(scope, previousSnapshot);
        }
      }
    },
  };
}

export function createProjectStoreReorderActions(
  _set: ProjectStoreSet,
  _get: ProjectStoreGet,
): ProjectStoreReorderActions {
  return {
    reorderProjects: async (newOrder: Project[]) => {
      try {
        const scope = getComputerQueryScope();
        await waitForConnection();

        // Optimistic update
        await cancelProjectBootstrapQuery(scope);
        patchProjectBootstrapSnapshotAt(scope, (current) => ({
          ...current,
          projects: newOrder,
        }));

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
        // Revert by re-fetching from server
        await invalidateProjectBootstrap();
      }
    },

    reorderWorkspaces: async (projectId: string, newOrder: Workspace[]) => {
      try {
        const scope = getComputerQueryScope();
        await waitForConnection();

        // Optimistic update
        await cancelProjectBootstrapQuery(scope);
        patchProjectBootstrapSnapshotAt(scope, (current) => ({
          ...current,
          projects: current.projects.map((project) =>
            project.id === projectId ? { ...project, workspaces: newOrder } : project,
          ),
        }));

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
        // Revert by re-fetching from server
        await invalidateProjectBootstrap();
      }
    },
  };
}
