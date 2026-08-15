"use client";

import { create } from "zustand";

type SimulatorRuntimeStore = {
  runningByWorkspace: Record<string, boolean>;
  setRunning: (workspaceId: string, running: boolean) => void;
  isRunning: (workspaceId: string | null | undefined) => boolean;
};

export const useSimulatorRuntimeStore = create<SimulatorRuntimeStore>(
  (set, get) => ({
    runningByWorkspace: {},
    setRunning: (workspaceId, running) => {
      if (!workspaceId) return;
      set((state) => {
        if (Boolean(state.runningByWorkspace[workspaceId]) === running) return state;
        return {
          runningByWorkspace: {
            ...state.runningByWorkspace,
            [workspaceId]: running,
          },
        };
      });
    },
    isRunning: (workspaceId) =>
      Boolean(workspaceId && get().runningByWorkspace[workspaceId]),
  }),
);
