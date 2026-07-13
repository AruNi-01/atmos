'use client';

import { create } from 'zustand';
import { createTranslator } from 'next-intl';
import { gitApi } from '@/api/ws-api';
import enMessages from '../../../../messages/en.json';
import zhMessages from '../../../../messages/zh.json';
import { currentAppLocale } from '@/shared/lib/current-app-locale';
import { invalidateGitQueries } from '@/features/git/hooks/use-git-changed-files-query';

let cachedGitStoreLocale: 'en' | 'zh' | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedGitStoreTranslator: any = null;

function gitStoreT(
  key:
    | 'actionErrors.mergeConflicts'
    | 'actionErrors.localChangesWouldBeOverwritten'
    | 'actionErrors.noUpstreamBranch'
    | 'actionErrors.fastForwardNotPossible'
    | 'actionErrors.notGitRepository',
): string {
  const locale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedGitStoreTranslator || cachedGitStoreLocale !== locale) {
    cachedGitStoreLocale = locale;
    cachedGitStoreTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'git.store',
    });
  }
  return cachedGitStoreTranslator(key as never);
}

export function cleanGitActionErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return '';
  }

  return error.message
    .replace(/^\[[^\]]+\]\s*/i, "")
    .replace(/^Request failed:\s*/i, "")
    .replace(/^Validation error:\s*/i, "")
    .trim();
}

export function isConflictActionError(error: unknown): boolean {
  const message = cleanGitActionErrorMessage(error).toLowerCase();
  return (
    message.includes("conflict") ||
    message.includes("automatic merge failed") ||
    message.includes("fix conflicts and then commit the result") ||
    message.includes("unmerged files") ||
    message.includes("resolve all conflicts manually")
  );
}

export function formatGitActionErrorForDisplay(error: unknown): string {
  const message = cleanGitActionErrorMessage(error);
  if (!message) return '';

  const normalized = message.toLowerCase();

  if (isConflictActionError(error)) {
    return gitStoreT('actionErrors.mergeConflicts');
  }

  if (
    normalized.includes('would be overwritten by merge') ||
    normalized.includes('your local changes to the following files would be overwritten')
  ) {
    return gitStoreT('actionErrors.localChangesWouldBeOverwritten');
  }

  if (
    normalized.includes('no upstream branch') ||
    normalized.includes('has no upstream branch') ||
    normalized.includes('no tracking information for the current branch')
  ) {
    return gitStoreT('actionErrors.noUpstreamBranch');
  }

  if (
    normalized.includes('not possible to fast-forward') ||
    normalized.includes('cannot fast-forward') ||
    normalized.includes('divergent branches')
  ) {
    return gitStoreT('actionErrors.fastForwardNotPossible');
  }

  if (normalized.includes('not a git repository')) {
    return gitStoreT('actionErrors.notGitRepository');
  }

  return message;
}

export type GitCompareMode = 'branch' | 'default-branch' | 'ref' | 'worktree';

interface GitStore {
  // Orchestration state (not server snapshots)
  currentRepoPath: string | null;
  compareMode: GitCompareMode;
  compareBaseRef: string | null;
  selectedFilePath: string | null;
  isLoading: boolean;

  // Orchestration actions
  setCurrentRepoPath: (path: string | null) => void;
  selectFile: (filePath: string | null) => void;
  compareAgainstDefaultBranch: () => Promise<void>;
  compareAgainstRef: (baseRef: string) => Promise<void>;
  compareWorktreeChanges: () => Promise<void>;
  resetCompareMode: () => void;
  /** Clear orchestration state on target switch (APP-035). */
  resetForConnectionChange: () => void;

  // Mutation actions — these invalidate Query-owned snapshots after success
  commitChanges: (message: string) => Promise<void>;
  pushChanges: () => Promise<void>;
  stageFiles: (files: string[]) => Promise<void>;
  unstageFiles: (files: string[]) => Promise<void>;
  discardUnstagedChanges: (files: string[]) => Promise<void>;
  discardUntrackedFiles: (files: string[]) => Promise<void>;
  stageAllUnstaged: (unstagedPaths: string[]) => Promise<void>;
  stageAllUntracked: (untrackedPaths: string[]) => Promise<void>;
  unstageAll: (stagedPaths: string[]) => Promise<void>;
  discardAllUnstaged: (unstagedPaths: string[]) => Promise<void>;
  discardAllUntracked: (untrackedPaths: string[]) => Promise<void>;
  pullChanges: () => Promise<void>;
  fetchChanges: () => Promise<void>;
  syncChanges: () => Promise<void>;
}

export const useGitStore = create<GitStore>((set, get) => ({
  currentRepoPath: null,
  compareMode: 'branch',
  compareBaseRef: null,
  selectedFilePath: null,
  isLoading: false,

  setCurrentRepoPath: (path) => {
    if (get().currentRepoPath === path) return;
    set({
      currentRepoPath: path,
      compareMode: 'branch',
      compareBaseRef: null,
    });
  },

  selectFile: (filePath) => {
    set({ selectedFilePath: filePath });
  },

  resetCompareMode: () => {
    set({
      compareMode: 'branch',
      compareBaseRef: null,
    });
  },

  resetForConnectionChange: () => {
    set({
      currentRepoPath: null,
      compareMode: 'branch',
      compareBaseRef: null,
      selectedFilePath: null,
      isLoading: false,
    });
  },

  compareAgainstDefaultBranch: async () => {
    set({ compareMode: 'default-branch', compareBaseRef: null });
  },

  compareAgainstRef: async (baseRef: string) => {
    if (!baseRef.trim()) return;
    set({ compareMode: 'ref', compareBaseRef: baseRef.trim() });
  },

  compareWorktreeChanges: async () => {
    set({ compareMode: 'worktree', compareBaseRef: null });
  },

  commitChanges: async (message: string) => {
    const { currentRepoPath } = get();
    if (!currentRepoPath) return;

    try {
      set({ isLoading: true });
      await gitApi.commit(currentRepoPath, message);
      await invalidateGitQueries(currentRepoPath);
    } catch (error) {
      console.error('Failed to commit changes:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  pushChanges: async () => {
    const { currentRepoPath } = get();
    if (!currentRepoPath) return;

    try {
      set({ isLoading: true });
      await gitApi.push(currentRepoPath);
      await invalidateGitQueries(currentRepoPath);
    } catch (error) {
      try {
        await gitApi.fetch(currentRepoPath);
        await invalidateGitQueries(currentRepoPath);
      } catch (refreshError) {
        console.error('Failed to refresh after push error:', refreshError);
      }
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  stageFiles: async (files: string[]) => {
    const { currentRepoPath } = get();
    if (!currentRepoPath || files.length === 0) return;

    try {
      set({ isLoading: true });
      await gitApi.stage(currentRepoPath, files);
      await invalidateGitQueries(currentRepoPath);
    } catch (error) {
      console.error('Failed to stage files:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  unstageFiles: async (files: string[]) => {
    const { currentRepoPath } = get();
    if (!currentRepoPath || files.length === 0) return;

    try {
      set({ isLoading: true });
      await gitApi.unstage(currentRepoPath, files);
      await invalidateGitQueries(currentRepoPath);
    } catch (error) {
      console.error('Failed to unstage files:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  discardUnstagedChanges: async (files: string[]) => {
    const { currentRepoPath } = get();
    if (!currentRepoPath || files.length === 0) return;

    try {
      set({ isLoading: true });
      await gitApi.discardUnstaged(currentRepoPath, files);
      await invalidateGitQueries(currentRepoPath);
    } catch (error) {
      console.error('Failed to discard unstaged changes:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  discardUntrackedFiles: async (files: string[]) => {
    const { currentRepoPath } = get();
    if (!currentRepoPath || files.length === 0) return;

    try {
      set({ isLoading: true });
      await gitApi.discardUntracked(currentRepoPath, files);
      await invalidateGitQueries(currentRepoPath);
    } catch (error) {
      console.error('Failed to discard untracked files:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  stageAllUnstaged: async (unstagedPaths: string[]) => {
    await get().stageFiles(unstagedPaths);
  },

  stageAllUntracked: async (untrackedPaths: string[]) => {
    await get().stageFiles(untrackedPaths);
  },

  unstageAll: async (stagedPaths: string[]) => {
    await get().unstageFiles(stagedPaths);
  },

  discardAllUnstaged: async (unstagedPaths: string[]) => {
    await get().discardUnstagedChanges(unstagedPaths);
  },

  discardAllUntracked: async (untrackedPaths: string[]) => {
    await get().discardUntrackedFiles(untrackedPaths);
  },

  pullChanges: async () => {
    const { currentRepoPath } = get();
    if (!currentRepoPath) return;

    try {
      set({ isLoading: true });
      await gitApi.pull(currentRepoPath);
      await invalidateGitQueries(currentRepoPath);
    } catch (error) {
      try {
        await invalidateGitQueries(currentRepoPath);
      } catch {
        // ignore
      }
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  fetchChanges: async () => {
    const { currentRepoPath } = get();
    if (!currentRepoPath) return;

    try {
      set({ isLoading: true });
      await gitApi.fetch(currentRepoPath);
      await invalidateGitQueries(currentRepoPath);
    } catch (error) {
      console.error('Failed to fetch changes:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  syncChanges: async () => {
    const { currentRepoPath } = get();
    if (!currentRepoPath) return;

    try {
      set({ isLoading: true });
      await gitApi.sync(currentRepoPath);
      await invalidateGitQueries(currentRepoPath);
    } catch (error) {
      try {
        await invalidateGitQueries(currentRepoPath);
      } catch {
        // ignore
      }
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },
}));
