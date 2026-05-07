'use client';

import { create } from 'zustand';
import { fsApi, type FileTreeNode } from '@/api/ws-api';

interface FileTreeStoreState {
  data: FileTreeNode[];
  rootPath: string | null;
  projectId: string | null;
  workspaceId: string | null;
  showHidden: boolean;
  isLoading: boolean;
  fetchId: number;
  fetch: (projectId: string, workspaceId: string | null, rootPath: string, showHidden?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  setShowHidden: (show: boolean) => void;
  clear: () => void;
}

export const useFileTreeStore = create<FileTreeStoreState>((set, get) => ({
  data: [],
  rootPath: null,
  projectId: null,
  workspaceId: null,
  showHidden: false,
  isLoading: false,
  fetchId: 0,

  fetch: async (projectId, workspaceId, rootPath, showHidden) => {
    const id = get().fetchId + 1;
    const hidden = showHidden ?? get().showHidden;
    set({ fetchId: id, isLoading: true, data: [] });
    try {
      const response = await fsApi.listProjectFiles(rootPath, { showHidden: hidden });
      if (get().fetchId === id) {
        set({ data: response.tree, rootPath, projectId, workspaceId, showHidden: hidden, isLoading: false });
      }
    } catch {
      if (get().fetchId === id) {
        set({ data: [], rootPath, projectId, workspaceId, isLoading: false });
      }
    }
  },

  refresh: async () => {
    const { projectId, workspaceId, rootPath, showHidden } = get();
    if (projectId && rootPath) {
      await get().fetch(projectId, workspaceId, rootPath, showHidden);
    }
  },

  setShowHidden: (show) => {
    set({ showHidden: show });
    const { projectId, workspaceId, rootPath } = get();
    if (projectId && rootPath) {
      void get().fetch(projectId, workspaceId, rootPath, show);
    }
  },

  clear: () => set({ data: [], rootPath: null, projectId: null, workspaceId: null, isLoading: false }),
}));
