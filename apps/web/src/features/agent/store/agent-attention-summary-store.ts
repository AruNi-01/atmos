"use client";

import { create } from "zustand";
import {
  agentHooksApi,
  type AgentAttentionSummaryDto,
  type AttentionSummaryStatusDto,
} from "@/api/rest-api";
import {
  type PaneAttention,
  useAgentAttentionStore,
} from "@/features/agent/store/agent-attention-store";

export type AttentionSummaryStatus = AttentionSummaryStatusDto;

export type PaneAttentionSummary = {
  stablePaneId: string;
  contextId: string;
  sessionId: string;
  status: AttentionSummaryStatus;
  summary?: string;
  nextSteps: string[];
  canCloseSession?: boolean;
  error?: string;
  startedAt: number;
  completedAt?: number;
};

type AgentAttentionSummaryStore = {
  panes: Map<string, PaneAttentionSummary>;
  revision: number;

  upsert: (row: PaneAttentionSummary) => void;
  hydrateFromServer: (rows: readonly AgentAttentionSummaryDto[]) => void;
  clearMatchingIds: (ids: readonly string[]) => void;
  clearPane: (stablePaneId: string) => void;
  getPane: (stablePaneId: string) => PaneAttentionSummary | null;
};

function parseTime(value: string | number | undefined | null): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return undefined;
}

function fromDto(dto: AgentAttentionSummaryDto): PaneAttentionSummary | null {
  const stablePaneId = dto.stable_pane_id?.trim();
  const contextId = dto.context_id?.trim();
  if (!stablePaneId || !contextId) return null;
  if (
    dto.status !== "summarizing" &&
    dto.status !== "ready" &&
    dto.status !== "error"
  ) {
    return null;
  }
  return {
    stablePaneId,
    contextId,
    sessionId: dto.session_id?.trim() || stablePaneId,
    status: dto.status,
    summary: dto.summary?.trim() || undefined,
    nextSteps: Array.isArray(dto.next_steps)
      ? dto.next_steps.map((s) => String(s).trim()).filter(Boolean)
      : [],
    canCloseSession:
      typeof dto.can_close_session === "boolean" ? dto.can_close_session : undefined,
    error: dto.error?.trim() || undefined,
    startedAt: parseTime(dto.started_at) ?? Date.now(),
    completedAt: parseTime(dto.completed_at ?? undefined),
  };
}

export const useAgentAttentionSummaryStore = create<AgentAttentionSummaryStore>(
  (set, get) => ({
    panes: new Map(),
    revision: 0,

    upsert: (row) => {
      const stablePaneId = row.stablePaneId?.trim();
      if (!stablePaneId) return;
      set((state) => {
        const panes = new Map(state.panes);
        panes.set(stablePaneId, { ...row, stablePaneId });
        return { panes, revision: state.revision + 1 };
      });
    },

    hydrateFromServer: (rows) => {
      const panes = new Map<string, PaneAttentionSummary>();
      for (const dto of rows) {
        const row = fromDto(dto);
        if (!row) continue;
        panes.set(row.stablePaneId, row);
      }
      set((state) => ({ panes, revision: state.revision + 1 }));
    },

    clearMatchingIds: (ids) => {
      const idSet = new Set(ids.map((id) => id.trim()).filter(Boolean));
      if (idSet.size === 0) return;
      set((state) => {
        let changed = false;
        const panes = new Map(state.panes);
        for (const [key, row] of state.panes) {
          if (idSet.has(key) || idSet.has(row.sessionId)) {
            panes.delete(key);
            changed = true;
          }
        }
        if (!changed) return state;
        return { panes, revision: state.revision + 1 };
      });
    },

    clearPane: (stablePaneId) => {
      const id = stablePaneId?.trim();
      if (!id) return;
      set((state) => {
        if (!state.panes.has(id)) return state;
        const panes = new Map(state.panes);
        panes.delete(id);
        return { panes, revision: state.revision + 1 };
      });
    },

    getPane: (stablePaneId) => get().panes.get(stablePaneId) ?? null,
  }),
);

export function selectPaneAttentionSummary(
  stablePaneId: string,
): (state: AgentAttentionSummaryStore) => PaneAttentionSummary | null {
  return (state) => state.panes.get(stablePaneId) ?? null;
}

/** Recover summaries after refresh / reconnect (fire-and-forget). */
export async function hydrateAttentionSummariesFromServer(): Promise<void> {
  const revision = useAgentAttentionSummaryStore.getState().revision;
  try {
    const { summaries } = await agentHooksApi.listAttentionSummaries();
    // Skip if a WebSocket update advanced the store while the REST call was in flight.
    if (useAgentAttentionSummaryStore.getState().revision !== revision) return;
    useAgentAttentionSummaryStore.getState().hydrateFromServer(summaries ?? []);
  } catch (error) {
    console.warn(
      "[AgentAttentionSummaryStore] Failed to hydrate summaries:",
      error,
    );
  }
}

/**
 * Explicit Dismiss / composer send / pane destroy. Focus-ack must not call this
 * — the recap stays until the user has actually consumed it.
 */
export function dismissAttentionSummaryChrome(stablePaneId: string): void {
  const id = stablePaneId?.trim();
  if (!id) return;

  const attentionStore = useAgentAttentionStore.getState();
  const summaryStore = useAgentAttentionSummaryStore.getState();
  const prevAttentionList = collectMatchingAttention(attentionStore.panes, id);
  const prevSummary = summaryStore.panes.get(id) ?? null;
  if (prevAttentionList.length === 0 && !prevSummary) return;

  const latch = prevAttentionList[0];
  const notAfter = latch?.raisedAt
    ? new Date(latch.raisedAt).toISOString()
    : prevSummary?.startedAt
      ? new Date(prevSummary.startedAt).toISOString()
      : undefined;

  summaryStore.clearPane(id);
  attentionStore.clearMatchingSessionIds([id]);

  void agentHooksApi
    .clearAttention({ stablePaneId: id, notAfter, dismissSummary: true })
    .catch((error) => {
      console.warn(
        "[AgentAttentionSummaryStore] Failed to dismiss summary:",
        error,
      );
      restoreDismissedAttentionSummary(id, prevAttentionList, prevSummary);
    });
}

function collectMatchingAttention(
  panes: Map<string, PaneAttention>,
  id: string,
): PaneAttention[] {
  const matched: PaneAttention[] = [];
  for (const [key, pane] of panes) {
    if (key === id || pane.sessionId === id) {
      matched.push(pane);
    }
  }
  return matched;
}

function restoreDismissedAttentionSummary(
  id: string,
  prevAttentionList: readonly PaneAttention[],
  prevSummary: PaneAttentionSummary | null,
): void {
  const attentionNow = useAgentAttentionStore.getState();
  const summaryNow = useAgentAttentionSummaryStore.getState();
  // Restore per-pane, not by global revision — another pane can bump either
  // store while this request is in flight.
  const currentMatches = collectMatchingAttention(attentionNow.panes, id);
  const newestCurrentRaisedAt = currentMatches.reduce(
    (best, pane) => Math.max(best, pane.raisedAt),
    0,
  );
  const prevRaisedAt = prevAttentionList.reduce(
    (best, pane) => Math.max(best, pane.raisedAt),
    prevSummary?.startedAt ?? 0,
  );
  const newerTurnTookOver =
    newestCurrentRaisedAt > 0 && newestCurrentRaisedAt > prevRaisedAt;

  if (currentMatches.length === 0) {
    for (const prev of prevAttentionList) {
      attentionNow.raise({
        stablePaneId: prev.stablePaneId,
        contextId: prev.contextId,
        reason: prev.reason,
        sessionId: prev.sessionId,
        tool: prev.tool,
        raisedAt: prev.raisedAt,
      });
    }
  }

  if (!newerTurnTookOver && !summaryNow.panes.has(id) && prevSummary) {
    useAgentAttentionSummaryStore.getState().upsert(prevSummary);
  }
}
