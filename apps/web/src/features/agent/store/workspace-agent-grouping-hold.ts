"use client";

import { create } from "zustand";

/** Keep an acknowledged just-finished workspace in Need attention this long. */
export const WORKSPACE_AGENT_GROUPING_HOLD_MS = 60 * 1000;

type WorkspaceAgentGroupingHoldStore = {
  untilByContextId: Map<string, number>;
  /** Bumps when holds start, extend, or expire so grouping maps can recompute. */
  revision: number;

  beginHold: (contextId: string) => void;
  clearHold: (contextId: string) => void;
  clearAll: () => void;
  expireDue: (now?: number) => void;
  isHoldActive: (contextId: string, now?: number) => boolean;
};

const holdTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearHoldTimer(contextId: string) {
  const timer = holdTimers.get(contextId);
  if (!timer) return;
  clearTimeout(timer);
  holdTimers.delete(contextId);
}

function clearAllHoldTimers() {
  for (const timer of holdTimers.values()) {
    clearTimeout(timer);
  }
  holdTimers.clear();
}

function scheduleHoldExpiry(contextId: string, until: number) {
  clearHoldTimer(contextId);
  const delay = Math.max(0, until - Date.now());
  holdTimers.set(
    contextId,
    setTimeout(() => {
      holdTimers.delete(contextId);
      useWorkspaceAgentGroupingHoldStore.getState().expireDue();
    }, delay),
  );
}

export const useWorkspaceAgentGroupingHoldStore =
  create<WorkspaceAgentGroupingHoldStore>((set, get) => ({
    untilByContextId: new Map(),
    revision: 0,

    beginHold: (contextId) => {
      const id = contextId?.trim();
      if (!id) return;
      const until = Date.now() + WORKSPACE_AGENT_GROUPING_HOLD_MS;
      set((state) => {
        const untilByContextId = new Map(state.untilByContextId);
        untilByContextId.set(id, until);
        return { untilByContextId, revision: state.revision + 1 };
      });
      scheduleHoldExpiry(id, until);
    },

    clearHold: (contextId) => {
      const id = contextId?.trim();
      if (!id) return;
      clearHoldTimer(id);
      set((state) => {
        if (!state.untilByContextId.has(id)) return state;
        const untilByContextId = new Map(state.untilByContextId);
        untilByContextId.delete(id);
        return { untilByContextId, revision: state.revision + 1 };
      });
    },

    clearAll: () => {
      clearAllHoldTimers();
      set((state) => {
        if (state.untilByContextId.size === 0) return state;
        return {
          untilByContextId: new Map(),
          revision: state.revision + 1,
        };
      });
    },

    expireDue: (now = Date.now()) => {
      set((state) => {
        let changed = false;
        const untilByContextId = new Map(state.untilByContextId);
        for (const [id, until] of untilByContextId) {
          if (until > now) continue;
          untilByContextId.delete(id);
          clearHoldTimer(id);
          changed = true;
        }
        if (!changed) return state;
        return { untilByContextId, revision: state.revision + 1 };
      });
    },

    isHoldActive: (contextId, now = Date.now()) => {
      const id = contextId?.trim();
      if (!id) return false;
      const until = get().untilByContextId.get(id);
      return until != null && until > now;
    },
  }));
