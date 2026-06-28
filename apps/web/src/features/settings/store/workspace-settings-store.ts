'use client';

import { createTranslator } from 'next-intl';
import { create } from 'zustand';
import { toastManager } from '@workspace/ui';

import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';
import { currentAppLocale } from '@/shared/lib/current-app-locale';
import enMessages from '../../../../messages/en.json';
import zhMessages from '../../../../messages/zh.json';

interface WorkspaceSettingsState {
  closePrOnDelete: boolean;
  closeIssueOnDelete: boolean;
  deleteRemoteBranch: boolean;
  confirmBeforeDelete: boolean;
  branchPrefix: string;
  confirmBeforeArchive: boolean;
  killTmuxOnArchive: boolean;
  closeAcpOnArchive: boolean;
  loaded: boolean;
  loading: boolean;
  loadRequestToken: number;
  loadSettings: () => Promise<void>;
  setClosePrOnDelete: (value: boolean) => Promise<void>;
  setCloseIssueOnDelete: (value: boolean) => Promise<void>;
  setDeleteRemoteBranch: (value: boolean) => Promise<void>;
  setConfirmBeforeDelete: (value: boolean) => Promise<void>;
  setBranchPrefix: (value: string) => Promise<void>;
  setConfirmBeforeArchive: (value: boolean) => Promise<void>;
  setKillTmuxOnArchive: (value: boolean) => Promise<void>;
  setCloseAcpOnArchive: (value: boolean) => Promise<void>;
}

type SettingsLocale = 'en' | 'zh';

let cachedLocale: SettingsLocale | null = null;
let cachedTranslator: ReturnType<typeof createTranslator> | null = null;

function workspaceSettingsT(key: string, values?: Record<string, string | number>) {
  const locale: SettingsLocale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedTranslator || cachedLocale !== locale) {
    cachedLocale = locale;
    cachedTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'settings.store.workspace',
    });
  }

  return cachedTranslator(key as never, values as never);
}

const DEFAULT_CLOSE_PR = false;
const DEFAULT_CLOSE_ISSUE = false;
const DEFAULT_DELETE_REMOTE = false;
const DEFAULT_CONFIRM = true;
const DEFAULT_BRANCH_PREFIX = 'atmos';
const DEFAULT_CONFIRM_ARCHIVE = false;
const DEFAULT_KILL_TMUX_ARCHIVE = true;
const DEFAULT_CLOSE_ACP_ARCHIVE = true;

export const useWorkspaceSettingsStore = create<WorkspaceSettingsState>((set, get) => ({
  closePrOnDelete: DEFAULT_CLOSE_PR,
  closeIssueOnDelete: DEFAULT_CLOSE_ISSUE,
  deleteRemoteBranch: DEFAULT_DELETE_REMOTE,
  confirmBeforeDelete: DEFAULT_CONFIRM,
  branchPrefix: DEFAULT_BRANCH_PREFIX,
  confirmBeforeArchive: DEFAULT_CONFIRM_ARCHIVE,
  killTmuxOnArchive: DEFAULT_KILL_TMUX_ARCHIVE,
  closeAcpOnArchive: DEFAULT_CLOSE_ACP_ARCHIVE,
  loaded: false,
  loading: false,
  loadRequestToken: 0,

  loadSettings: async () => {
    if (get().loaded || get().loading) return;

    const loadRequestToken = get().loadRequestToken + 1;
    set({ loading: true, loadRequestToken });

    try {
      const settings = await useFunctionSettingsStore.getState().load();
      const current = get();
      if (current.loadRequestToken !== loadRequestToken) return;

      const ws = settings.workspace_settings;
      set({
        closePrOnDelete: ws?.close_pr_on_delete ?? DEFAULT_CLOSE_PR,
        closeIssueOnDelete: ws?.close_issue_on_delete ?? DEFAULT_CLOSE_ISSUE,
        deleteRemoteBranch: ws?.delete_remote_branch ?? DEFAULT_DELETE_REMOTE,
        confirmBeforeDelete: ws?.confirm_before_delete ?? DEFAULT_CONFIRM,
        branchPrefix: ws?.branch_prefix ?? DEFAULT_BRANCH_PREFIX,
        confirmBeforeArchive: ws?.confirm_before_archive ?? DEFAULT_CONFIRM_ARCHIVE,
        killTmuxOnArchive: ws?.kill_tmux_on_archive ?? DEFAULT_KILL_TMUX_ARCHIVE,
        closeAcpOnArchive: ws?.close_acp_on_archive ?? DEFAULT_CLOSE_ACP_ARCHIVE,
        loaded: true,
        loading: false,
      });
    } catch {
      if (get().loadRequestToken === loadRequestToken) {
        set({ loaded: false, loading: false });
      }
    }
  },

  setClosePrOnDelete: async (value) => {
    const previous = get().closePrOnDelete;
    const token = get().loadRequestToken + 1;
    set({ closePrOnDelete: value, loadRequestToken: token });

    try {
      await functionSettingsApi.update('workspace_settings', 'close_pr_on_delete', value);
    } catch {
      if (get().loadRequestToken === token) {
        set({ closePrOnDelete: previous });
      }
      toastManager.add({
        title: workspaceSettingsT('syncFailedTitle'),
        description: workspaceSettingsT('closePrOnDeleteFailed'),
        type: 'error',
      });
    }
  },

  setCloseIssueOnDelete: async (value) => {
    const previous = get().closeIssueOnDelete;
    const token = get().loadRequestToken + 1;
    set({ closeIssueOnDelete: value, loadRequestToken: token });

    try {
      await functionSettingsApi.update('workspace_settings', 'close_issue_on_delete', value);
    } catch {
      if (get().loadRequestToken === token) {
        set({ closeIssueOnDelete: previous });
      }
      toastManager.add({
        title: workspaceSettingsT('syncFailedTitle'),
        description: workspaceSettingsT('closeIssueOnDeleteFailed'),
        type: 'error',
      });
    }
  },

  setDeleteRemoteBranch: async (value) => {
    const previous = get().deleteRemoteBranch;
    const token = get().loadRequestToken + 1;
    set({ deleteRemoteBranch: value, loadRequestToken: token });

    try {
      await functionSettingsApi.update('workspace_settings', 'delete_remote_branch', value);
    } catch {
      if (get().loadRequestToken === token) {
        set({ deleteRemoteBranch: previous });
      }
      toastManager.add({
        title: workspaceSettingsT('syncFailedTitle'),
        description: workspaceSettingsT('deleteRemoteBranchFailed'),
        type: 'error',
      });
    }
  },

  setConfirmBeforeDelete: async (value) => {
    const previous = get().confirmBeforeDelete;
    const token = get().loadRequestToken + 1;
    set({ confirmBeforeDelete: value, loadRequestToken: token });

    try {
      await functionSettingsApi.update('workspace_settings', 'confirm_before_delete', value);
    } catch {
      if (get().loadRequestToken === token) {
        set({ confirmBeforeDelete: previous });
      }
      toastManager.add({
        title: workspaceSettingsT('syncFailedTitle'),
        description: workspaceSettingsT('confirmBeforeDeleteFailed'),
        type: 'error',
      });
    }
  },

  setBranchPrefix: async (value) => {
    const previous = get().branchPrefix;
    const token = get().loadRequestToken + 1;
    set({ branchPrefix: value, loadRequestToken: token });

    try {
      await functionSettingsApi.update('workspace_settings', 'branch_prefix', value);
    } catch {
      if (get().loadRequestToken === token) {
        set({ branchPrefix: previous });
      }
      toastManager.add({
        title: workspaceSettingsT('syncFailedTitle'),
        description: workspaceSettingsT('branchPrefixFailed'),
        type: 'error',
      });
    }
  },

  setConfirmBeforeArchive: async (value) => {
    const previous = get().confirmBeforeArchive;
    const token = get().loadRequestToken + 1;
    set({ confirmBeforeArchive: value, loadRequestToken: token });

    try {
      await functionSettingsApi.update('workspace_settings', 'confirm_before_archive', value);
    } catch {
      if (get().loadRequestToken === token) {
        set({ confirmBeforeArchive: previous });
      }
      toastManager.add({
        title: workspaceSettingsT('syncFailedTitle'),
        description: workspaceSettingsT('confirmBeforeArchiveFailed'),
        type: 'error',
      });
    }
  },

  setKillTmuxOnArchive: async (value) => {
    const previous = get().killTmuxOnArchive;
    const token = get().loadRequestToken + 1;
    set({ killTmuxOnArchive: value, loadRequestToken: token });

    try {
      await functionSettingsApi.update('workspace_settings', 'kill_tmux_on_archive', value);
    } catch {
      if (get().loadRequestToken === token) {
        set({ killTmuxOnArchive: previous });
      }
      toastManager.add({
        title: workspaceSettingsT('syncFailedTitle'),
        description: workspaceSettingsT('killTmuxOnArchiveFailed'),
        type: 'error',
      });
    }
  },

  setCloseAcpOnArchive: async (value) => {
    const previous = get().closeAcpOnArchive;
    const token = get().loadRequestToken + 1;
    set({ closeAcpOnArchive: value, loadRequestToken: token });

    try {
      await functionSettingsApi.update('workspace_settings', 'close_acp_on_archive', value);
    } catch {
      if (get().loadRequestToken === token) {
        set({ closeAcpOnArchive: previous });
      }
      toastManager.add({
        title: workspaceSettingsT('syncFailedTitle'),
        description: workspaceSettingsT('closeAcpOnArchiveFailed'),
        type: 'error',
      });
    }
  },
}));
