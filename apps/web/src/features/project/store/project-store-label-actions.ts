'use client';

import { toastManager } from '@workspace/ui';
import { getComputerQueryScope } from '@/api/query/query-scope';
import { wsWorkspaceApi, type WorkspaceLabelModel } from '@/api/ws-api';
import type { WorkspaceLabel } from '@/shared/types/domain';
import { waitForConnection } from './project-store-connection';
import type { ProjectStore, ProjectStoreGet, ProjectStoreSet } from './project-store-types';
import {
  cancelProjectBootstrapQuery,
  invalidateProjectBootstrap,
  patchProjectBootstrapSnapshotAt,
} from '@/features/project/hooks/use-project-bootstrap-query';

type WorkspaceLabelSource = 'manual' | 'gitHub_issue' | 'gitHub_pr';

type ProjectStoreLabelActions = Pick<
  ProjectStore,
  | 'fetchWorkspaceLabels'
  | 'createWorkspaceLabel'
  | 'updateWorkspaceLabel'
  | 'deleteWorkspaceLabel'
  | 'restoreWorkspaceLabel'
  | 'updateWorkspaceLabels'
  | 'markWorkspaceVisited'
>;

function mapWorkspaceLabelModel(label: WorkspaceLabelModel): WorkspaceLabel {
  return {
    id: label.guid,
    name: label.name,
    color: label.color,
    source: label.source as WorkspaceLabelSource,
    createdAt: label.created_at,
  };
}

export function createProjectStoreLabelActions(
  _set: ProjectStoreSet,
  _get: ProjectStoreGet,
): ProjectStoreLabelActions {
  return {
    fetchWorkspaceLabels: async (deletedOnly: boolean = false) => {
      const scope = getComputerQueryScope();
      await waitForConnection();
      const labels = await wsWorkspaceApi.listLabels(deletedOnly);
      const mappedLabels = labels.map((label) => mapWorkspaceLabelModel(label));
      // Deleted labels must not overwrite the app-wide bootstrap active-label list.
      if (!deletedOnly) {
        await cancelProjectBootstrapQuery(scope);
        patchProjectBootstrapSnapshotAt(scope, (current) => ({
          ...current,
          workspaceLabels: mappedLabels,
        }));
      }
      return mappedLabels;
    },

    createWorkspaceLabel: async ({ name, color, source = 'manual' }) => {
      const scope = getComputerQueryScope();
      await waitForConnection();
      const label = await wsWorkspaceApi.createLabel({ name, color, source });
      const mappedLabel = mapWorkspaceLabelModel(label);
      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => ({
        ...current,
        workspaceLabels: [
          ...current.workspaceLabels.filter((existing) => existing.id !== mappedLabel.id),
          mappedLabel,
        ].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      return mappedLabel;
    },

    updateWorkspaceLabel: async (labelId, { name, color }) => {
      const scope = getComputerQueryScope();
      await waitForConnection();
      const label = await wsWorkspaceApi.updateLabel(labelId, { name, color });
      const mappedLabel = mapWorkspaceLabelModel(label);
      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => ({
        ...current,
        workspaceLabels: current.workspaceLabels
          .map((existing) => (existing.id === mappedLabel.id ? mappedLabel : existing))
          .sort((a, b) => a.name.localeCompare(b.name)),
        projects: current.projects.map((project) => ({
          ...project,
          workspaces: project.workspaces.map((workspace) => ({
            ...workspace,
            labels: workspace.labels.map((existing) =>
              existing.id === mappedLabel.id ? mappedLabel : existing,
            ),
          })),
        })),
      }));
      return mappedLabel;
    },

    deleteWorkspaceLabel: async (labelId: string) => {
      const scope = getComputerQueryScope();
      await waitForConnection();
      await wsWorkspaceApi.deleteLabel(labelId);
      await cancelProjectBootstrapQuery(scope);
      patchProjectBootstrapSnapshotAt(scope, (current) => ({
        ...current,
        workspaceLabels: current.workspaceLabels.filter((label) => label.id !== labelId),
      }));
    },

    restoreWorkspaceLabel: async (labelId: string) => {
      await waitForConnection();
      await wsWorkspaceApi.restoreLabel(labelId);
      // Invalidate to refetch full label list with the restored entry's data.
      await invalidateProjectBootstrap();
    },

    updateWorkspaceLabels: async (
      projectId: string,
      workspaceId: string,
      labels: WorkspaceLabel[],
    ) => {
      try {
        const scope = getComputerQueryScope();
        await waitForConnection();
        await wsWorkspaceApi.updateLabels(workspaceId, labels.map((label) => label.id));

        await cancelProjectBootstrapQuery(scope);
        patchProjectBootstrapSnapshotAt(scope, (current) => ({
          ...current,
          projects: current.projects.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  workspaces: project.workspaces.map((workspace) =>
                    workspace.id === workspaceId ? { ...workspace, labels } : workspace,
                  ),
                }
              : project,
          ),
        }));
      } catch (error) {
        console.error('Error updating workspace labels:', error);
        toastManager.add({
          title: 'Error',
          description: 'Failed to update workspace labels',
          type: 'error',
        });
        throw error;
      }
    },

    markWorkspaceVisited: async (workspaceId: string) => {
      try {
        const scope = getComputerQueryScope();
        await waitForConnection();
        await wsWorkspaceApi.markVisited(workspaceId);
        const visitedAt = new Date().toISOString();
        // Do NOT cancel/refetch bootstrap on every visit — that rebuilds the
        // entire projects tree and freezes LeftSidebar hover during rapid
        // workspace switching. Patch only the touched workspace identity.
        patchProjectBootstrapSnapshotAt(scope, (current) => {
          let changed = false;
          const projects = current.projects.map((project) => {
            let projectChanged = false;
            const workspaces = project.workspaces.map((workspace) => {
              if (workspace.id !== workspaceId) return workspace;
              if (workspace.lastVisitedAt === visitedAt) return workspace;
              projectChanged = true;
              changed = true;
              return { ...workspace, lastVisitedAt: visitedAt };
            });
            return projectChanged ? { ...project, workspaces } : project;
          });
          return changed ? { ...current, projects } : current;
        });
      } catch (error) {
        console.error('Error marking workspace visited:', error);
      }
    },
  };
}
