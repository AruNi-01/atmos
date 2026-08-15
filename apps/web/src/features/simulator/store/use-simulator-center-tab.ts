"use client";

import { create } from "zustand";
import { SIMULATOR_TAB_VALUE } from "../types";

type SimulatorCenterTabStore = {
  visibleByContext: Record<string, boolean>;
  open: (contextId: string) => void;
  close: (contextId: string) => void;
  isOpen: (contextId: string) => boolean;
};

export const useSimulatorCenterTabStore = create<SimulatorCenterTabStore>(
  (set, get) => ({
    visibleByContext: {},
    open: (contextId) => {
      if (!contextId) return;
      set((state) => {
        if (state.visibleByContext[contextId]) return state;
        return {
          visibleByContext: { ...state.visibleByContext, [contextId]: true },
        };
      });
    },
    close: (contextId) => {
      if (!contextId) return;
      set((state) => ({
        visibleByContext: { ...state.visibleByContext, [contextId]: false },
      }));
    },
    isOpen: (contextId) => Boolean(get().visibleByContext[contextId]),
  }),
);

export function isSimulatorTabValue(value: string | null | undefined): boolean {
  return value === SIMULATOR_TAB_VALUE;
}
