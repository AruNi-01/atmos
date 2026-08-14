"use client";

import { create } from "zustand";

import {
  resolveBrowserContext,
  type ResolveBrowserContextResult,
} from "./resolve-browser-context";

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
  resolveContext: (
    targetSessionId?: string,
    preferredSessionId?: string,
  ) => ResolveBrowserContextResult;
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
  resolveContext: (targetSessionId, preferredSessionId) => {
    const state = get();
    return resolveBrowserContext({
      targetSessionId,
      preferredSessionId,
      panels: state.panels,
      bySession: state.bySession,
    });
  },
}));
