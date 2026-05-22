'use client';

import { create } from 'zustand';
import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/features/settings/hooks/use-function-settings-store';

export type ProjectFilesSide = 'left' | 'right';

export interface FooterLayoutPrefs {
  showWsConnection: boolean;
  showUsageCarousel: boolean;
  showAgentStatus: boolean;
}

interface LayoutSettingsState extends FooterLayoutPrefs {
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
  setFooterShowUsageCarousel: (value: boolean) => Promise<void>;
  setFooterShowAgentStatus: (value: boolean) => Promise<void>;
}

function readFooterLayout(layout: Record<string, unknown> | undefined): FooterLayoutPrefs {
  return {
    showWsConnection: layout?.footer_show_ws_connection !== false,
    showUsageCarousel: layout?.footer_show_usage_carousel !== false,
    showAgentStatus: layout?.footer_show_agent_status !== false,
  };
}

export const useLayoutSettings = create<LayoutSettingsState>((set, get) => ({
  projectFilesSide: 'left',
  workspaceSidebarTwoColumn: false,
  workspaceSidebarTwoColumnShowPinned: false,
  workspaceSidebarSecondColumnKanban: false,
  workspaceSidebarTimeTwoColumn: false,
  workspaceSidebarStatusTwoColumn: false,
  showWsConnection: true,
  showUsageCarousel: true,
  showAgentStatus: true,
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
      set({
        projectFilesSide: side === 'right' ? 'right' : 'left',
        workspaceSidebarTwoColumn: layout?.workspace_sidebar_two_column === true,
        workspaceSidebarTwoColumnShowPinned: layout?.workspace_sidebar_two_column_show_pinned === true,
        workspaceSidebarSecondColumnKanban: layout?.workspace_sidebar_second_column_kanban === true,
        workspaceSidebarTimeTwoColumn: layout?.workspace_sidebar_time_two_column === true,
        workspaceSidebarStatusTwoColumn: layout?.workspace_sidebar_status_two_column === true,
        ...footer,
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
}));
