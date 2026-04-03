'use client';

import { create } from 'zustand';
import { gitApi, GitChangedFile, GitChangedFilesResponse, GitStatusResponse } from '@/api/ws-api';
import { useGitInfoStore } from './use-git-info-store';

// ===== 类型定义 =====

interface GitStore {
  // 状态
  currentRepoPath: string | null;
  gitStatus: GitStatusResponse | null;
  
  // 分类的变更文件
  stagedFiles: GitChangedFile[];
  unstagedFiles: GitChangedFile[];
  untrackedFiles: GitChangedFile[];
  
  totalAdditions: number;
  totalDeletions: number;
  isBranchPublished: boolean;
  isLoading: boolean;
  selectedFilePath: string | null;

  // 动作
  setCurrentRepoPath: (path: string | null) => void;
  refreshGitStatus: () => Promise<void>;
  refreshChangedFiles: () => Promise<void>;
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
  totalAdditions: 0,
  totalDeletions: 0,
  isBranchPublished: true,
  isLoading: false,
  selectedFilePath: null,

  // 设置当前仓库路径
  setCurrentRepoPath: (path) => {
    set({ currentRepoPath: path });
    if (path) {
      // 自动刷新状态
      get().refreshGitStatus();
      get().refreshChangedFiles();
    } else {
      // 清除状态当没有路径时
      set({
        gitStatus: null,
        stagedFiles: [],
        unstagedFiles: [],
        untrackedFiles: [],
        totalAdditions: 0,
        totalDeletions: 0,
      });
      useGitInfoStore.setState({
        currentBranch: null,
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
        uncommittedCount: 0,
        unpushedCount: 0,
        defaultBranch: null,
        defaultBranchAhead: null,
        defaultBranchBehind: null,
        githubOwner: null,
        githubRepo: null,
      });
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
        hasUnpushedCommits: status.has_unpushed_commits,
        uncommittedCount: status.uncommitted_count,
        unpushedCount: status.unpushed_count,
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

    try {
      set({ isLoading: true });
      const response: GitChangedFilesResponse = await gitApi.getChangedFiles(
        currentRepoPath,
        null,
      );
      set({
        stagedFiles: response.staged_files,
        unstagedFiles: response.unstaged_files,
        untrackedFiles: response.untracked_files,
        totalAdditions: response.total_additions,
        totalDeletions: response.total_deletions,
        isBranchPublished: response.is_branch_published,
      });
    } catch (error) {
      console.error('Failed to refresh changed files:', error);
      set({ stagedFiles: [], unstagedFiles: [], untrackedFiles: [], totalAdditions: 0, totalDeletions: 0 });
    } finally {
      set({ isLoading: false });
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
      console.error('Failed to push changes:', error);
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
      console.error('Failed to pull changes:', error);
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
      console.error('Failed to sync changes:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },
}));
