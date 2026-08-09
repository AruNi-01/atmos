"use client";

import { create } from "zustand";

export type TaskWorkspaceLinkDraft =
  | {
      kind: "issue";
      owner: string;
      repo: string;
      number: number;
      title?: string | null;
      url?: string | null;
    }
  | {
      kind: "pr";
      owner: string;
      repo: string;
      number: number;
      title?: string | null;
      url?: string | null;
      head_ref?: string | null;
      base_ref?: string | null;
    };

export type TaskWorkspaceDraft = {
  projectId: string;
  link: TaskWorkspaceLinkDraft;
  createdAt: number;
};

interface TaskWorkspaceDraftState {
  draft: TaskWorkspaceDraft | null;
  setDraft: (draft: Omit<TaskWorkspaceDraft, "createdAt">) => void;
  peekDraft: () => TaskWorkspaceDraft | null;
  /** Read and clear — WelcomePage consumes once on mount/project load. */
  consumeDraft: () => TaskWorkspaceDraft | null;
  clear: () => void;
}

export const useTaskWorkspaceDraftStore = create<TaskWorkspaceDraftState>((set, get) => ({
  draft: null,
  setDraft: (draft) =>
    set({
      draft: {
        ...draft,
        createdAt: Date.now(),
      },
    }),
  peekDraft: () => get().draft,
  consumeDraft: () => {
    const current = get().draft;
    set({ draft: null });
    return current;
  },
  clear: () => set({ draft: null }),
}));
