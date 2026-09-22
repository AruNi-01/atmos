"use client";

import { create } from "zustand";
import type { AgentActivity } from "@atmos/api-types/ws/dto/events";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { agentStatusApi } from "@/api/rest-api";
import { mergeActivityHydration } from "./agent-activity-merge";

interface AgentActivityStore {
  records: Map<string, AgentActivity>;
  hydrated: boolean;
  _unsubscribe: (() => void) | null;
  init: () => void;
  cleanup: () => void;
  rehydrate: () => void;
  resetForConnectionChange: () => void;
  forget: (sessionId: string) => void;
  restore: (sessionId: string, record: AgentActivity) => void;
}

let hydrateGeneration = 0;
const clearedDuringHydrate = new Set<string>();

function applyHydrationSnapshot(snapshot: Map<string, AgentActivity>) {
  useAgentActivityStore.setState((state) => ({
    records: mergeActivityHydration(snapshot, state.records, clearedDuringHydrate),
    hydrated: true,
  }));
  clearedDuringHydrate.clear();
}

async function hydrateActivity() {
  const generation = ++hydrateGeneration;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const data = await agentStatusApi.listActivity();
      if (generation !== hydrateGeneration) return;
      if (!Array.isArray(data?.sessions)) {
        throw new Error("invalid activity payload");
      }
      const snapshot = new Map<string, AgentActivity>();
      for (const record of data.sessions) {
        if (record?.session_id) snapshot.set(record.session_id, record);
      }
      applyHydrationSnapshot(snapshot);
      return;
    } catch {
      if (generation !== hydrateGeneration) return;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
}

export const useAgentActivityStore = create<AgentActivityStore>((set, get) => ({
  records: new Map(),
  hydrated: false,
  _unsubscribe: null,

  init: () => {
    if (get()._unsubscribe) return;

    const unsubscribeUpdated = useWebSocketStore.getState().onEvent(
      "agent_activity_updated",
      (payload: AgentActivity) => {
        if (!payload?.session_id) return;
        clearedDuringHydrate.delete(payload.session_id);
        set((state) => {
          const records = new Map(state.records);
          records.set(payload.session_id, payload);
          return { records };
        });
      },
    );

    const unsubscribeCleared = useWebSocketStore.getState().onEvent(
      "agent_activity_cleared",
      (payload: { session_ids?: string[] }) => {
        const ids = payload?.session_ids ?? [];
        if (!ids.length) return;
        for (const id of ids) clearedDuringHydrate.add(id);
        set((state) => {
          const records = new Map(state.records);
          for (const id of ids) records.delete(id);
          return { records };
        });
      },
    );

    void hydrateActivity();

    set({
      _unsubscribe: () => {
        unsubscribeUpdated();
        unsubscribeCleared();
      },
    });
  },

  cleanup: () => {
    get()._unsubscribe?.();
    set({ _unsubscribe: null });
  },

  rehydrate: () => {
    void hydrateActivity();
  },

  resetForConnectionChange: () => {
    hydrateGeneration += 1;
    clearedDuringHydrate.clear();
    set({ records: new Map(), hydrated: false });
    void hydrateActivity();
  },

  forget: (sessionId) => {
    clearedDuringHydrate.add(sessionId);
    set((state) => {
      if (!state.records.has(sessionId)) return state;
      const records = new Map(state.records);
      records.delete(sessionId);
      return { records };
    });
  },

  restore: (sessionId, record) => {
    clearedDuringHydrate.delete(sessionId);
    set((state) => {
      const records = new Map(state.records);
      records.set(sessionId, record);
      return { records };
    });
  },
}));
