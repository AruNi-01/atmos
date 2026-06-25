"use client";

import { create } from "zustand";
import type { ResolvedAgentFixLaunchRequest } from "@/features/agent-fix/types";

export type AgentFixTerminalRunner = (
  request: ResolvedAgentFixLaunchRequest,
) => Promise<void> | void;

interface AgentFixLauncherState {
  runner: AgentFixTerminalRunner | null;
  setRunner: (runner: AgentFixTerminalRunner | null) => void;
}

export const useAgentFixLauncherStore = create<AgentFixLauncherState>((set) => ({
  runner: null,
  setRunner: (runner) => set({ runner }),
}));
