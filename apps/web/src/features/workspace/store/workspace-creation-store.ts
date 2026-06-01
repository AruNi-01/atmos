'use client';

import { create } from 'zustand';

type WorkspaceCreationPhase = 'creating' | 'opening';

export interface PendingWorkspaceAgentRun {
  workspaceId?: string | null;
  projectId?: string | null;
  prompt: string;
  command?: string;
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
  consumeAgentRun: (contextId: string) => PendingWorkspaceAgentRun | null;
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
  queueAgentRun: ({ workspaceId, projectId, prompt, command, agent }) =>
    set({
      pendingAgentRun: {
        workspaceId,
        projectId,
        prompt,
        command,
        agent,
        createdAt: Date.now(),
      },
    }),
  consumeAgentRun: (contextId) => {
    let pending: PendingWorkspaceAgentRun | null = null;
    set((state) => {
      const pendingContextId = state.pendingAgentRun?.workspaceId ?? state.pendingAgentRun?.projectId;
      if (pendingContextId !== contextId) {
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
