"use client";

import { create } from "zustand";
import type { SimulatorDevicePlatform } from "../types";

type SimulatorRuntimeStore = {
  runningByWorkspace: Record<string, boolean>;
  platformByWorkspace: Record<string, SimulatorDevicePlatform | undefined>;
  setRunning: (workspaceId: string, running: boolean) => void;
  setPlatform: (
    workspaceId: string,
    platform: SimulatorDevicePlatform | null,
  ) => void;
  isRunning: (workspaceId: string | null | undefined) => boolean;
};

export const useSimulatorRuntimeStore = create<SimulatorRuntimeStore>(
  (set, get) => ({
    runningByWorkspace: {},
    platformByWorkspace: {},
    setRunning: (workspaceId, running) => {
      if (!workspaceId) return;
      set((state) => {
        const wasRunning = Boolean(state.runningByWorkspace[workspaceId]);
        if (wasRunning === running) return state;
        return {
          runningByWorkspace: {
            ...state.runningByWorkspace,
            [workspaceId]: running,
          },
        };
      });
    },
    setPlatform: (workspaceId, platform) => {
      if (!workspaceId) return;
      set((state) => {
        const current = state.platformByWorkspace[workspaceId];
        const next = platform ?? undefined;
        if (current === next) return state;
        return {
          platformByWorkspace: {
            ...state.platformByWorkspace,
            [workspaceId]: next,
          },
        };
      });
    },
    isRunning: (workspaceId) =>
      Boolean(workspaceId && get().runningByWorkspace[workspaceId]),
  }),
);
