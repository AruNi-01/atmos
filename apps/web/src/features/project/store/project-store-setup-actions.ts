'use client';

import { toastManager } from '@workspace/ui';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import { getSetupStepOrder } from './project-store-setup-progress';
import type { ProjectStore, ProjectStoreGet, ProjectStoreSet } from './project-store-types';

type ProjectStoreSetupActions = Pick<
  ProjectStore,
  'setSetupProgress' | 'clearSetupProgress' | 'retryWorkspaceSetup'
>;

export function createProjectStoreSetupActions(
  set: ProjectStoreSet,
  get: ProjectStoreGet,
): ProjectStoreSetupActions {
  return {
    setSetupProgress: (progress) =>
      set((state) => {
        const existing = state.setupProgress[progress.workspaceId];
        const newStatus = progress.status;
        const existingStepOrder = getSetupStepOrder(existing?.stepKey);
        const incomingStepOrder = getSetupStepOrder(progress.stepKey);
        const shouldIgnoreCompletedRegression =
          !!existing && existing.status === 'completed' && newStatus !== 'completed';
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
                  : (existing?.output || '') + (progress.output || ''),
            },
          },
        };
      }),

    clearSetupProgress: (workspaceId) =>
      set((state) => {
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
          type: 'error',
        });
      }
    },
  };
}
