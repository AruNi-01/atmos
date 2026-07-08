"use client";

import { create } from "zustand";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";

interface CachedContext {
  contextId: string;
  lastAccessed: number;
}

interface TerminalCacheStore {
  cachedContexts: CachedContext[];
  activeContextId: string | null;
  maxSize: number;
  maxTerminalPanelsPerWorkspace: number;
  ttlMs: number;
  
  loadSettings: () => Promise<void>;
  setMaxSize: (maxSize: number) => Promise<void>;
  setMaxTerminalPanelsPerWorkspace: (max: number) => Promise<void>;
  touch: (contextId: string) => void;
  setActiveContextId: (contextId: string | null) => void;
  remove: (contextId: string) => void;
  sweepExpired: () => void;
}

export const useTerminalCacheStore = create<TerminalCacheStore>((set) => {
  return {
    cachedContexts: [],
    activeContextId: null,
    maxSize: 10,
    maxTerminalPanelsPerWorkspace: 15,
    ttlMs: 60 * 60 * 1000, // 1 hour

    loadSettings: async () => {
      try {
        const { useFunctionSettingsStore } = await import("@/features/settings/store/function-settings-store");
        const settings = await useFunctionSettingsStore.getState().load();
        set((state) => ({
          maxSize: settings.terminal?.max_cached_workspaces ?? state.maxSize,
          maxTerminalPanelsPerWorkspace: settings.terminal?.max_cached_terminal_panels_per_workspace ?? state.maxTerminalPanelsPerWorkspace,
        }));
      } catch {
        // ignore
      }
    },

    setMaxSize: async (maxSize: number) => {
      set({ maxSize });
      const { functionSettingsApi } = await import("@/api/ws-api");
      await functionSettingsApi.update("terminal", "max_cached_workspaces", maxSize);
    },

    setMaxTerminalPanelsPerWorkspace: async (max: number) => {
      set({ maxTerminalPanelsPerWorkspace: max });
      const { functionSettingsApi } = await import("@/api/ws-api");
      await functionSettingsApi.update("terminal", "max_cached_terminal_panels_per_workspace", max);
    },

    setActiveContextId: (contextId) => {
      set((state) => {
        if (state.activeContextId === contextId) return state;
        const nextCached = state.cachedContexts.filter(c => c.contextId !== contextId);
        return { activeContextId: contextId, cachedContexts: nextCached };
      });
    },

    touch: (contextId) => {
      set((state) => {
        // Do not cache the currently active context
        if (state.activeContextId === contextId) return state;

        const now = Date.now();
        const existingIndex = state.cachedContexts.findIndex(c => c.contextId === contextId);
        
        const nextCached = [...state.cachedContexts];
        
        if (existingIndex !== -1) {
          // Update timestamp and move to end (most recently used)
          const item = nextCached.splice(existingIndex, 1)[0];
          nextCached.push({ ...item, lastAccessed: now });
        } else {
          // Add new item
          nextCached.push({ contextId, lastAccessed: now });
        }

        // Evict if over maxSize or if ANY context violates the maxTerminalPanelsPerWorkspace limit
        const nextCachedFiltered: typeof nextCached = [];
        const evictedList: string[] = [];

        const terminalStoreState = useTerminalStore.getState();

        // 1. Check maxTerminalPanelsPerWorkspace for each context
        for (const cacheItem of nextCached) {
          const tabs = terminalStoreState.workspaceTerminalTabs[cacheItem.contextId];
          let totalPanelsInContext = 0;
          if (tabs) {
            for (const tab of tabs) {
              const panes = terminalStoreState.getPanes(cacheItem.contextId, tab.id);
              totalPanelsInContext += Object.keys(panes).length;
            }
          } else {
            totalPanelsInContext = 1;
          }

          if (totalPanelsInContext > state.maxTerminalPanelsPerWorkspace) {
            evictedList.push(cacheItem.contextId);
          } else {
            nextCachedFiltered.push(cacheItem);
          }
        }

        // 2. Enforce maxSize (LRU - oldest at the beginning of the array)
        while (nextCachedFiltered.length > state.maxSize) {
          const evicted = nextCachedFiltered.shift();
          if (evicted) {
            evictedList.push(evicted.contextId);
          }
        }

        if (evictedList.length > 0) {
          setTimeout(() => {
            const evictRuntime = useTerminalStore.getState().evictWorkspaceRuntime;
            for (const id of evictedList) {
              if (id !== state.activeContextId) {
                evictRuntime(id);
              }
            }
          }, 0);
        }

        return { cachedContexts: nextCachedFiltered };
      });
    },

    remove: (contextId) => {
      set((state) => {
        const nextCached = state.cachedContexts.filter(c => c.contextId !== contextId);
        if (nextCached.length !== state.cachedContexts.length) {
          setTimeout(() => {
            useTerminalStore.getState().evictWorkspaceRuntime(contextId);
          }, 0);
        }
        return { cachedContexts: nextCached };
      });
    },

    sweepExpired: () => {
      set((state) => {
        const now = Date.now();
        const nextCached = [];
        const evicted: string[] = [];

        for (const context of state.cachedContexts) {
          if (now - context.lastAccessed > state.ttlMs && context.contextId !== state.activeContextId) {
            evicted.push(context.contextId);
          } else {
            nextCached.push(context);
          }
        }

        if (evicted.length === 0) {
          return state;
        }

        setTimeout(() => {
          const evictRuntime = useTerminalStore.getState().evictWorkspaceRuntime;
          evicted.forEach(id => evictRuntime(id));
        }, 0);

        return { cachedContexts: nextCached };
      });
    },
  };
});
if (typeof window !== 'undefined') { useTerminalCacheStore.getState().loadSettings(); }
