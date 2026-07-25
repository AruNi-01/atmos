"use client";

/**
 * Session list snapshot store (workspace hop cache).
 *
 * Product intent: small list/server snapshots (git status, branches, log page,
 * file tree, PR lists, …) must survive for the whole Atmos Computer session so
 * switching Workspace/Project half an hour later still paints instantly.
 *
 * This is NOT TanStack Query's short-lived request cache. Query still owns
 * network fetch/dedupe; this store owns session-long paint snapshots.
 *
 * Lifetime:
 * - Written on successful query data
 * - Read as initialData when mounting a list query after a hop
 * - Cleared on Computer / connection target switch (prepareConnectionTargetChange)
 *
 * Not durable across full page reload / app restart.
 */

import { create } from "zustand";

export type SessionListSnapshotEntry<T = unknown> = {
  data: T;
  updatedAt: number;
};

interface SessionListSnapshotState {
  entries: Record<string, SessionListSnapshotEntry>;
  get: <T>(key: string) => T | undefined;
  getUpdatedAt: (key: string) => number | undefined;
  has: (key: string) => boolean;
  set: <T>(key: string, data: T, updatedAt?: number) => void;
  remove: (key: string) => void;
  clearAll: () => void;
}

export const useSessionListSnapshotStore = create<SessionListSnapshotState>(
  (set, get) => ({
    entries: {},

    get: <T,>(key: string): T | undefined => {
      return get().entries[key]?.data as T | undefined;
    },

    getUpdatedAt: (key: string) => get().entries[key]?.updatedAt,

    has: (key: string) => Boolean(get().entries[key]),

    set: <T,>(key: string, data: T, updatedAt = Date.now()) => {
      set((state) => {
        const prev = state.entries[key];
        // Avoid subscriber churn when data is referentially equal.
        if (prev && prev.data === data && prev.updatedAt === updatedAt) {
          return state;
        }
        return {
          entries: {
            ...state.entries,
            [key]: { data, updatedAt },
          },
        };
      });
    },

    remove: (key: string) => {
      set((state) => {
        if (!(key in state.entries)) return state;
        const { [key]: _removed, ...rest } = state.entries;
        return { entries: rest };
      });
    },

    clearAll: () => {
      set({ entries: {} });
    },
  }),
);

/** Stable string keys for session list snapshots. */
export const sessionListKeys = {
  gitStatus: (repoPath: string) => `git:status:${repoPath}`,
  gitBranches: (repoPath: string) => `git:branches:${repoPath}`,
  gitChangedFiles: (repoPath: string, paramsKey: string) =>
    `git:changedFiles:${repoPath}:${paramsKey}`,
  gitLog: (
    repoPath: string,
    branchKey: string | null,
    page: number,
    limit: number,
  ) => `git:log:${repoPath}:${branchKey ?? ""}:p${page}:l${limit}`,
  fileTree: (rootPath: string, showHidden: boolean) =>
    `files:tree:${rootPath}:h${showHidden ? 1 : 0}`,
  branchPrList: (input: {
    owner: string;
    repo: string;
    branch: string;
    state?: string;
    emitBranchStatusRefresh?: boolean;
  }) =>
    `github:prs:${input.owner}/${input.repo}/${input.branch}:${input.state ?? "all"}:e${
      input.emitBranchStatusRefresh ? 1 : 0
    }`,
  githubActionsList: (input: { owner: string; repo: string; branch: string }) =>
    `github:actions:${input.owner}/${input.repo}/${input.branch}`,
} as const;

/** Stable serialization for compare-params objects used in changed-files keys. */
export function serializeGitCompareParams(params: {
  baseBranch?: string | null;
  baseRef?: string | null;
  commitRef?: string | null;
  usePreferredCompare?: boolean;
}): string {
  return [
    params.baseBranch ?? "",
    params.baseRef ?? "",
    params.commitRef ?? "",
    params.usePreferredCompare ? "1" : "0",
  ].join("\0");
}

export function clearSessionListSnapshots(): void {
  useSessionListSnapshotStore.getState().clearAll();
}
