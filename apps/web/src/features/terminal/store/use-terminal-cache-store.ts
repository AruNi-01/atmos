"use client";

import { create } from "zustand";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";

interface CachedContext {
  contextId: string;
  lastAccessed: number;
}

interface TerminalCacheStore {
  cachedContexts: CachedContext[];
  maxSize: number;
  maxTerminalCount: number;
  ttlMs: number;
  
  touch: (contextId: string) => void;
  remove: (contextId: string) => void;
  sweepExpired: () => void;
}

export const useTerminalCacheStore = create<TerminalCacheStore>((set) => {
  return {
    cachedContexts: [],
    maxSize: 5,
    maxTerminalCount: 15,
    ttlMs: 60 * 60 * 1000, // 1 hour

    touch: (contextId) => {
      set((state) => {
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

        // Evict if over maxSize or over maxTerminalCount
        while (nextCached.length > 0) {
          if (nextCached.length > state.maxSize) {
            const evicted = nextCached.shift(); // The oldest is at the beginning
            if (evicted) {
              setTimeout(() => {
                useTerminalStore.getState().evictWorkspaceRuntime(evicted.contextId);
              }, 0);
            }
            continue;
          }

          // Check terminal count
          const terminalStoreState = useTerminalStore.getState();
          let currentTotalTerminals = 0;
          for (const cacheItem of nextCached) {
            const tabs = terminalStoreState.workspaceTerminalTabs[cacheItem.contextId];
            currentTotalTerminals += tabs ? tabs.length : 1;
          }

          if (currentTotalTerminals > state.maxTerminalCount) {
            const evicted = nextCached.shift();
            if (evicted) {
              setTimeout(() => {
                useTerminalStore.getState().evictWorkspaceRuntime(evicted.contextId);
              }, 0);
            }
            continue;
          }

          break;
        }

        return { cachedContexts: nextCached };
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
          if (now - context.lastAccessed > state.ttlMs) {
            evicted.push(context.contextId);
          } else {
            nextCached.push(context);
          }
        }

        if (evicted.length > 0) {
          setTimeout(() => {
            const evictRuntime = useTerminalStore.getState().evictWorkspaceRuntime;
            evicted.forEach(id => evictRuntime(id));
          }, 0);
        }

        return { cachedContexts: nextCached };
      });
    },
  };
});

// Setup TTL sweeper interval
if (typeof window !== "undefined") {
  setInterval(() => {
    useTerminalCacheStore.getState().sweepExpired();
  }, 60 * 1000); // Check every minute
}
