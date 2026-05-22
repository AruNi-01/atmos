'use client';

import { create } from 'zustand';

type WorkspaceCreationPhase = 'creating' | 'opening';

export interface PendingWorkspaceAgentRun {
  workspaceId: string;
  prompt: string;
  agent?: {
    id: string;
    label: string;
    command: string;
    iconType: "built-in" | "custom";
  };
  createdAt: number;
}

interface WorkspaceCreationState {
  isVisible: boolean;
  phase: WorkspaceCreationPhase;
  pendingWorkspaceId: string | null;
  pendingAgentRun: PendingWorkspaceAgentRun | null;
  showCreating: () => void;
  showOpening: (workspaceId: string) => void;
  queueAgentRun: (data: Omit<PendingWorkspaceAgentRun, "createdAt">) => void;
  consumeAgentRun: (workspaceId: string) => PendingWorkspaceAgentRun | null;
  clear: () => void;
}

export const useWorkspaceCreationStore = create<WorkspaceCreationState>((set) => ({
  isVisible: false,
  phase: 'creating',
  pendingWorkspaceId: null,
  pendingAgentRun: null,
  showCreating: () =>
    set({
      isVisible: true,
      phase: 'creating',
      pendingWorkspaceId: null,
    }),
  showOpening: (workspaceId: string) =>
    set({
      isVisible: true,
      phase: 'opening',
      pendingWorkspaceId: workspaceId,
    }),
  queueAgentRun: ({ workspaceId, prompt, agent }) =>
    set({
      pendingAgentRun: {
        workspaceId,
        prompt,
        agent,
        createdAt: Date.now(),
      },
    }),
  consumeAgentRun: (workspaceId) => {
    let pending: PendingWorkspaceAgentRun | null = null;
    set((state) => {
      if (state.pendingAgentRun?.workspaceId !== workspaceId) {
        return state;
      }
      pending = state.pendingAgentRun;
      return { pendingAgentRun: null };
    });
    return pending;
  },
  clear: () =>
    set({
      isVisible: false,
      phase: 'creating',
      pendingWorkspaceId: null,
    }),
}));
