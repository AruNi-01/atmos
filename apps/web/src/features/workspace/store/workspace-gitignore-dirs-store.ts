'use client';

import { create } from 'zustand';
import { toastManager } from '@workspace/ui';
import { createTranslator } from 'next-intl';

import {
  workspaceGitignoreDirsApi,
  type GitIgnoreDirEntry,
  type GitIgnoreDirStrategy,
  type GitIgnoreDirsConfig,
} from '@/api/ws-api';
import enMessages from '../../../../messages/en.json';
import zhMessages from '../../../../messages/zh.json';
import { currentAppLocale } from '@/shared/lib/current-app-locale';

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

type WorkspaceGitignoreDirMessages = {
  settingsSyncFailedTitle: string;
  invalidPathTitle: string;
  invalidPathDescription: string;
  failedMasterSwitch: string;
  failedStrategy: string;
  failedAddCustom: string;
  failedRemoveDirectory: string;
  failedUpdatePath: string;
};

let cachedWorkspaceGitignoreLocale: 'en' | 'zh' | null = null;
let cachedWorkspaceGitignoreTranslator: any = null;

function workspaceGitignoreT(key: keyof WorkspaceGitignoreDirMessages): string {
  const locale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedWorkspaceGitignoreTranslator || cachedWorkspaceGitignoreLocale !== locale) {
    cachedWorkspaceGitignoreLocale = locale;
    cachedWorkspaceGitignoreTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'Workspace.components.gitignoreStore',
    });
  }
  return cachedWorkspaceGitignoreTranslator(key as never);
}

function getDefaultWorkspaceGitignoreDirMessages(): WorkspaceGitignoreDirMessages {
  return {
    settingsSyncFailedTitle: workspaceGitignoreT('settingsSyncFailedTitle'),
    invalidPathTitle: workspaceGitignoreT('invalidPathTitle'),
    invalidPathDescription: workspaceGitignoreT('invalidPathDescription'),
    failedMasterSwitch: workspaceGitignoreT('failedMasterSwitch'),
    failedStrategy: workspaceGitignoreT('failedStrategy'),
    failedAddCustom: workspaceGitignoreT('failedAddCustom'),
    failedRemoveDirectory: workspaceGitignoreT('failedRemoveDirectory'),
    failedUpdatePath: workspaceGitignoreT('failedUpdatePath'),
  };
}

let workspaceGitignoreDirMessages: WorkspaceGitignoreDirMessages =
  getDefaultWorkspaceGitignoreDirMessages();

export function setWorkspaceGitignoreDirsMessages(next: WorkspaceGitignoreDirMessages) {
  workspaceGitignoreDirMessages = next;
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
      title: workspaceGitignoreDirMessages.settingsSyncFailedTitle,
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
    title: workspaceGitignoreDirMessages.invalidPathTitle,
    description: workspaceGitignoreDirMessages.invalidPathDescription,
    type: 'error',
  });
};

export const useWorkspaceGitignoreDirsStore = create<State>((set, get) => ({
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
      workspaceGitignoreDirMessages.failedMasterSwitch,
    );
    if (!ok) set({ enabled: prev });
  },

  setStrategy: async (id, strategy) => {
    const prev = get().entries;
    const next = prev.map((e) => (e.id === id ? { ...e, strategy } : e));
    set({ entries: next });
    const ok = await persist(
      { enabled: get().enabled, entries: next },
      workspaceGitignoreDirMessages.failedStrategy,
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
      workspaceGitignoreDirMessages.failedAddCustom,
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
      workspaceGitignoreDirMessages.failedRemoveDirectory,
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
      workspaceGitignoreDirMessages.failedUpdatePath,
    );
    if (!ok) {
      set({ entries: prev });
      return false;
    }
    return true;
  },
}));
