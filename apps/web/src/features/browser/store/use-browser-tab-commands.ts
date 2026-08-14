"use client";

import { create } from "zustand";

/**
 * Imperative bridge so Center Stage tab groups — and Browser Use agent tab
 * commands — can select/close/open tabs inside a mounted BrowserPanel without
 * lifting all browser state into a shared store.
 *
 * Electron main must not mutate this store or create webviews itself.
 */
type BrowserTabCommand =
  | { type: "select"; tabId: string; token: number }
  | { type: "close"; tabId: string; token: number }
  | { type: "open"; url: string; token: number };

type OpenWaiter = {
  resolve: (tabId: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const openWaiters = new Map<number, OpenWaiter>();

type BrowserTabCommandsStore = {
  commandsByContext: Record<string, BrowserTabCommand | null>;
  selectTab: (browserContextId: string, tabId: string) => void;
  closeTab: (browserContextId: string, tabId: string) => void;
  openTab: (browserContextId: string, url: string) => Promise<string>;
  resolveOpen: (token: number, tabId: string) => void;
  clearCommand: (browserContextId: string, token: number) => void;
};

let nextToken = 1;

export const useBrowserTabCommandsStore = create<BrowserTabCommandsStore>((set, get) => ({
  commandsByContext: {},
  selectTab: (browserContextId, tabId) => {
    const token = nextToken++;
    set((state) => ({
      commandsByContext: {
        ...state.commandsByContext,
        [browserContextId]: { type: "select", tabId, token },
      },
    }));
  },
  closeTab: (browserContextId, tabId) => {
    const token = nextToken++;
    set((state) => ({
      commandsByContext: {
        ...state.commandsByContext,
        [browserContextId]: { type: "close", tabId, token },
      },
    }));
  },
  openTab: (browserContextId, url) => {
    const token = nextToken++;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!openWaiters.delete(token)) return;
        reject(new Error("open tab command was not handled by a Browser panel"));
      }, 3_000);
      openWaiters.set(token, { resolve, reject, timer });
      set((state) => ({
        commandsByContext: {
          ...state.commandsByContext,
          [browserContextId]: { type: "open", url, token },
        },
      }));
    });
  },
  resolveOpen: (token, tabId) => {
    const waiter = openWaiters.get(token);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    openWaiters.delete(token);
    waiter.resolve(tabId);
  },
  clearCommand: (browserContextId, token) => {
    const current = get().commandsByContext[browserContextId];
    if (!current || current.token !== token) return;
    set((state) => ({
      commandsByContext: {
        ...state.commandsByContext,
        [browserContextId]: null,
      },
    }));
  },
}));
