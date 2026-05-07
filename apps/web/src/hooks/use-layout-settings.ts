'use client';

import { create } from 'zustand';
import { functionSettingsApi } from '@/api/ws-api';

export type ProjectFilesSide = 'left' | 'right';

interface LayoutSettingsState {
  projectFilesSide: ProjectFilesSide;
  loaded: boolean;
  loadSettings: () => Promise<void>;
  setProjectFilesSide: (value: ProjectFilesSide) => Promise<void>;
}

export const useLayoutSettings = create<LayoutSettingsState>((set, get) => ({
  projectFilesSide: 'left',
  loaded: false,

  loadSettings: async () => {
    if (get().loaded) return;
    try {
      const settings = await functionSettingsApi.get();
      const layout = settings.layout as { project_files_side?: string } | undefined;
      const side = layout?.project_files_side;
      set({
        projectFilesSide: side === 'right' ? 'right' : 'left',
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
}));
