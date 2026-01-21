'use client';

import { create } from 'zustand';
import { gitApi, GitChangedFile, GitChangedFilesResponse, GitStatusResponse } from '@/api/ws-api';

// ===== 类型定义 =====

interface GitStore {
  // 状态
  currentRepoPath: string | null;
  gitStatus: GitStatusResponse | null;
  changedFiles: GitChangedFile[];
  totalAdditions: number;
  totalDeletions: number;
  isLoading: boolean;
  selectedFilePath: string | null;

  // 动作
  setCurrentRepoPath: (path: string | null) => void;
  refreshGitStatus: () => Promise<void>;
  refreshChangedFiles: () => Promise<void>;
  selectFile: (filePath: string | null) => void;
  commitChanges: (message: string) => Promise<void>;
  pushChanges: () => Promise<void>;
}

export const useGitStore = create<GitStore>((set, get) => ({
  // 初始状态
  currentRepoPath: null,
  gitStatus: null,
  changedFiles: [],
  totalAdditions: 0,
  totalDeletions: 0,
  isLoading: false,
  selectedFilePath: null,

  // 设置当前仓库路径
  setCurrentRepoPath: (path) => {
    set({ currentRepoPath: path });
    if (path) {
      // 自动刷新状态
      get().refreshGitStatus();
      get().refreshChangedFiles();
    }
  },

  // 刷新 Git 状态
  refreshGitStatus: async () => {
    const { currentRepoPath } = get();
    if (!currentRepoPath) return;

    try {
      set({ isLoading: true });
      const status = await gitApi.getStatus(currentRepoPath);
      set({ gitStatus: status });
    } catch (error) {
      console.error('Failed to refresh git status:', error);
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
      const response: GitChangedFilesResponse = await gitApi.getChangedFiles(currentRepoPath);
      set({
        changedFiles: response.files,
        totalAdditions: response.total_additions,
        totalDeletions: response.total_deletions,
      });
    } catch (error) {
      console.error('Failed to refresh changed files:', error);
      set({ changedFiles: [], totalAdditions: 0, totalDeletions: 0 });
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
    } catch (error) {
      console.error('Failed to push changes:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },
}));
