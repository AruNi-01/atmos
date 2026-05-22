'use client';

import { toastManager } from '@workspace/ui';
import { wsWorkspaceApi, type WorkspaceLabelModel } from '@/api/ws-api';
import type { WorkspaceLabel } from '@/types/types';
import { waitForConnection } from './project-store-connection';
import type { ProjectStore, ProjectStoreGet, ProjectStoreSet } from './project-store-types';

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
  set: ProjectStoreSet,
  get: ProjectStoreGet,
): ProjectStoreLabelActions {
  return {
    fetchWorkspaceLabels: async (deletedOnly: boolean = false) => {
      await waitForConnection();
      const labels = await wsWorkspaceApi.listLabels(deletedOnly);
      set({
        workspaceLabels: labels.map((label) => mapWorkspaceLabelModel(label)),
      });
    },

    createWorkspaceLabel: async ({ name, color, source = 'manual' }) => {
      await waitForConnection();
      const label = await wsWorkspaceApi.createLabel({ name, color, source });
      const mappedLabel = mapWorkspaceLabelModel(label);
      set((state) => ({
        workspaceLabels: [
          ...state.workspaceLabels.filter((existing) => existing.id !== mappedLabel.id),
          mappedLabel,
        ].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      return mappedLabel;
    },

    updateWorkspaceLabel: async (labelId, { name, color }) => {
      await waitForConnection();
      const label = await wsWorkspaceApi.updateLabel(labelId, { name, color });
      const mappedLabel = mapWorkspaceLabelModel(label);
      set((state) => ({
        workspaceLabels: state.workspaceLabels
          .map((existing) => (existing.id === mappedLabel.id ? mappedLabel : existing))
          .sort((a, b) => a.name.localeCompare(b.name)),
        projects: state.projects.map((project) => ({
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
      await waitForConnection();
      await wsWorkspaceApi.deleteLabel(labelId);
      set((state) => ({
        workspaceLabels: state.workspaceLabels.filter((label) => label.id !== labelId),
      }));
    },

    restoreWorkspaceLabel: async (labelId: string) => {
      await waitForConnection();
      await wsWorkspaceApi.restoreLabel(labelId);
      // Refetch labels so the restored entry has its full data (name, color, source).
      await get().fetchWorkspaceLabels();
    },

    updateWorkspaceLabels: async (
      projectId: string,
      workspaceId: string,
      labels: WorkspaceLabel[],
    ) => {
      try {
        await waitForConnection();
        await wsWorkspaceApi.updateLabels(workspaceId, labels.map((label) => label.id));

        set((state) => ({
          projects: state.projects.map((project) =>
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
        await waitForConnection();
        await wsWorkspaceApi.markVisited(workspaceId);
        const visitedAt = new Date().toISOString();
        set((state) => ({
          projects: state.projects.map((project) => ({
            ...project,
            workspaces: project.workspaces.map((workspace) =>
              workspace.id === workspaceId
                ? { ...workspace, lastVisitedAt: visitedAt }
                : workspace,
            ),
          })),
        }));
      } catch (error) {
        console.error('Error marking workspace visited:', error);
      }
    },
  };
}
