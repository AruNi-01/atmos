'use client';

import { create } from 'zustand';
import { wsProjectApi } from '@/api/ws-api';
import { toastManager } from '@workspace/ui';
import { createTranslator } from 'next-intl';
import enMessages from '../../../../messages/en.json';
import zhMessages from '../../../../messages/zh.json';
import { currentAppLocale } from '@/shared/lib/current-app-locale';
import {
  getAtmosWebQueryClient,
} from '@/providers/app/query-client';
import { getComputerQueryScope } from '@/api/query/query-scope';
import { gitStatusQueryOptions } from '@/features/git/lib/git-query-options';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';

/**
 * Git orchestration store — context, target branch, and project linkage.
 *
 * APP-035: Git status snapshot fields (currentBranch, hasUncommittedChanges, etc.)
 * have been removed. Components should use `useGitStatusQuery(repoPath)` instead.
 */

export interface GitInfoState {
  // Context orchestration
  currentProjectId: string | null;
  currentWorkspaceId: string | null;
  currentProjectPath: string | null;

  // User-configured target branch (project-level, not snapshot)
  targetBranch: string | null;
}

export interface GitInfoActions {
  setCurrentContext: (
    projectId: string | null,
    workspaceId: string | null,
    projectPath: string | null,
  ) => void;
  setTargetBranch: (projectId: string, targetBranch: string | null) => Promise<void>;
  reset: () => void;
}

export type GitInfoStore = GitInfoState & GitInfoActions;

let cachedGitInfoLocale: 'en' | 'zh' | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedGitInfoTranslator: any = null;

function gitInfoT(
  key:
    | 'successTitle'
    | 'targetBranchSet'
    | 'targetBranchCleared'
    | 'errorTitle'
    | 'failedToUpdateTargetBranch',
  values?: Record<string, string | number>,
): string {
  const locale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedGitInfoTranslator || cachedGitInfoLocale !== locale) {
    cachedGitInfoLocale = locale;
    cachedGitInfoTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'git.infoStore',
    });
  }
  return cachedGitInfoTranslator(key as never, values);
}

const initialState: GitInfoState = {
  currentProjectId: null,
  currentWorkspaceId: null,
  currentProjectPath: null,
  targetBranch: null,
};

export const useGitInfoStore = create<GitInfoStore>((set, get) => ({
  ...initialState,

  setCurrentContext: (projectId, workspaceId, projectPath) => {
    set((state) => {
      if (
        state.currentProjectId === projectId &&
        state.currentWorkspaceId === workspaceId &&
        state.currentProjectPath === projectPath
      ) {
        return state;
      }
      return {
        currentProjectId: projectId,
        currentWorkspaceId: workspaceId,
        currentProjectPath: projectPath,
      };
    });
  },

  setTargetBranch: async (projectId: string, targetBranch: string | null) => {
    try {
      await wsProjectApi.updateTargetBranch(projectId, targetBranch);
      set({ targetBranch });
      toastManager.add({
        title: gitInfoT('successTitle'),
        description: targetBranch
          ? gitInfoT('targetBranchSet', { branch: targetBranch })
          : gitInfoT('targetBranchCleared'),
        type: 'success',
      });
    } catch (error) {
      console.error('[GitInfoStore] Failed to update target branch:', error);
      toastManager.add({
        title: gitInfoT('errorTitle'),
        description: gitInfoT('failedToUpdateTargetBranch'),
        type: 'error',
      });
    }
  },

  reset: () => {
    set(initialState);
  },
}));

/**
 * Hook to check git status before archive/delete operations.
 * Uses the Query cache (fetchQuery) so the result benefits from caching.
 */
export function useGitStatusCheck() {
  const checkBeforeOperation = async (
    path: string,
    operation: 'archive' | 'delete',
  ): Promise<{ canProceed: boolean; message?: string }> => {
    const locale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const translator: any = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'git.infoStore',
    });
    const t = (key: string, values?: Record<string, string | number>) =>
      translator(key, values) as string;

    try {
      const client = getAtmosWebQueryClient();
      const scope = getComputerQueryScope();
      const connectionState = useWebSocketStore.getState().connectionState;
      // Destructive preflight must not inherit the UI query's 15s staleTime.
      const status = await client.fetchQuery({
        ...gitStatusQueryOptions(scope, connectionState, path),
        staleTime: 0,
      });

      const issues: string[] = [];
      if (status.has_uncommitted_changes) {
        issues.push(t('uncommittedChanges', { count: status.uncommitted_count }));
      }
      if (status.has_unpushed_commits) {
        issues.push(t('unpushedCommits', { count: status.unpushed_count }));
      }
      if (issues.length > 0) {
        return {
          canProceed: false,
          message: t('cannotProceed', {
            operation:
              operation === 'archive' ? t('archiveOperation') : t('deleteOperation'),
            issues: issues.join(t('issuesJoiner')),
          }),
        };
      }
      return { canProceed: true };
    } catch (error) {
      console.error('[useGitStatusCheck] Error checking git status:', error);
      return {
        canProceed: true,
        message: translator('couldNotVerifyStatus' as never),
      };
    }
  };

  return { checkBeforeOperation };
}
