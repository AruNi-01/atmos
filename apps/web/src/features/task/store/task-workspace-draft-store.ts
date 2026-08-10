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

/** Snapshot for `linear_link_issue` after workspace create (APP-056). */
export type TaskWorkspaceLinearDraft = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  description?: string | null;
  priority?: number;
  state_name?: string | null;
  state_type?: string | null;
  project_name?: string | null;
  project_id?: string | null;
  team_id?: string | null;
  team_key?: string | null;
  labels?: Array<{ name: string; color?: string | null }>;
  assignee?: { name: string; avatar_url?: string | null } | null;
  github_refs?: Array<{
    owner: string;
    repo: string;
    number: number;
    kind: string;
    url: string;
  }>;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TaskWorkspaceDraft = {
  projectId: string;
  /** Optional GitHub Issue/PR to prefill Advanced link. */
  link?: TaskWorkspaceLinkDraft | null;
  /** Prefill workspace display name (e.g. `LAN-51 Title`). */
  displayName?: string | null;
  /** Prefill composer / initial requirement. */
  initialRequirement?: string | null;
  /** When set, WelcomePage links Linear after create. */
  linearIssue?: TaskWorkspaceLinearDraft | null;
  /**
   * Do not auto-pick the first Atmos project — user must choose.
   * Used for Linear create (issue is not bound to a repo/project).
   */
  requireProjectPick?: boolean;
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
