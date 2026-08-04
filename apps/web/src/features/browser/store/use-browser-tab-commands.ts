"use client";

import { create } from "zustand";

/**
 * Imperative bridge so Center Stage tab groups can select/close tabs inside a
 * mounted BrowserPanel without lifting all browser state into a shared store.
 */
type BrowserTabCommand =
  | { type: "select"; tabId: string; token: number }
  | { type: "close"; tabId: string; token: number };

type BrowserTabCommandsStore = {
  commandsByContext: Record<string, BrowserTabCommand | null>;
  selectTab: (browserContextId: string, tabId: string) => void;
  closeTab: (browserContextId: string, tabId: string) => void;
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
