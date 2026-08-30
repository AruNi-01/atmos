"use client";

import { create } from "zustand";
import {
  agentStatusApi,
  type AgentAttentionLatchDto,
} from "@/api/rest-api";
import { useWorkspaceAgentGroupingHoldStore } from "@/features/agent/store/workspace-agent-grouping-hold";

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
  /** Optional absolute ms; used when hydrating from the API. */
  raisedAt?: number;
};

/** User click vs programmatic/auto focus from a need-attention jump. */
export type PaneFocusAck = "immediate" | "deferred";

export type NotifyPaneFocusedOptions = {
  ack?: PaneFocusAck;
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
  /**
   * Clear attention whose map key or stored `sessionId` matches any of the
   * given IDs (used when hook sessions are cleared under an alias key).
   */
  clearMatchingSessionIds: (ids: readonly string[]) => void;
  /**
   * Record which pane is focused. `ack: "immediate"` (default) is a user click
   * and drops the latch now. `ack: "deferred"` is auto-focus from a jump and
   * keeps the ring for {@link ATTENTION_AUTO_CLEAR_MS}.
   */
  notifyPaneFocused: (
    stablePaneId: string | null,
    options?: NotifyPaneFocusedOptions,
  ) => void;
  /**
   * Replace local latches with the API memory snapshot (browser refresh recovery).
   * Does not touch filterMode / focused pane.
   */
  hydrateFromServer: (latches: readonly AgentAttentionLatchDto[]) => void;
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

function parseRaisedAt(value: string | number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
}

function latchFromDto(dto: AgentAttentionLatchDto): PaneAttention | null {
  const stablePaneId = dto.stable_pane_id?.trim();
  const contextId = dto.context_id?.trim();
  if (!stablePaneId || !contextId) return null;
  if (dto.reason !== "permission_request" && dto.reason !== "task_complete") {
    return null;
  }
  return {
    stablePaneId,
    contextId,
    reason: dto.reason,
    sessionId: dto.session_id?.trim() || stablePaneId,
    tool: dto.tool ?? undefined,
    raisedAt: parseRaisedAt(dto.raised_at),
  };
}

/** Fire-and-forget clear against API memory so refresh does not resurrect latches. */
function clearAttentionOnServer(stablePaneId: string) {
  const id = stablePaneId?.trim();
  if (!id) return;
  void agentStatusApi.clearAttention({ stablePaneId: id }).catch((error) => {
    console.warn("[AgentAttentionStore] Failed to clear attention on server:", error);
  });
}

const autoClearTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Bell-only: grouping dwell is WORKSPACE_AGENT_GROUPING_HOLD_MS after this clear. */
export const ATTENTION_AUTO_CLEAR_MS = 3000;

export function clearAgentAttentionAutoClearTimers(): void {
  for (const id of [...autoClearTimers.keys()]) {
    clearAutoClearTimer(id);
  }
}

/**
 * Optional side-effect when a pane is acknowledged (focused or auto-cleared while
 * focused). Wired by agent-status-store to drop idle sessions — avoids a static
 * import cycle between the two stores.
 */
let onPaneAcknowledged: ((stablePaneId: string) => void) | null = null;

export function setAgentPaneAcknowledgedHandler(
  handler: ((stablePaneId: string) => void) | null,
): void {
  onPaneAcknowledged = handler;
}

function notifyPaneAcknowledged(stablePaneId: string) {
  if (!stablePaneId) return;
  try {
    onPaneAcknowledged?.(stablePaneId);
  } catch (error) {
    console.warn("[AgentAttentionStore] pane acknowledged handler failed:", error);
  }
}

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

function matchingAttentionKeys(stablePaneId: string): string[] {
  const keys: string[] = [];
  for (const [id, pane] of useAgentAttentionStore.getState().panes) {
    if (id === stablePaneId || pane.sessionId === stablePaneId) {
      keys.push(id);
    }
  }
  return keys;
}

function scheduleAutoClear(stablePaneId: string, restart = true) {
  if (!restart && autoClearTimers.has(stablePaneId)) return;
  clearAutoClearTimer(stablePaneId);
  const timer = setTimeout(() => {
    autoClearTimers.delete(stablePaneId);
    const state = useAgentAttentionStore.getState();
    // Only auto-clear if the user is still focused on this pane.
    if (state.focusedStablePaneId !== stablePaneId) return;
    const toClear = matchingAttentionKeys(stablePaneId);
    if (toClear.length === 0) return;
    for (const id of toClear) {
      state.clearPane(id);
    }
    // Persist so refresh does not revive a latch the user already saw.
    clearAttentionOnServer(stablePaneId);
    // User already has the pane open — drop idle agent status with the latch.
    notifyPaneAcknowledged(stablePaneId);
  }, ATTENTION_AUTO_CLEAR_MS);
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
        raisedAt: input.raisedAt ?? Date.now(),
      });
      return { panes, revision: state.revision + 1 };
    });

    // Already focused on this panel → clear the bell after a short delay.
    // Grouping hold (started in clearPane) keeps By Agent Status in Need
    // attention for a minute so the row does not jump to Done.
    if (get().focusedStablePaneId === stablePaneId) {
      scheduleAutoClear(stablePaneId);
    }
  },

  clearPane: (stablePaneId) => {
    if (!stablePaneId) return;
    clearAutoClearTimer(stablePaneId);
    const existing = get().panes.get(stablePaneId);
    if (!existing) return;
    set((state) => {
      if (!state.panes.has(stablePaneId)) return state;
      const panes = new Map(state.panes);
      panes.delete(stablePaneId);
      const filterMode = panes.size === 0 ? false : state.filterMode;
      return { panes, filterMode, revision: state.revision + 1 };
    });
    if (
      existing.reason === "task_complete" &&
      !get().hasContextAttention(existing.contextId)
    ) {
      useWorkspaceAgentGroupingHoldStore.getState().beginHold(existing.contextId);
    }
  },

  clearMatchingSessionIds: (ids) => {
    const idSet = new Set(ids.filter((id) => !!id));
    if (idSet.size === 0) return;
    const toClear: string[] = [];
    for (const [key, pane] of get().panes) {
      if (idSet.has(key) || idSet.has(pane.sessionId)) {
        toClear.push(key);
      }
    }
    for (const id of toClear) {
      get().clearPane(id);
    }
  },

  hydrateFromServer: (latches) => {
    const panes = new Map<string, PaneAttention>();
    for (const dto of latches) {
      const latch = latchFromDto(dto);
      if (!latch) continue;
      const existing = panes.get(latch.stablePaneId);
      if (
        existing &&
        reasonPriority(existing.reason) > reasonPriority(latch.reason)
      ) {
        continue;
      }
      panes.set(latch.stablePaneId, latch);
    }
    set((state) => ({
      panes,
      // Empty snapshot turns filter off; non-empty keeps current mode.
      filterMode: panes.size === 0 ? false : state.filterMode,
      revision: state.revision + 1,
    }));
  },

  notifyPaneFocused: (stablePaneId, options) => {
    const ack = options?.ack ?? "immediate";
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
    // Exact pane key and any latch stored under a hook session_id alias.
    const toClear = matchingAttentionKeys(stablePaneId);
    if (ack === "deferred") {
      // Jump / URL / restore auto-focus: keep the ring, then clear if still
      // focused. A later user click uses the immediate path below.
      if (toClear.length > 0) {
        scheduleAutoClear(stablePaneId, false);
        return;
      }
      notifyPaneAcknowledged(stablePaneId);
      return;
    }
    const hadAttention = toClear.length > 0;
    for (const id of toClear) {
      get().clearPane(id);
    }
    // Persist acknowledge to API memory so a refresh does not revive the latch.
    // Always POST for the focused pane — backend is idempotent when empty.
    if (hadAttention) {
      clearAttentionOnServer(stablePaneId);
    }
    // User click acknowledges: drop sticky attention (above) and leftover
    // idle hook sessions so we do not wait for the idle sweeper.
    notifyPaneAcknowledged(stablePaneId);
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
 *
 * - Project needs attention → keep the project, hide all workspaces under it
 *   (the project row is the attention target; children would just noise the list).
 * - Only workspaces need attention → keep the project as a dimmable parent and
 *   only the workspaces that themselves need attention.
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
      // When the project itself needs attention, hide every child workspace.
      // Otherwise only keep workspaces that are latched for attention.
      const workspaces = projectNeeds
        ? []
        : project.workspaces.filter((ws) => ids.has(ws.id));
      if (!projectNeeds && workspaces.length === 0) return null;
      return { ...project, workspaces };
    })
    .filter((p): p is TProject => p !== null);
}
