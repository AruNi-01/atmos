'use client';

import { create } from 'zustand';
import { fsApi } from '@/api/ws-api';

const LAYOUT_PATH = '~/.atmos/layout/agent_chat_panel.json';

interface PanelLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

const DEFAULT_LAYOUT: PanelLayout = {
  x: -1,
  y: -1,
  width: 461,
  height: 701,
  opacity: 100,
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist(layout: PanelLayout) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fsApi.writeFile(LAYOUT_PATH, JSON.stringify(layout, null, 2)).catch(() => {});
  }, 500);
}

interface AgentChatLayoutStore {
  layout: PanelLayout;
  loaded: boolean;
  loadLayout: () => void;
  updateLayout: (partial: Partial<PanelLayout>) => void;
}

let _layoutLoading = false;

export const useAgentChatLayout = create<AgentChatLayoutStore>((set, get) => ({
  layout: DEFAULT_LAYOUT,
  loaded: false,

  loadLayout: () => {
    if (get().loaded || _layoutLoading) return;
    _layoutLoading = true;
    fsApi.readFile(LAYOUT_PATH).then((res) => {
      if (res.exists && res.content) {
        try {
          const parsed = JSON.parse(res.content) as Partial<PanelLayout>;
          set({
            layout: {
              x: parsed.x ?? DEFAULT_LAYOUT.x,
              y: parsed.y ?? DEFAULT_LAYOUT.y,
              width: parsed.width ?? DEFAULT_LAYOUT.width,
              height: parsed.height ?? DEFAULT_LAYOUT.height,
              opacity: parsed.opacity ?? DEFAULT_LAYOUT.opacity,
            },
            loaded: true,
          });
        } catch {
          set({ loaded: true });
        }
      } else {
        set({ loaded: true });
      }
    }).catch(() => {
      set({ loaded: true });
    }).finally(() => {
      _layoutLoading = false;
    });
  },

  updateLayout: (partial) => {
    const next = { ...get().layout, ...partial };
    set({ layout: next });
    persist(next);
  },
}));
