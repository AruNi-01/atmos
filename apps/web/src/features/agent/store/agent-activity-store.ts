"use client";

import { create } from "zustand";
import type { AgentActivity } from "@atmos/api-types/ws/dto/events";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { agentHooksApi } from "@/api/rest-api";

interface AgentActivityStore {
  records: Map<string, AgentActivity>;
  hydrated: boolean;
  _unsubscribe: (() => void) | null;
  init: () => void;
  cleanup: () => void;
  resetForConnectionChange: () => void;
}

let hydrateGeneration = 0;

async function hydrateActivity(apply: (records: Map<string, AgentActivity>) => void) {
  const generation = ++hydrateGeneration;
  try {
    const { sessions } = await agentHooksApi.listActivity();
    if (generation !== hydrateGeneration) return;
    const records = new Map<string, AgentActivity>();
    for (const record of sessions ?? []) {
      if (record?.session_id) records.set(record.session_id, record);
    }
    apply(records);
  } catch {
    if (generation !== hydrateGeneration) return;
    apply(new Map());
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
        set((state) => {
          const records = new Map(state.records);
          for (const id of ids) records.delete(id);
          return { records };
        });
      },
    );

    void hydrateActivity((records) => set({ records, hydrated: true }));

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

  resetForConnectionChange: () => {
    hydrateGeneration += 1;
    set({ records: new Map(), hydrated: false });
    void hydrateActivity((records) => set({ records, hydrated: true }));
  },
}));
