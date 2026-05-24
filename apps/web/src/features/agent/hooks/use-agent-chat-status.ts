'use client';

import { create } from 'zustand';

/**
 * Lightweight global store for the AgentChatPanel to publish its readiness
 * so other components (e.g. RightSidebar commit-message generation) can
 * check whether the agent is available before sending a prompt.
 */
interface AgentChatStatusStore {
  hasInstalledAgents: boolean;
  isConnected: boolean;
  isBusy: boolean;

  setHasInstalledAgents: (v: boolean) => void;
  setIsConnected: (v: boolean) => void;
  setIsBusy: (v: boolean) => void;
}

export const useAgentChatStatusStore = create<AgentChatStatusStore>((set) => ({
  hasInstalledAgents: false,
  isConnected: false,
  isBusy: false,

  setHasInstalledAgents: (v) => set({ hasInstalledAgents: v }),
  setIsConnected: (v) => set({ isConnected: v }),
  setIsBusy: (v) => set({ isBusy: v }),
}));
