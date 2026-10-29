import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type SessionInboxState = {
  agentIds: string[];
  clearAgents: () => void;
  toggleAgent: (id: string) => void;
};

export const useSessionInboxStore = create<SessionInboxState>()(
  persist(
    (set) => ({
      agentIds: [],
      clearAgents: () => set({ agentIds: [] }),
      toggleAgent: (id) =>
        set((state) => {
          const current = state.agentIds;
          const next = current.includes(id)
            ? current.filter((item) => item !== id)
            : [...current, id];
          return { agentIds: next };
        }),
    }),
    {
      name: "atmos.mobile.session-agent-filter",
      partialize: (state) => ({ agentIds: state.agentIds }),
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
