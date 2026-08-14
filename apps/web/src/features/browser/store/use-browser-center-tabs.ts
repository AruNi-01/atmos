"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const BROWSER_CENTER_TAB_PREFIX = "browser:";

export type BrowserCenterTab = {
  id: string;
  value: string;
  contextId: string;
  /** Stable id used for preview browser prefs (`center-browser:{browserId}`). */
  browserId: string;
  browserContextId: string;
  /** Wall-clock time (ms) the browser was first opened; used to order center tabs. */
  openedAt: number;
};

type BrowserCenterTabsStore = {
  tabsByContext: Record<string, BrowserCenterTab[]>;
  openBrowser: (contextId: string) => BrowserCenterTab;
  lastBrowser: (contextId: string) => BrowserCenterTab | null;
  reuseOrOpenBrowser: (contextId: string) => BrowserCenterTab;
  closeBrowser: (contextId: string, value: string) => void;
};

function createBrowserId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `browser-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildBrowserCenterTabValue(contextId: string, browserId: string): string {
  return `${BROWSER_CENTER_TAB_PREFIX}${encodeURIComponent(contextId)}:${browserId}`;
}

export function buildCenterBrowserContextId(browserId: string): string {
  return `center-browser:${browserId}`;
}

export function isBrowserCenterTabValue(value: string | null | undefined): value is string {
  return !!value && value.startsWith(BROWSER_CENTER_TAB_PREFIX);
}

export function parseBrowserCenterTabValue(
  value: string | null | undefined,
): { contextId: string; browserId: string } | null {
  if (!isBrowserCenterTabValue(value)) return null;

  const body = value.slice(BROWSER_CENTER_TAB_PREFIX.length);
  const separatorIndex = body.lastIndexOf(":");
  if (separatorIndex <= 0) return null;

  let contextId: string;
  try {
    contextId = decodeURIComponent(body.slice(0, separatorIndex));
  } catch {
    return null;
  }
  const browserId = body.slice(separatorIndex + 1);
  if (!contextId || !browserId) return null;

  return { contextId, browserId };
}

function upsertBrowser(
  tabs: BrowserCenterTab[],
  nextTab: BrowserCenterTab,
): BrowserCenterTab[] {
  const existingIndex = tabs.findIndex((tab) => tab.value === nextTab.value);
  if (existingIndex === -1) return [...tabs, nextTab];

  const nextTabs = [...tabs];
  nextTabs[existingIndex] = {
    ...tabs[existingIndex],
    ...nextTab,
    openedAt: tabs[existingIndex].openedAt,
  };
  return nextTabs;
}

export const useBrowserCenterTabsStore = create<BrowserCenterTabsStore>()(
  persist(
    (set, get) => ({
      tabsByContext: {},
      openBrowser: (contextId) => {
        const browserId = createBrowserId();
        const value = buildBrowserCenterTabValue(contextId, browserId);
        const tab: BrowserCenterTab = {
          id: value,
          value,
          contextId,
          browserId,
          browserContextId: buildCenterBrowserContextId(browserId),
          openedAt: Date.now(),
        };
        set((state) => ({
          tabsByContext: {
            ...state.tabsByContext,
            [contextId]: upsertBrowser(state.tabsByContext[contextId] ?? [], tab),
          },
        }));
        return tab;
      },
      lastBrowser: (contextId) => {
        const tabs = get().tabsByContext[contextId] ?? [];
        return tabs[tabs.length - 1] ?? null;
      },
      reuseOrOpenBrowser: (contextId) => {
        return get().lastBrowser(contextId) ?? get().openBrowser(contextId);
      },
      closeBrowser: (contextId, value) => {
        const tabs = get().tabsByContext[contextId] ?? [];
        const nextTabs = tabs.filter((tab) => tab.value !== value);
        if (nextTabs.length === tabs.length) return;
        set((state) => ({
          tabsByContext: {
            ...state.tabsByContext,
            [contextId]: nextTabs,
          },
        }));
      },
    }),
    {
      name: "browser-center-tabs",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tabsByContext: state.tabsByContext,
      }),
    },
  ),
);
