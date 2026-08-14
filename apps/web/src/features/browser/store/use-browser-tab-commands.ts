"use client";

import { create } from "zustand";

/**
 * Imperative bridge so Center Stage tab groups — and Browser Use agent tab
 * commands — can select/close/open tabs inside a mounted BrowserPanel without
 * lifting all browser state into a shared store.
 *
 * Electron main must not mutate this store or create webviews itself.
 * Commands are a per-context FIFO so concurrent agent calls cannot overwrite.
 */
export type BrowserTabCommand =
  | { type: "select"; tabId: string; token: number }
  | { type: "close"; tabId: string; token: number }
  | { type: "open"; url: string; token: number }
  | { type: "navigate"; tabId: string; url: string; token: number };

export type OpenTabResult = {
  tabId: string;
  evictedSessionIds: string[];
};

type CommandWaiter = {
  resolve: (value: OpenTabResult | true) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const waiters = new Map<number, CommandWaiter>();
const COMMAND_TIMEOUT_MS = 8_000;

type BrowserTabCommandsStore = {
  queuesByContext: Record<string, BrowserTabCommand[]>;
  selectTab: (browserContextId: string, tabId: string) => Promise<true>;
  closeTab: (browserContextId: string, tabId: string) => Promise<true>;
  openTab: (browserContextId: string, url: string) => Promise<OpenTabResult>;
  navigateTab: (browserContextId: string, tabId: string, url: string) => Promise<true>;
  resolveCommand: (token: number, value: OpenTabResult | true) => void;
  rejectCommand: (token: number, error: Error) => void;
  completeCommand: (browserContextId: string, token: number) => void;
};

let nextToken = 1;

function enqueue(
  set: (fn: (state: BrowserTabCommandsStore) => Partial<BrowserTabCommandsStore>) => void,
  browserContextId: string,
  command: BrowserTabCommand,
): Promise<OpenTabResult | true> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!waiters.delete(command.token)) return;
      set((state) => ({
        queuesByContext: {
          ...state.queuesByContext,
          [browserContextId]: (state.queuesByContext[browserContextId] ?? []).filter(
            (item) => item.token !== command.token,
          ),
        },
      }));
      reject(new Error("tab command was not handled by a Browser panel"));
    }, COMMAND_TIMEOUT_MS);
    waiters.set(command.token, { resolve, reject, timer });
    set((state) => ({
      queuesByContext: {
        ...state.queuesByContext,
        [browserContextId]: [...(state.queuesByContext[browserContextId] ?? []), command],
      },
    }));
  });
}

export const useBrowserTabCommandsStore = create<BrowserTabCommandsStore>((set, get) => ({
  queuesByContext: {},
  selectTab: (browserContextId, tabId) => {
    const token = nextToken++;
    return enqueue(set, browserContextId, { type: "select", tabId, token }) as Promise<true>;
  },
  closeTab: (browserContextId, tabId) => {
    const token = nextToken++;
    return enqueue(set, browserContextId, { type: "close", tabId, token }) as Promise<true>;
  },
  openTab: (browserContextId, url) => {
    const token = nextToken++;
    return enqueue(set, browserContextId, { type: "open", url, token }) as Promise<OpenTabResult>;
  },
  navigateTab: (browserContextId, tabId, url) => {
    const token = nextToken++;
    return enqueue(set, browserContextId, {
      type: "navigate",
      tabId,
      url,
      token,
    }) as Promise<true>;
  },
  resolveCommand: (token, value) => {
    const waiter = waiters.get(token);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    waiters.delete(token);
    waiter.resolve(value);
  },
  rejectCommand: (token, error) => {
    const waiter = waiters.get(token);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    waiters.delete(token);
    waiter.reject(error);
  },
  completeCommand: (browserContextId, token) => {
    const queue = get().queuesByContext[browserContextId] ?? [];
    if (queue[0]?.token !== token) return;
    set((state) => ({
      queuesByContext: {
        ...state.queuesByContext,
        [browserContextId]: (state.queuesByContext[browserContextId] ?? []).slice(1),
      },
    }));
  },
}));
