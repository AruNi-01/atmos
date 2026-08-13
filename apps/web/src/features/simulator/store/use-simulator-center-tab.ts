"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const SIMULATOR_TAB_VALUE = "simulator";

export function isSimulatorCenterTabValue(value: string): boolean {
  return value === SIMULATOR_TAB_VALUE;
}

type SimulatorCenterTabStore = {
  openByContext: Record<string, boolean>;
  openedAtByContext: Record<string, number>;
  isOpen: (contextId: string) => boolean;
  open: (contextId: string) => void;
  close: (contextId: string) => void;
};

export const useSimulatorCenterTab = create<SimulatorCenterTabStore>()(
  persist(
    (set, get) => ({
      openByContext: {},
      openedAtByContext: {},
      isOpen: (contextId) => get().openByContext[contextId] === true,
      open: (contextId) =>
        set((state) => ({
          openByContext: { ...state.openByContext, [contextId]: true },
          openedAtByContext: {
            ...state.openedAtByContext,
            [contextId]: state.openedAtByContext[contextId] ?? Date.now(),
          },
        })),
      close: (contextId) =>
        set((state) => ({
          openByContext: { ...state.openByContext, [contextId]: false },
        })),
    }),
    {
      name: "atmos.simulator.center-tab.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        openByContext: state.openByContext,
        openedAtByContext: state.openedAtByContext,
      }),
    },
  ),
);

export const useSimulatorCenterTabStore = useSimulatorCenterTab;

export type { SimulatorCenterTabStore };
