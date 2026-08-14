"use client";

import { create } from "zustand";

type PanelEntry = {
  isActive: boolean;
  tabCount: number;
  updatedAt: number;
};

type SessionBinding = {
  contextId: string;
  tabId: string;
};

type BrowserSessionMapStore = {
  panels: Record<string, PanelEntry>;
  bySession: Record<string, SessionBinding>;
  byTab: Record<string, string>;
  registerPanel: (contextId: string, entry: { isActive: boolean; tabCount: number }) => void;
  unregisterPanel: (contextId: string) => void;
  bindSession: (contextId: string, tabId: string, sessionId: string) => void;
  unbindTab: (tabId: string) => void;
  findBySession: (sessionId: string) => SessionBinding | null;
  sessionForTab: (tabId: string) => string | null;
  resolveContext: (targetSessionId?: string) => {
    ok: boolean;
    contextId?: string;
    error?: string;
    error_code?: string;
  };
};

export const useBrowserSessionMapStore = create<BrowserSessionMapStore>((set, get) => ({
  panels: {},
  bySession: {},
  byTab: {},
  registerPanel: (contextId, entry) => {
    set((state) => ({
      panels: {
        ...state.panels,
        [contextId]: {
          isActive: entry.isActive,
          tabCount: entry.tabCount,
          updatedAt: Date.now(),
        },
      },
    }));
  },
  unregisterPanel: (contextId) => {
    set((state) => {
      const nextPanels = { ...state.panels };
      delete nextPanels[contextId];
      const nextBySession = { ...state.bySession };
      const nextByTab = { ...state.byTab };
      for (const [sessionId, binding] of Object.entries(state.bySession)) {
        if (binding.contextId !== contextId) continue;
        delete nextBySession[sessionId];
        delete nextByTab[binding.tabId];
      }
      return { panels: nextPanels, bySession: nextBySession, byTab: nextByTab };
    });
  },
  bindSession: (contextId, tabId, sessionId) => {
    set((state) => {
      const previousSession = state.byTab[tabId];
      const nextBySession = { ...state.bySession };
      const nextByTab = { ...state.byTab };
      if (previousSession && previousSession !== sessionId) {
        delete nextBySession[previousSession];
      }
      nextBySession[sessionId] = { contextId, tabId };
      nextByTab[tabId] = sessionId;
      return { bySession: nextBySession, byTab: nextByTab };
    });
  },
  unbindTab: (tabId) => {
    set((state) => {
      const sessionId = state.byTab[tabId];
      if (!sessionId) return state;
      const nextBySession = { ...state.bySession };
      const nextByTab = { ...state.byTab };
      delete nextBySession[sessionId];
      delete nextByTab[tabId];
      return { bySession: nextBySession, byTab: nextByTab };
    });
  },
  findBySession: (sessionId) => get().bySession[sessionId] ?? null,
  sessionForTab: (tabId) => get().byTab[tabId] ?? null,
  resolveContext: (targetSessionId) => {
    const state = get();
    if (targetSessionId) {
      const bound = state.bySession[targetSessionId];
      if (bound) return { ok: true, contextId: bound.contextId };
      return {
        ok: false,
        error: `unknown target_id ${targetSessionId}`,
        error_code: "browser_route_unavailable",
      };
    }
    const entries = Object.entries(state.panels);
    if (entries.length === 0) {
      return {
        ok: false,
        error: "no Atmos Browser panel is mounted; open a Browser tab first",
        error_code: "embedded_browser_host_unavailable",
      };
    }
    if (entries.length === 1) {
      return { ok: true, contextId: entries[0][0] };
    }
    const active = entries.filter(([, panel]) => panel.isActive);
    if (active.length === 1) {
      return { ok: true, contextId: active[0][0] };
    }
    return {
      ok: false,
      error: "multiple Browser panels are open; pass --target-id of a tab in the desired panel",
      error_code: "browser_ambiguous_target",
    };
  },
}));
