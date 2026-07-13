'use client';

import { create } from 'zustand';
import { createTranslator } from 'next-intl';
import { gitApi, GitChangedFile, GitChangedFilesResponse, GitStatusResponse } from '@/api/ws-api';
import enMessages from '../../../../messages/en.json';
import zhMessages from '../../../../messages/zh.json';
import { currentAppLocale } from '@/shared/lib/current-app-locale';
import { useGitInfoStore } from './use-git-info-store';

let cachedGitStoreLocale: 'en' | 'zh' | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedGitStoreTranslator: any = null;
let gitRefreshRequestId = 0;

function invalidateGitRefreshRequests(): number {
  gitRefreshRequestId += 1;
  return gitRefreshRequestId;
}

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

// ===== 类型定义 =====

type GitCompareMode = 'branch' | 'default-branch' | 'ref' | 'worktree';

function getCompareRequest(
  compareMode: GitCompareMode,
  status: GitStatusResponse,
  compareBaseRef: string | null,
): {
  baseBranch: string | null;
  baseRef: string | null;
  commitRef: string | null;
  usePreferredCompare: boolean;
} {
  switch (compareMode) {
    case 'default-branch':
      return {
        baseBranch: status.default_branch,
        baseRef: null,
        commitRef: null,
        usePreferredCompare: false,
      };
    case 'ref':
      return {
        baseBranch: null,
        baseRef: null,
        commitRef: compareBaseRef,
        usePreferredCompare: false,
      };
    case 'worktree':
      return {
        baseBranch: null,
        baseRef: null,
        commitRef: null,
        usePreferredCompare: false,
      };
    case 'branch':
    default:
      return {
        baseBranch: null,
        baseRef: null,
        commitRef: null,
        usePreferredCompare: true,
      };
  }
}

interface GitStore {
  // 状态
  currentRepoPath: string | null;
  gitStatus: GitStatusResponse | null;
  
  // 分类的变更文件
  stagedFiles: GitChangedFile[];
  unstagedFiles: GitChangedFile[];
  untrackedFiles: GitChangedFile[];
  compareFiles: GitChangedFile[];
  compareRef: string | null;
  compareMode: GitCompareMode;
  compareBaseRef: string | null;
  
  totalAdditions: number;
  totalDeletions: number;
  isBranchPublished: boolean;
  isLoading: boolean;
  selectedFilePath: string | null;

  // 动作
  setCurrentRepoPath: (path: string | null) => void;
  refreshRepositoryState: (options?: { fetchRemote?: boolean }) => Promise<void>;
  refreshGitStatus: () => Promise<void>;
  refreshChangedFiles: () => Promise<void>;
  compareAgainstDefaultBranch: () => Promise<void>;
  compareAgainstRef: (baseRef: string) => Promise<void>;
  compareWorktreeChanges: () => Promise<void>;
  resetCompareMode: () => void;
  /** Clear Computer-scoped git snapshots on target switch (APP-035). */
  resetForConnectionChange: () => void;
  selectFile: (filePath: string | null) => void;
  commitChanges: (message: string) => Promise<void>;
  pushChanges: () => Promise<void>;
  
  // 新的 Git 操作
  stageFiles: (files: string[]) => Promise<void>;
  unstageFiles: (files: string[]) => Promise<void>;
  discardUnstagedChanges: (files: string[]) => Promise<void>;
  discardUntrackedFiles: (files: string[]) => Promise<void>;
  stageAllUnstaged: () => Promise<void>;
  stageAllUntracked: () => Promise<void>;
  unstageAll: () => Promise<void>;
  discardAllUnstaged: () => Promise<void>;
  discardAllUntracked: () => Promise<void>;
  pullChanges: () => Promise<void>;
  fetchChanges: () => Promise<void>;
  syncChanges: () => Promise<void>;
}

export const useGitStore = create<GitStore>((set, get) => ({
  // 初始状态
  currentRepoPath: null,
  gitStatus: null,
  stagedFiles: [],
  unstagedFiles: [],
  untrackedFiles: [],
  compareFiles: [],
  compareRef: null,
  compareMode: 'branch',
  compareBaseRef: null,
  totalAdditions: 0,
  totalDeletions: 0,
  isBranchPublished: true,
  isLoading: false,
  selectedFilePath: null,

  // 设置当前仓库路径
  setCurrentRepoPath: (path) => {
    if (get().currentRepoPath === path) return;

    invalidateGitRefreshRequests();
    set({
      currentRepoPath: path,
      compareFiles: [],
      compareRef: null,
      compareMode: 'branch',
      compareBaseRef: null,
      ...(path ? {} : { isLoading: false }),
    });
    if (path) {
      void get().refreshRepositoryState({ fetchRemote: true });
    } else {
      // 清除状态当没有路径时
      set({
        gitStatus: null,
        stagedFiles: [],
        unstagedFiles: [],
        untrackedFiles: [],
        compareFiles: [],
        compareRef: null,
        compareMode: 'branch',
        compareBaseRef: null,
        totalAdditions: 0,
        totalDeletions: 0,
        isLoading: false,
      });
      useGitInfoStore.setState({
        currentBranch: null,
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
      });
    }
  },

  refreshRepositoryState: async (options) => {
    const { currentRepoPath } = get();
    if (!currentRepoPath) return;
    const requestId = invalidateGitRefreshRequests();
    const isCurrentRequest = () =>
      gitRefreshRequestId === requestId && get().currentRepoPath === currentRepoPath;

    const fetchRemote = options?.fetchRemote ?? false;

    try {
      set({ isLoading: true });
      useGitInfoStore.setState({ isLoadingStatus: true });

      if (fetchRemote) {
        try {
          await gitApi.fetch(currentRepoPath);
        } catch (error) {
          console.error('Failed to fetch remote refs before refresh:', error);
        }
      }

      const status = await gitApi.getStatus(currentRepoPath);
      const worktreeResponse: GitChangedFilesResponse = await gitApi.getChangedFiles(
        currentRepoPath,
        null,
        false,
      );
      const { compareMode, compareBaseRef } = get();
      const compareRequest = getCompareRequest(compareMode, status, compareBaseRef);
      const compareResponse: GitChangedFilesResponse | null = await gitApi
        .getChangedFiles(
          currentRepoPath,
          compareRequest.baseBranch,
          compareRequest.usePreferredCompare,
          {
            baseRef: compareRequest.baseRef,
            commitRef: compareRequest.commitRef,
          },
        )
        .catch((error) => {
          console.error('Failed to refresh compare changes:', error);
          return null;
        });

      if (!isCurrentRequest()) return;
      const currentState = get();
      const shouldApplyCompare =
        currentState.compareMode === compareMode &&
        currentState.compareBaseRef === compareBaseRef;

      set({
        gitStatus: status,
        stagedFiles: worktreeResponse.staged_files,
        unstagedFiles: worktreeResponse.unstaged_files,
        untrackedFiles: worktreeResponse.untracked_files,
        ...(shouldApplyCompare
          ? {
              compareFiles: compareResponse?.compare_ref
                ? [
                    ...compareResponse.staged_files,
                    ...compareResponse.unstaged_files,
                    ...compareResponse.untracked_files,
                  ]
                : [],
              compareRef: compareResponse?.compare_ref ?? null,
              compareMode,
              compareBaseRef,
            }
          : {}),
        totalAdditions: worktreeResponse.total_additions,
        totalDeletions: worktreeResponse.total_deletions,
        isBranchPublished: worktreeResponse.is_branch_published,
      });

      useGitInfoStore.setState({
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
    } catch (error) {
      console.error('Failed to refresh repository state:', error);
      if (!isCurrentRequest()) return;
      set({
        gitStatus: null,
        stagedFiles: [],
        unstagedFiles: [],
        untrackedFiles: [],
        compareFiles: [],
        compareRef: null,
        compareMode: 'branch',
        compareBaseRef: null,
        totalAdditions: 0,
        totalDeletions: 0,
      });
      useGitInfoStore.setState({ isLoadingStatus: false });
    } finally {
      if (isCurrentRequest()) {
        set({ isLoading: false });
      }
    }
  },

  // 刷新 Git 状态
  refreshGitStatus: async () => {
    const { currentRepoPath } = get();
    if (!currentRepoPath) return;

    try {
      set({ isLoading: true });
      useGitInfoStore.setState({ isLoadingStatus: true });
      
      const status = await gitApi.getStatus(currentRepoPath);
      set({ gitStatus: status });
      
      // Sync to header store
      useGitInfoStore.setState({
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
    } catch (error) {
      console.error('Failed to refresh git status:', error);
      useGitInfoStore.setState({ isLoadingStatus: false });
    } finally {
      set({ isLoading: false });
    }
  },

  // 刷新变更文件列表
  refreshChangedFiles: async () => {
    const { currentRepoPath } = get();
    if (!currentRepoPath) return;
    const requestId = invalidateGitRefreshRequests();
    const isCurrentRequest = () =>
      gitRefreshRequestId === requestId && get().currentRepoPath === currentRepoPath;

    try {
      set({ isLoading: true });
      const worktreeResponse: GitChangedFilesResponse = await gitApi.getChangedFiles(
        currentRepoPath,
        null,
        false,
      );
      const status = get().gitStatus ?? await gitApi.getStatus(currentRepoPath);
      const { compareMode, compareBaseRef } = get();
      const compareRequest = getCompareRequest(compareMode, status, compareBaseRef);
      const compareResponse: GitChangedFilesResponse | null = await gitApi
        .getChangedFiles(
          currentRepoPath,
          compareRequest.baseBranch,
          compareRequest.usePreferredCompare,
          {
            baseRef: compareRequest.baseRef,
            commitRef: compareRequest.commitRef,
          },
        )
        .catch((error) => {
          console.error('Failed to refresh compare changes:', error);
          return null;
        });
      if (!isCurrentRequest()) return;
      const currentState = get();
      const shouldApplyCompare =
        currentState.compareMode === compareMode &&
        currentState.compareBaseRef === compareBaseRef;
      set({
        stagedFiles: worktreeResponse.staged_files,
        unstagedFiles: worktreeResponse.unstaged_files,
        untrackedFiles: worktreeResponse.untracked_files,
        ...(shouldApplyCompare
          ? {
              compareFiles: compareResponse?.compare_ref
                ? [
                    ...compareResponse.staged_files,
                    ...compareResponse.unstaged_files,
                    ...compareResponse.untracked_files,
                  ]
                : [],
              compareRef: compareResponse?.compare_ref ?? null,
              compareMode,
              compareBaseRef,
            }
          : {}),
        totalAdditions: worktreeResponse.total_additions,
        totalDeletions: worktreeResponse.total_deletions,
        isBranchPublished: worktreeResponse.is_branch_published,
      });
    } catch (error) {
      console.error('Failed to refresh changed files:', error);
      if (!isCurrentRequest()) return;
      set({
        stagedFiles: [],
        unstagedFiles: [],
        untrackedFiles: [],
        compareFiles: [],
        compareRef: null,
        compareMode: 'branch',
        compareBaseRef: null,
        totalAdditions: 0,
        totalDeletions: 0,
      });
    } finally {
      if (isCurrentRequest()) {
        set({ isLoading: false });
      }
    }
  },

  // 选择文件
  selectFile: (filePath) => {
    set({ selectedFilePath: filePath });
  },

  // 提交更改
  commitChanges: async (message: string) => {
    const { currentRepoPath } = get();
    if (!currentRepoPath) return;

    try {
      set({ isLoading: true });
      await gitApi.commit(currentRepoPath, message);
      
      // 刷新状态
      await get().refreshGitStatus();
      await get().refreshChangedFiles();
    } catch (error) {
      console.error('Failed to commit changes:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // 推送更改
  pushChanges: async () => {
    const { currentRepoPath } = get();
    if (!currentRepoPath) return;

    try {
      set({ isLoading: true });
      await gitApi.push(currentRepoPath);
      
      // 刷新状态
      await get().refreshGitStatus();
      await get().refreshChangedFiles();
    } catch (error) {
      try {
        await get().refreshRepositoryState({ fetchRemote: true });
      } catch (refreshError) {
        console.error('Failed to refresh repository state after push error:', refreshError);
      }
      if (!(get().gitStatus?.has_merge_conflicts || isConflictActionError(error))) {
        console.error('Failed to push changes:', error);
      }
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // 暂存文件
  stageFiles: async (files: string[]) => {
    const { currentRepoPath } = get();
    if (!currentRepoPath || files.length === 0) return;

    try {
      set({ isLoading: true });
      await gitApi.stage(currentRepoPath, files);
      await get().refreshChangedFiles();
      await get().refreshGitStatus();
    } catch (error) {
      console.error('Failed to stage files:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // 取消暂存文件
  unstageFiles: async (files: string[]) => {
    const { currentRepoPath } = get();
    if (!currentRepoPath || files.length === 0) return;

    try {
      set({ isLoading: true });
      await gitApi.unstage(currentRepoPath, files);
      await get().refreshChangedFiles();
      await get().refreshGitStatus();
    } catch (error) {
      console.error('Failed to unstage files:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // 放弃未暂存的更改
  discardUnstagedChanges: async (files: string[]) => {
    const { currentRepoPath } = get();
    if (!currentRepoPath || files.length === 0) return;

    try {
      set({ isLoading: true });
      await gitApi.discardUnstaged(currentRepoPath, files);
      await get().refreshChangedFiles();
      await get().refreshGitStatus();
    } catch (error) {
      console.error('Failed to discard unstaged changes:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // 放弃未追踪文件
  discardUntrackedFiles: async (files: string[]) => {
    const { currentRepoPath } = get();
    if (!currentRepoPath || files.length === 0) return;

    try {
      set({ isLoading: true });
      await gitApi.discardUntracked(currentRepoPath, files);
      await get().refreshChangedFiles();
      await get().refreshGitStatus();
    } catch (error) {
      console.error('Failed to discard untracked files:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // 暂存所有未暂存的更改
  stageAllUnstaged: async () => {
    const { unstagedFiles } = get();
    const files = unstagedFiles.map(f => f.path);
    await get().stageFiles(files);
  },

  // 暂存所有未追踪的文件
  stageAllUntracked: async () => {
    const { untrackedFiles } = get();
    const files = untrackedFiles.map(f => f.path);
    await get().stageFiles(files);
  },

  // 取消暂存所有文件
  unstageAll: async () => {
    const { stagedFiles } = get();
    const files = stagedFiles.map(f => f.path);
    await get().unstageFiles(files);
  },

  // 放弃所有未暂存的更改
  discardAllUnstaged: async () => {
    const { unstagedFiles } = get();
    const files = unstagedFiles.map(f => f.path);
    await get().discardUnstagedChanges(files);
  },

  // 放弃所有未追踪的文件
  discardAllUntracked: async () => {
    const { untrackedFiles } = get();
    const files = untrackedFiles.map(f => f.path);
    await get().discardUntrackedFiles(files);
  },

  // 拉取更改
  pullChanges: async () => {
    const { currentRepoPath } = get();
    if (!currentRepoPath) return;

    try {
      set({ isLoading: true });
      await gitApi.pull(currentRepoPath);
      await get().refreshGitStatus();
      await get().refreshChangedFiles();
    } catch (error) {
      try {
        await get().refreshRepositoryState({ fetchRemote: false });
      } catch (refreshError) {
        console.error('Failed to refresh repository state after pull error:', refreshError);
      }
      if (!(get().gitStatus?.has_merge_conflicts || isConflictActionError(error))) {
        console.error('Failed to pull changes:', error);
      }
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // 获取远程更改
  fetchChanges: async () => {
    const { currentRepoPath } = get();
    if (!currentRepoPath) return;

    try {
      set({ isLoading: true });
      await gitApi.fetch(currentRepoPath);
      await get().refreshGitStatus();
    } catch (error) {
      console.error('Failed to fetch changes:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  // 同步本地与远端
  syncChanges: async () => {
    const { currentRepoPath } = get();
    if (!currentRepoPath) return;

    try {
      set({ isLoading: true });
      await gitApi.sync(currentRepoPath);
      await get().refreshGitStatus();
      await get().refreshChangedFiles();
    } catch (error) {
      try {
        await get().refreshRepositoryState({ fetchRemote: true });
      } catch (refreshError) {
        console.error('Failed to refresh repository state after sync error:', refreshError);
      }
      if (!(get().gitStatus?.has_merge_conflicts || isConflictActionError(error))) {
        console.error('Failed to sync changes:', error);
      }
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  compareAgainstDefaultBranch: async () => {
    const { currentRepoPath } = get();
    if (!currentRepoPath) return;

    try {
      set({ isLoading: true, compareMode: 'default-branch', compareBaseRef: null });
      await get().refreshRepositoryState({ fetchRemote: true });
    } catch (error) {
      console.error('Failed to compare against default branch:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  compareAgainstRef: async (baseRef: string) => {
    const { currentRepoPath } = get();
    if (!currentRepoPath || !baseRef.trim()) return;

    try {
      set({
        isLoading: true,
        compareMode: 'ref',
        compareBaseRef: baseRef.trim(),
      });
      await get().refreshChangedFiles();
    } catch (error) {
      console.error('Failed to compare against ref:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  compareWorktreeChanges: async () => {
    const { currentRepoPath } = get();
    if (!currentRepoPath) return;

    try {
      set({ isLoading: true, compareMode: 'worktree', compareBaseRef: null });
      await get().refreshChangedFiles();
    } catch (error) {
      console.error('Failed to compare worktree changes:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  resetCompareMode: () => {
    invalidateGitRefreshRequests();
    set({
      compareFiles: [],
      compareRef: null,
      compareMode: 'branch',
      compareBaseRef: null,
      isLoading: false,
    });
    useGitInfoStore.setState({ isLoadingStatus: false });
  },

  resetForConnectionChange: () => {
    invalidateGitRefreshRequests();
    set({
      currentRepoPath: null,
      gitStatus: null,
      stagedFiles: [],
      unstagedFiles: [],
      untrackedFiles: [],
      compareFiles: [],
      compareRef: null,
      compareMode: 'branch',
      compareBaseRef: null,
      totalAdditions: 0,
      totalDeletions: 0,
      isBranchPublished: true,
      isLoading: false,
      selectedFilePath: null,
    });
  },
}));
