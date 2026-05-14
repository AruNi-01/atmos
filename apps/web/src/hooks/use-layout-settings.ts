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
  loadSettings: () => Promise<void>;
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

  loadSettings: async () => {
    if (get().loaded) return;
    try {
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
    const previous = get().projectFilesSide;
    set({ projectFilesSide: value });
    try {
      await functionSettingsApi.update('layout', 'project_files_side', value);
    } catch {
      set({ projectFilesSide: previous });
    }
  },

  setWorkspaceSidebarTwoColumn: async (value) => {
    const previous = get().workspaceSidebarTwoColumn;
    set({ workspaceSidebarTwoColumn: value });
    try {
      await functionSettingsApi.update('layout', 'workspace_sidebar_two_column', value);
    } catch {
      set({ workspaceSidebarTwoColumn: previous });
    }
  },

  setWorkspaceSidebarTwoColumnShowPinned: async (value) => {
    const previous = get().workspaceSidebarTwoColumnShowPinned;
    set({ workspaceSidebarTwoColumnShowPinned: value });
    try {
      await functionSettingsApi.update('layout', 'workspace_sidebar_two_column_show_pinned', value);
    } catch {
      set({ workspaceSidebarTwoColumnShowPinned: previous });
    }
  },

  setWorkspaceSidebarSecondColumnKanban: async (value) => {
    const previous = get().workspaceSidebarSecondColumnKanban;
    set({ workspaceSidebarSecondColumnKanban: value });
    try {
      await functionSettingsApi.update('layout', 'workspace_sidebar_second_column_kanban', value);
    } catch {
      set({ workspaceSidebarSecondColumnKanban: previous });
    }
  },

  setWorkspaceSidebarTimeTwoColumn: async (value) => {
    const previous = get().workspaceSidebarTimeTwoColumn;
    set({ workspaceSidebarTimeTwoColumn: value });
    try {
      await functionSettingsApi.update('layout', 'workspace_sidebar_time_two_column', value);
    } catch {
      set({ workspaceSidebarTimeTwoColumn: previous });
    }
  },

  setWorkspaceSidebarStatusTwoColumn: async (value) => {
    const previous = get().workspaceSidebarStatusTwoColumn;
    set({ workspaceSidebarStatusTwoColumn: value });
    try {
      await functionSettingsApi.update('layout', 'workspace_sidebar_status_two_column', value);
    } catch {
      set({ workspaceSidebarStatusTwoColumn: previous });
    }
  },
}));
