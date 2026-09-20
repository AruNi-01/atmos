"use client";

import { create } from "zustand";
import type { PendingWorkspaceArchive } from "@/features/workspace/lib/workspace-archive-undo";

interface WorkspaceArchiveUndoState {
  pending: PendingWorkspaceArchive | null;
  replacePending: (next: PendingWorkspaceArchive) => PendingWorkspaceArchive | null;
  takePending: () => PendingWorkspaceArchive | null;
  clearPending: () => void;
}

export const useWorkspaceArchiveUndoStore = create<WorkspaceArchiveUndoState>((set, get) => ({
  pending: null,
  replacePending: (next) => {
    const previous = get().pending;
    set({ pending: next });
    return previous;
  },
  takePending: () => {
    const current = get().pending;
    set({ pending: null });
    return current;
  },
  clearPending: () => set({ pending: null }),
}));
