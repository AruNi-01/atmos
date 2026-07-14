'use client';

import { create } from 'zustand';

/**
 * UI-location state for the file tree panel.
 *
 * This store no longer owns server data (moved to TanStack Query via
 * useFileTreeQuery). It tracks which project/workspace/root path the panel is
 * currently scoped to, and the user's showHidden preference.
 *
 * Data consumers: use useFileTreeQuery(rootPath, showHidden) from
 * features/files/hooks/use-file-tree-query.ts instead.
 */
interface FileTreeStoreState {
  rootPath: string | null;
  projectId: string | null;
  workspaceId: string | null;
  showHidden: boolean;
  /** Update the tracked context when the active project/workspace/path changes. */
  setContext: (projectId: string, workspaceId: string | null, rootPath: string) => void;
  /** Toggle the hidden-files preference; Query key changes automatically trigger a re-fetch. */
  setShowHidden: (show: boolean) => void;
  /** Reset to empty state on connection target change. */
  clear: () => void;
}

export const useFileTreeStore = create<FileTreeStoreState>((set) => ({
  rootPath: null,
  projectId: null,
  workspaceId: null,
  showHidden: false,

  setContext: (projectId, workspaceId, rootPath) => {
    set({ projectId, workspaceId, rootPath });
  },

  setShowHidden: (show) => {
    set({ showHidden: show });
  },

  clear: () => set({ rootPath: null, projectId: null, workspaceId: null }),
}));
