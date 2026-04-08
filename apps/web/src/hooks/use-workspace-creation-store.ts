'use client';

import { create } from 'zustand';

type WorkspaceCreationPhase = 'creating' | 'opening';

interface WorkspaceCreationState {
  isVisible: boolean;
  phase: WorkspaceCreationPhase;
  pendingWorkspaceId: string | null;
  showCreating: () => void;
  showOpening: (workspaceId: string) => void;
  clear: () => void;
}

export const useWorkspaceCreationStore = create<WorkspaceCreationState>((set) => ({
  isVisible: false,
  phase: 'creating',
  pendingWorkspaceId: null,
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
  clear: () =>
    set({
      isVisible: false,
      phase: 'creating',
      pendingWorkspaceId: null,
    }),
}));
