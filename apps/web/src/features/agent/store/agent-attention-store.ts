"use client";

import { create } from "zustand";

export type AttentionReason = "permission_request" | "task_complete";

export type PaneAttention = {
  /** Usually `${contextId}:${tmuxWindowName}` — same key as agent hook session_id. */
  stablePaneId: string;
  contextId: string;
  reason: AttentionReason;
  sessionId: string;
  tool?: string;
  raisedAt: number;
};

export type RaiseAttentionInput = {
  stablePaneId: string;
  contextId: string | null | undefined;
  reason: AttentionReason;
  sessionId?: string;
  tool?: string;
};

type AgentAttentionStore = {
  panes: Map<string, PaneAttention>;
  /** When true, left sidebar only lists contexts that need attention. */
  filterMode: boolean;
  /** Currently focused terminal pane (stable pane id), if known. */
  focusedStablePaneId: string | null;
  /** Bumps on every mutation so React selectors can re-render cheaply. */
  revision: number;

  raise: (input: RaiseAttentionInput) => void;
  clearPane: (stablePaneId: string) => void;
  /** Called when the user focuses a terminal pane (click / focus capture). */
  notifyPaneFocused: (stablePaneId: string | null) => void;
  setFilterMode: (on: boolean) => void;
  toggleFilterMode: () => void;

  hasPaneAttention: (stablePaneId: string) => boolean;
  hasAnyPaneAttention: (stablePaneIds: readonly string[]) => boolean;
  hasContextAttention: (contextId: string) => boolean;
  getPaneReason: (stablePaneId: string) => AttentionReason | null;
  getContextReason: (contextId: string) => AttentionReason | null;
  getAttentionCount: () => number;
  getAttentionContextIds: () => string[];
};

const autoClearTimers = new Map<string, ReturnType<typeof setTimeout>>();
const AUTO_CLEAR_MS = 3000;

function contextIdFromStablePaneId(stablePaneId: string): string {
  const idx = stablePaneId.indexOf(":");
  return idx === -1 ? stablePaneId : stablePaneId.slice(0, idx);
}

function clearAutoClearTimer(stablePaneId: string) {
  const timer = autoClearTimers.get(stablePaneId);
  if (timer) {
    clearTimeout(timer);
    autoClearTimers.delete(stablePaneId);
  }
}

function scheduleAutoClear(stablePaneId: string) {
  clearAutoClearTimer(stablePaneId);
  const timer = setTimeout(() => {
    autoClearTimers.delete(stablePaneId);
    const state = useAgentAttentionStore.getState();
    // Only auto-clear if the user is still focused on this pane.
    if (state.focusedStablePaneId !== stablePaneId) return;
    if (!state.panes.has(stablePaneId)) return;
    state.clearPane(stablePaneId);
  }, AUTO_CLEAR_MS);
  autoClearTimers.set(stablePaneId, timer);
}

function reasonPriority(reason: AttentionReason): number {
  return reason === "permission_request" ? 2 : 1;
}

export const useAgentAttentionStore = create<AgentAttentionStore>((set, get) => ({
  panes: new Map(),
  filterMode: false,
  focusedStablePaneId: null,
  revision: 0,

  raise: (input) => {
    const stablePaneId = input.stablePaneId?.trim();
    if (!stablePaneId) return;
    const contextId =
      (input.contextId?.trim() || contextIdFromStablePaneId(stablePaneId)).trim();
    if (!contextId) return;

    set((state) => {
      const panes = new Map(state.panes);
      const existing = panes.get(stablePaneId);
      // Keep the higher-urgency reason if both fire close together.
      const reason =
        existing && reasonPriority(existing.reason) > reasonPriority(input.reason)
          ? existing.reason
          : input.reason;
      panes.set(stablePaneId, {
        stablePaneId,
        contextId,
        reason,
        sessionId: input.sessionId ?? stablePaneId,
        tool: input.tool ?? existing?.tool,
        raisedAt: Date.now(),
      });
      return { panes, revision: state.revision + 1 };
    });

    // Already focused on this panel → clear after a short delay (less noisy).
    if (get().focusedStablePaneId === stablePaneId) {
      scheduleAutoClear(stablePaneId);
    }
  },

  clearPane: (stablePaneId) => {
    if (!stablePaneId) return;
    clearAutoClearTimer(stablePaneId);
    set((state) => {
      if (!state.panes.has(stablePaneId)) return state;
      const panes = new Map(state.panes);
      panes.delete(stablePaneId);
      const filterMode = panes.size === 0 ? false : state.filterMode;
      return { panes, filterMode, revision: state.revision + 1 };
    });
  },

  notifyPaneFocused: (stablePaneId) => {
    const prev = get().focusedStablePaneId;
    if (prev && prev !== stablePaneId) {
      clearAutoClearTimer(prev);
    }
    set((state) =>
      state.focusedStablePaneId === stablePaneId
        ? state
        : { focusedStablePaneId: stablePaneId, revision: state.revision + 1 },
    );
    if (!stablePaneId) return;
    // Clear exact pane key and any attention latched under a hook session_id
    // alias for this pane (raise may have stored session_id when pane_id was
    // missing on an earlier event, or session_id may equal the stable key).
    const toClear: string[] = [];
    for (const [id, pane] of get().panes) {
      if (id === stablePaneId || pane.sessionId === stablePaneId) {
        toClear.push(id);
      }
    }
    for (const id of toClear) {
      get().clearPane(id);
    }
  },

  setFilterMode: (on) => {
    set((state) => {
      if (state.filterMode === on) return state;
      // Don't enable empty filter mode.
      if (on && state.panes.size === 0) return state;
      return { filterMode: on, revision: state.revision + 1 };
    });
  },

  toggleFilterMode: () => {
    const state = get();
    if (state.filterMode) {
      set({ filterMode: false, revision: state.revision + 1 });
      return;
    }
    if (state.panes.size === 0) return;
    set({ filterMode: true, revision: state.revision + 1 });
  },

  hasPaneAttention: (stablePaneId) => get().panes.has(stablePaneId),

  hasAnyPaneAttention: (stablePaneIds) => {
    const panes = get().panes;
    for (const id of stablePaneIds) {
      if (panes.has(id)) return true;
    }
    return false;
  },

  hasContextAttention: (contextId) => {
    if (!contextId) return false;
    for (const pane of get().panes.values()) {
      if (pane.contextId === contextId) return true;
    }
    return false;
  },

  getPaneReason: (stablePaneId) => get().panes.get(stablePaneId)?.reason ?? null,

  getContextReason: (contextId) => {
    let best: AttentionReason | null = null;
    for (const pane of get().panes.values()) {
      if (pane.contextId !== contextId) continue;
      if (!best || reasonPriority(pane.reason) > reasonPriority(best)) {
        best = pane.reason;
      }
    }
    return best;
  },

  getAttentionCount: () => get().panes.size,

  getAttentionContextIds: () => {
    const ids = new Set<string>();
    for (const pane of get().panes.values()) {
      ids.add(pane.contextId);
    }
    return Array.from(ids);
  },
}));

/** Stable React selector key for attention context membership. */
export function selectAttentionContextKey(state: AgentAttentionStore): string {
  return state.getAttentionContextIds().sort().join("\0");
}

export function selectAttentionCount(state: AgentAttentionStore): number {
  return state.panes.size;
}

export function selectAttentionFilterMode(state: AgentAttentionStore): boolean {
  return state.filterMode;
}

export function selectPaneAttention(
  stablePaneId: string,
): (state: AgentAttentionStore) => AttentionReason | null {
  return (state) => state.panes.get(stablePaneId)?.reason ?? null;
}

export function selectAnyPaneAttention(
  stablePaneIds: readonly string[],
): (state: AgentAttentionStore) => AttentionReason | null {
  return (state) => {
    let best: AttentionReason | null = null;
    for (const id of stablePaneIds) {
      const reason = state.panes.get(id)?.reason;
      if (!reason) continue;
      if (!best || reasonPriority(reason) > reasonPriority(best)) best = reason;
    }
    return best;
  };
}

export function selectContextAttention(
  contextId: string,
): (state: AgentAttentionStore) => AttentionReason | null {
  return (state) => state.getContextReason(contextId);
}

/**
 * Filter projects/workspaces to those that currently need attention.
 * Projects stay if the project itself or any of its workspaces needs attention.
 */
export function filterProjectsByAttention<
  TProject extends { id: string; workspaces: TWorkspace[] },
  TWorkspace extends { id: string },
>(projects: TProject[], attentionContextIds: ReadonlySet<string> | readonly string[]): TProject[] {
  const ids =
    attentionContextIds instanceof Set
      ? attentionContextIds
      : new Set(attentionContextIds);
  if (ids.size === 0) return [];

  return projects
    .map((project) => {
      const projectNeeds = ids.has(project.id);
      const workspaces = project.workspaces.filter(
        (ws) => ids.has(ws.id) || projectNeeds,
      );
      if (!projectNeeds && workspaces.length === 0) return null;
      return { ...project, workspaces };
    })
    .filter((p): p is TProject => p !== null);
}
