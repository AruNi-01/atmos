'use client';

import { create } from 'zustand';
import { gitApi, GitStatusResponse, wsProjectApi } from '@/api/ws-api';
import { toastManager } from '@workspace/ui';

/**
 * Git info store for sharing git-related state between components.
 * This store manages:
 * - Current workspace's git status (uncommitted/unpushed changes)
 * - Current branch name (from workspace)
 * - Target branch (from project, for merge/PR)
 */

export interface GitInfoState {
  // Current workspace info
  currentProjectId: string | null;
  currentWorkspaceId: string | null;
  currentProjectPath: string | null;
  
  // Git status
  currentBranch: string | null;
  targetBranch: string | null;
  hasUncommittedChanges: boolean;
  hasMergeConflicts: boolean;
  hasUnpushedCommits: boolean;
  uncommittedCount: number;
  unpushedCount: number;
  upstreamBehindCount: number | null;
  defaultBranch: string | null;
  defaultBranchAhead: number | null;
  defaultBranchBehind: number | null;
  githubOwner: string | null;
  githubRepo: string | null;
  
  // Loading states
  isLoadingStatus: boolean;
  lastStatusFetch: number | null;
}

export interface GitInfoActions {
  // Set current context
  setCurrentContext: (projectId: string | null, workspaceId: string | null, projectPath: string | null) => void;
  
  // Set target branch (saved to project)
  setTargetBranch: (projectId: string, targetBranch: string | null) => Promise<void>;
  
  // Fetch git status for current path
  fetchGitStatus: (path: string) => Promise<GitStatusResponse | null>;
  
  // Refresh git status for current context
  refreshGitStatus: () => Promise<void>;
  
  // Update current branch (display only, actual branch change requires git commands)
  updateCurrentBranch: (branch: string) => void;
  
  // Reset state
  reset: () => void;
}

export type GitInfoStore = GitInfoState & GitInfoActions;

const initialState: GitInfoState = {
  currentProjectId: null,
  currentWorkspaceId: null,
  currentProjectPath: null,
  currentBranch: null,
  targetBranch: null,
  hasUncommittedChanges: false,
  hasMergeConflicts: false,
  hasUnpushedCommits: false,
  uncommittedCount: 0,
  unpushedCount: 0,
  upstreamBehindCount: null,
  defaultBranch: null,
  defaultBranchAhead: null,
  defaultBranchBehind: null,
  githubOwner: null,
  githubRepo: null,
  isLoadingStatus: false,
  lastStatusFetch: null,
};

export const useGitInfoStore = create<GitInfoStore>((set, get) => ({
  ...initialState,

  setCurrentContext: (projectId, workspaceId, projectPath) => {
    set({
      currentProjectId: projectId,
      currentWorkspaceId: workspaceId,
      currentProjectPath: projectPath,
    });
  },

  setTargetBranch: async (projectId: string, targetBranch: string | null) => {
    try {
      await wsProjectApi.updateTargetBranch(projectId, targetBranch);
      set({ targetBranch });
      toastManager.add({
        title: 'Success',
        description: `Target branch ${targetBranch ? `set to ${targetBranch}` : 'cleared'}`,
        type: 'success',
      });
    } catch (error) {
      console.error('[GitInfoStore] Failed to update target branch:', error);
      toastManager.add({
        title: 'Error',
        description: 'Failed to update target branch',
        type: 'error',
      });
    }
  },

  fetchGitStatus: async (path: string): Promise<GitStatusResponse | null> => {
    if (!path) return null;

    set({ isLoadingStatus: true });

    try {
      const status = await gitApi.getStatus(path);
      set({
        currentBranch: status.current_branch,
        hasUncommittedChanges: status.has_uncommitted_changes,
        hasMergeConflicts: status.has_merge_conflicts,
        hasUnpushedCommits: status.has_unpushed_commits,
        uncommittedCount: status.uncommitted_count,
        unpushedCount: status.unpushed_count,
        upstreamBehindCount: status.upstream_behind_count,
        defaultBranch: status.default_branch,
        defaultBranchAhead: status.default_branch_ahead,
        defaultBranchBehind: status.default_branch_behind,
        githubOwner: status.github_owner,
        githubRepo: status.github_repo,
        lastStatusFetch: Date.now(),
        isLoadingStatus: false,
      });
      return status;
    } catch (error) {
      console.error('[GitInfoStore] Failed to fetch git status:', error);
      set({ isLoadingStatus: false });
      return null;
    }
  },

  refreshGitStatus: async () => {
    const { currentProjectPath, fetchGitStatus } = get();
    if (currentProjectPath) {
      await fetchGitStatus(currentProjectPath);
    }
  },

  updateCurrentBranch: (branch: string) => {
    set({ currentBranch: branch });
  },

  reset: () => {
    set(initialState);
  },
}));

/**
 * Hook to check git status before archive/delete operations.
 * Returns a function that checks for uncommitted/unpushed changes.
 */
export function useGitStatusCheck() {
  const { fetchGitStatus } = useGitInfoStore();

  const checkBeforeOperation = async (
    path: string,
    operation: 'archive' | 'delete'
  ): Promise<{ canProceed: boolean; message?: string }> => {
    try {
      const status = await fetchGitStatus(path);
      
      if (!status) {
        // Could not fetch status, allow proceeding with warning
        return {
          canProceed: true,
          message: 'Could not verify git status. Proceed with caution.',
        };
      }

      const issues: string[] = [];

      if (status.has_uncommitted_changes) {
        issues.push(`${status.uncommitted_count} uncommitted change(s)`);
      }

      if (status.has_unpushed_commits) {
        issues.push(`${status.unpushed_count} unpushed commit(s)`);
      }

      if (issues.length > 0) {
        return {
          canProceed: false,
          message: `Cannot ${operation}: ${issues.join(' and ')}. Please commit and push your changes first.`,
        };
      }

      return { canProceed: true };
    } catch (error) {
      console.error('[useGitStatusCheck] Error checking git status:', error);
      return {
        canProceed: true,
        message: 'Could not verify git status. Proceed with caution.',
      };
    }
  };

  return { checkBeforeOperation };
}
