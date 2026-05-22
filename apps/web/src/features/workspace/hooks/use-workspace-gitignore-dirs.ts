'use client';

import { create } from 'zustand';
import { toastManager } from '@workspace/ui';

import {
  workspaceGitignoreDirsApi,
  type GitIgnoreDirEntry,
  type GitIgnoreDirStrategy,
  type GitIgnoreDirsConfig,
} from '@/api/ws-api';

interface State {
  enabled: boolean;
  entries: GitIgnoreDirEntry[];
  loaded: boolean;
  loading: boolean;
  loadRequestToken: number;

  load: () => Promise<void>;
  setEnabled: (value: boolean) => Promise<void>;
  setStrategy: (id: string, strategy: GitIgnoreDirStrategy) => Promise<void>;
  addCustom: (path: string) => Promise<void>;
  removeCustom: (id: string) => Promise<void>;
  updateCustomPath: (id: string, path: string) => Promise<boolean>;
}

const persist = async (
  next: GitIgnoreDirsConfig,
  failureMessage: string,
): Promise<boolean> => {
  try {
    await workspaceGitignoreDirsApi.update(next);
    return true;
  } catch {
    toastManager.add({
      title: 'Settings Sync Failed',
      description: failureMessage,
      type: 'error',
    });
    return false;
  }
};

const normalizeRelativePath = (path: string): string =>
  path.trim().replace(/^\/+|\/+$/g, '');

const hasParentTraversal = (path: string): boolean =>
  path.split('/').some((part) => part === '..');

const toastInvalidPath = (): void => {
  toastManager.add({
    title: 'Invalid Path',
    description: 'Path cannot escape the project root (no `..` allowed).',
    type: 'error',
  });
};

export const useWorkspaceGitignoreDirs = create<State>((set, get) => ({
  enabled: true,
  entries: [],
  loaded: false,
  loading: false,
  loadRequestToken: 0,

  load: async () => {
    if (get().loaded || get().loading) return;
    const token = get().loadRequestToken + 1;
    set({ loading: true, loadRequestToken: token });
    try {
      const config = await workspaceGitignoreDirsApi.get();
      if (get().loadRequestToken !== token) return;
      set({
        enabled: config.enabled,
        entries: config.entries ?? [],
        loaded: true,
        loading: false,
      });
    } catch {
      if (get().loadRequestToken === token) {
        set({ loaded: false, loading: false });
      }
    }
  },

  setEnabled: async (value) => {
    const prev = get().enabled;
    set({ enabled: value });
    const ok = await persist(
      { enabled: value, entries: get().entries },
      'Failed to update GitIgnore directories master switch.',
    );
    if (!ok) set({ enabled: prev });
  },

  setStrategy: async (id, strategy) => {
    const prev = get().entries;
    const next = prev.map((e) => (e.id === id ? { ...e, strategy } : e));
    set({ entries: next });
    const ok = await persist(
      { enabled: get().enabled, entries: next },
      'Failed to update directory strategy.',
    );
    if (!ok) set({ entries: prev });
  },

  addCustom: async (path) => {
    const trimmed = normalizeRelativePath(path);
    if (!trimmed) return;
    if (hasParentTraversal(trimmed)) {
      toastInvalidPath();
      return;
    }
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newEntry: GitIgnoreDirEntry = {
      id,
      path: trimmed,
      strategy: 'symlink',
      builtin: false,
    };
    const prev = get().entries;
    const next = [...prev, newEntry];
    set({ entries: next });
    const ok = await persist(
      { enabled: get().enabled, entries: next },
      'Failed to add custom directory.',
    );
    if (!ok) set({ entries: prev });
  },

  removeCustom: async (id) => {
    const prev = get().entries;
    const target = prev.find((e) => e.id === id);
    if (!target || target.builtin) return;
    const next = prev.filter((e) => e.id !== id);
    set({ entries: next });
    const ok = await persist(
      { enabled: get().enabled, entries: next },
      'Failed to remove directory.',
    );
    if (!ok) set({ entries: prev });
  },

  updateCustomPath: async (id, path) => {
    const trimmed = normalizeRelativePath(path);
    if (!trimmed) return false;
    if (hasParentTraversal(trimmed)) {
      toastInvalidPath();
      return false;
    }
    const prev = get().entries;
    const target = prev.find((e) => e.id === id);
    if (!target || target.builtin) return false;
    const next = prev.map((e) => (e.id === id ? { ...e, path: trimmed } : e));
    set({ entries: next });
    const ok = await persist(
      { enabled: get().enabled, entries: next },
      'Failed to update directory path.',
    );
    if (!ok) {
      set({ entries: prev });
      return false;
    }
    return true;
  },
}));
