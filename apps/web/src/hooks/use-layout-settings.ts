'use client';

import { create } from 'zustand';
import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/hooks/use-function-settings-store';

export type ProjectFilesSide = 'left' | 'right';

interface LayoutSettingsState {
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
}

export const useLayoutSettings = create<LayoutSettingsState>((set, get) => ({
  projectFilesSide: 'left',
  workspaceSidebarTwoColumn: false,
  workspaceSidebarTwoColumnShowPinned: false,
  workspaceSidebarSecondColumnKanban: false,
  workspaceSidebarTimeTwoColumn: false,
  workspaceSidebarStatusTwoColumn: false,
  loaded: false,

  loadSettings: async (force = false) => {
    if (!force && get().loaded) return;
    try {
      if (force) {
        useFunctionSettingsStore.getState().invalidate();
      }
      const settings = await useFunctionSettingsStore.getState().load();
      const layout = settings.layout as {
        project_files_side?: string;
        workspace_sidebar_two_column?: boolean;
        workspace_sidebar_two_column_show_pinned?: boolean;
        workspace_sidebar_second_column_kanban?: boolean;
        workspace_sidebar_time_two_column?: boolean;
        workspace_sidebar_status_two_column?: boolean;
      } | undefined;
      const side = layout?.project_files_side;
      set({
        projectFilesSide: side === 'right' ? 'right' : 'left',
        workspaceSidebarTwoColumn: layout?.workspace_sidebar_two_column === true,
        workspaceSidebarTwoColumnShowPinned: layout?.workspace_sidebar_two_column_show_pinned === true,
        workspaceSidebarSecondColumnKanban: layout?.workspace_sidebar_second_column_kanban === true,
        workspaceSidebarTimeTwoColumn: layout?.workspace_sidebar_time_two_column === true,
        workspaceSidebarStatusTwoColumn: layout?.workspace_sidebar_status_two_column === true,
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
}));
