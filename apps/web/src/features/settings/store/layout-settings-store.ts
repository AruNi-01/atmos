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
  const legacySummaryEnabled = legacyTodo !== false;

  return {
    showHeaderSummary:
      typeof layout?.header_summary_enabled === 'boolean'
        ? layout.header_summary_enabled
        : legacySummaryEnabled,
    showHeaderSummaryTask:
      typeof layout?.header_summary_show_task === 'boolean'
        ? layout.header_summary_show_task
        : legacyTodo !== false,
    showHeaderSummaryCommit: layout?.header_summary_show_commit !== false,
  };
}

export const useLayoutSettingsStore = create<LayoutSettingsState>((set, get) => {
  const updateLayoutSetting = async (
    patch: Partial<LayoutSettingsState>,
    key: string,
    value: unknown,
  ) => {
    set(patch);
    try {
      await functionSettingsApi.update('layout', key, value);
    } catch {
      await get().loadSettings(true);
    }
  };

  return {
    projectFilesSide: 'right',
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
          projectFilesSide: side === 'left' ? 'left' : 'right',
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

    setProjectFilesSide: (value) =>
      updateLayoutSetting({ projectFilesSide: value }, 'project_files_side', value),

    setWorkspaceSidebarTwoColumn: (value) =>
      updateLayoutSetting({ workspaceSidebarTwoColumn: value }, 'workspace_sidebar_two_column', value),

    setWorkspaceSidebarTwoColumnShowPinned: (value) =>
      updateLayoutSetting(
        { workspaceSidebarTwoColumnShowPinned: value },
        'workspace_sidebar_two_column_show_pinned',
        value,
      ),

    setWorkspaceSidebarSecondColumnKanban: (value) =>
      updateLayoutSetting(
        { workspaceSidebarSecondColumnKanban: value },
        'workspace_sidebar_second_column_kanban',
        value,
      ),

    setWorkspaceSidebarTimeTwoColumn: (value) =>
      updateLayoutSetting(
        { workspaceSidebarTimeTwoColumn: value },
        'workspace_sidebar_time_two_column',
        value,
      ),

    setWorkspaceSidebarStatusTwoColumn: (value) =>
      updateLayoutSetting(
        { workspaceSidebarStatusTwoColumn: value },
        'workspace_sidebar_status_two_column',
        value,
      ),

    setFooterShowWsConnection: (value) =>
      updateLayoutSetting({ showWsConnection: value }, 'footer_show_ws_connection', value),

    setFooterShowLocalServices: (value) =>
      updateLayoutSetting({ showLocalServices: value }, 'footer_show_local_services', value),

    setFooterShowUsageCarousel: (value) =>
      updateLayoutSetting({ showUsageCarousel: value }, 'footer_show_usage_carousel', value),

    setFooterShowAgentStatus: (value) =>
      updateLayoutSetting({ showAgentStatus: value }, 'footer_show_agent_status', value),

    setHeaderShowSummary: (value) =>
      updateLayoutSetting({ showHeaderSummary: value }, 'header_summary_enabled', value),

    setHeaderShowSummaryTask: (value) =>
      updateLayoutSetting({ showHeaderSummaryTask: value }, 'header_summary_show_task', value),

    setHeaderShowSummaryCommit: (value) =>
      updateLayoutSetting({ showHeaderSummaryCommit: value }, 'header_summary_show_commit', value),
  };
});
