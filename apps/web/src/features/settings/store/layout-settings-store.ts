'use client';

import { create } from 'zustand';
import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';

export type ProjectFilesSide = 'left' | 'right';

export interface FooterLayoutPrefs {
  showWsConnection: boolean;
  showLocalServices: boolean;
  showUsageCarousel: boolean;
  showAgentStatus: boolean;
}

export interface HeaderLayoutPrefs {
  showHeaderSummary: boolean;
  showHeaderSummaryTask: boolean;
  showHeaderSummaryNote: boolean;
  showHeaderSummaryCommit: boolean;
}

interface LayoutSettingsState extends FooterLayoutPrefs, HeaderLayoutPrefs {
  projectFilesSide: ProjectFilesSide;
  workspaceSidebarTwoColumn: boolean;
  workspaceSidebarTwoColumnShowPinned: boolean;
  workspaceSidebarSecondColumnKanban: boolean;
  workspaceSidebarTimeTwoColumn: boolean;
  workspaceSidebarStatusTwoColumn: boolean;
  loaded: boolean;
  loadSettings: (force?: boolean) => Promise<void>;
  setProjectFilesSide: (value: ProjectFilesSide) => Promise<void>;
  setWorkspaceSidebarTwoColumn: (value: boolean) => Promise<void>;
  setWorkspaceSidebarTwoColumnShowPinned: (value: boolean) => Promise<void>;
  setWorkspaceSidebarSecondColumnKanban: (value: boolean) => Promise<void>;
  setWorkspaceSidebarTimeTwoColumn: (value: boolean) => Promise<void>;
  setWorkspaceSidebarStatusTwoColumn: (value: boolean) => Promise<void>;
  setFooterShowWsConnection: (value: boolean) => Promise<void>;
  setFooterShowLocalServices: (value: boolean) => Promise<void>;
  setFooterShowUsageCarousel: (value: boolean) => Promise<void>;
  setFooterShowAgentStatus: (value: boolean) => Promise<void>;
  setHeaderShowSummary: (value: boolean) => Promise<void>;
  setHeaderShowSummaryTask: (value: boolean) => Promise<void>;
  setHeaderShowSummaryNote: (value: boolean) => Promise<void>;
  setHeaderShowSummaryCommit: (value: boolean) => Promise<void>;
}

function readFooterLayout(layout: Record<string, unknown> | undefined): FooterLayoutPrefs {
  return {
    showWsConnection: layout?.footer_show_ws_connection !== false,
    showLocalServices: layout?.footer_show_local_services !== false,
    showUsageCarousel: layout?.footer_show_usage_carousel !== false,
    showAgentStatus: layout?.footer_show_agent_status !== false,
  };
}

function readHeaderLayout(layout: Record<string, unknown> | undefined): HeaderLayoutPrefs {
  const legacyTodo = layout?.header_show_todo;
  const legacyNote = layout?.header_show_note;
  const legacySummaryEnabled =
    legacyTodo === false && legacyNote === false ? false : true;

  return {
    showHeaderSummary:
      typeof layout?.header_summary_enabled === 'boolean'
        ? layout.header_summary_enabled
        : legacySummaryEnabled,
    showHeaderSummaryTask:
      typeof layout?.header_summary_show_task === 'boolean'
        ? layout.header_summary_show_task
        : legacyTodo !== false,
    showHeaderSummaryNote:
      typeof layout?.header_summary_show_note === 'boolean'
        ? layout.header_summary_show_note
        : legacyNote !== false,
    showHeaderSummaryCommit: layout?.header_summary_show_commit !== false,
  };
}

export const useLayoutSettingsStore = create<LayoutSettingsState>((set, get) => ({
  projectFilesSide: 'left',
  workspaceSidebarTwoColumn: false,
  workspaceSidebarTwoColumnShowPinned: false,
  workspaceSidebarSecondColumnKanban: false,
  workspaceSidebarTimeTwoColumn: false,
  workspaceSidebarStatusTwoColumn: false,
  showWsConnection: true,
  showLocalServices: true,
  showUsageCarousel: true,
  showAgentStatus: true,
  showHeaderSummary: true,
  showHeaderSummaryTask: true,
  showHeaderSummaryNote: true,
  showHeaderSummaryCommit: true,
  loaded: false,

  loadSettings: async (force = false) => {
    if (!force && get().loaded) return;
    try {
      if (force) {
        useFunctionSettingsStore.getState().invalidate();
      }
      const settings = await useFunctionSettingsStore.getState().load();
      const layout = settings.layout as Record<string, unknown> | undefined;
      const side = layout?.project_files_side;
      const footer = readFooterLayout(layout);
      const header = readHeaderLayout(layout);
      set({
        projectFilesSide: side === 'right' ? 'right' : 'left',
        workspaceSidebarTwoColumn: layout?.workspace_sidebar_two_column === true,
        workspaceSidebarTwoColumnShowPinned: layout?.workspace_sidebar_two_column_show_pinned === true,
        workspaceSidebarSecondColumnKanban: layout?.workspace_sidebar_second_column_kanban === true,
        workspaceSidebarTimeTwoColumn: layout?.workspace_sidebar_time_two_column === true,
        workspaceSidebarStatusTwoColumn: layout?.workspace_sidebar_status_two_column === true,
        ...footer,
        ...header,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  setProjectFilesSide: async (value) => {
    set({ projectFilesSide: value });
    try {
      await functionSettingsApi.update('layout', 'project_files_side', value);
    } catch {
      await get().loadSettings(true);
    }
  },

  setWorkspaceSidebarTwoColumn: async (value) => {
    set({ workspaceSidebarTwoColumn: value });
    try {
      await functionSettingsApi.update('layout', 'workspace_sidebar_two_column', value);
    } catch {
      await get().loadSettings(true);
    }
  },

  setWorkspaceSidebarTwoColumnShowPinned: async (value) => {
    set({ workspaceSidebarTwoColumnShowPinned: value });
    try {
      await functionSettingsApi.update('layout', 'workspace_sidebar_two_column_show_pinned', value);
    } catch {
      await get().loadSettings(true);
    }
  },

  setWorkspaceSidebarSecondColumnKanban: async (value) => {
    set({ workspaceSidebarSecondColumnKanban: value });
    try {
      await functionSettingsApi.update('layout', 'workspace_sidebar_second_column_kanban', value);
    } catch {
      await get().loadSettings(true);
    }
  },

  setWorkspaceSidebarTimeTwoColumn: async (value) => {
    set({ workspaceSidebarTimeTwoColumn: value });
    try {
      await functionSettingsApi.update('layout', 'workspace_sidebar_time_two_column', value);
    } catch {
      await get().loadSettings(true);
    }
  },

  setWorkspaceSidebarStatusTwoColumn: async (value) => {
    set({ workspaceSidebarStatusTwoColumn: value });
    try {
      await functionSettingsApi.update('layout', 'workspace_sidebar_status_two_column', value);
    } catch {
      await get().loadSettings(true);
    }
  },

  setFooterShowWsConnection: async (value) => {
    set({ showWsConnection: value });
    try {
      await functionSettingsApi.update('layout', 'footer_show_ws_connection', value);
    } catch {
      await get().loadSettings(true);
    }
  },

  setFooterShowLocalServices: async (value) => {
    set({ showLocalServices: value });
    try {
      await functionSettingsApi.update('layout', 'footer_show_local_services', value);
    } catch {
      await get().loadSettings(true);
    }
  },

  setFooterShowUsageCarousel: async (value) => {
    set({ showUsageCarousel: value });
    try {
      await functionSettingsApi.update('layout', 'footer_show_usage_carousel', value);
    } catch {
      await get().loadSettings(true);
    }
  },

  setFooterShowAgentStatus: async (value) => {
    set({ showAgentStatus: value });
    try {
      await functionSettingsApi.update('layout', 'footer_show_agent_status', value);
    } catch {
      await get().loadSettings(true);
    }
  },

  setHeaderShowSummary: async (value) => {
    set({ showHeaderSummary: value });
    try {
      await functionSettingsApi.update('layout', 'header_summary_enabled', value);
    } catch {
      await get().loadSettings(true);
    }
  },

  setHeaderShowSummaryTask: async (value) => {
    set({ showHeaderSummaryTask: value });
    try {
      await functionSettingsApi.update('layout', 'header_summary_show_task', value);
    } catch {
      await get().loadSettings(true);
    }
  },

  setHeaderShowSummaryNote: async (value) => {
    set({ showHeaderSummaryNote: value });
    try {
      await functionSettingsApi.update('layout', 'header_summary_show_note', value);
    } catch {
      await get().loadSettings(true);
    }
  },

  setHeaderShowSummaryCommit: async (value) => {
    set({ showHeaderSummaryCommit: value });
    try {
      await functionSettingsApi.update('layout', 'header_summary_show_commit', value);
    } catch {
      await get().loadSettings(true);
    }
  },
}));
