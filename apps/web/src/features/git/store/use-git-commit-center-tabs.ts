"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const GIT_COMMIT_TAB_PREFIX = "git-commit:";
const LEGACY_GITHUB_COMMIT_TAB_PREFIX = "github-commit:";

export type GitCommitCenterTab = {
  id: string;
  value: string;
  contextId: string;
  kind: "git-commit";
  label: string;
  description?: string;
  openedAt: number;
  sha: string;
  subject: string;
  authorName: string;
  repoPath?: string | null;
  timestamp?: number | null;
  owner?: string | null;
  repo?: string | null;
  /** Repo-relative path to scroll to when opening from blame. */
  focusFilePath?: string | null;
};

export const EMPTY_GIT_COMMIT_TABS: GitCommitCenterTab[] = [];

type GitCommitCenterTabsStore = {
  tabsByContext: Record<string, GitCommitCenterTab[]>;
  openCommit: (
    contextId: string,
    params: Omit<GitCommitCenterTab, "contextId" | "id" | "kind" | "value" | "openedAt">,
  ) => GitCommitCenterTab;
  closeTab: (contextId: string, value: string) => void;
};

export function buildGitCommitTabValue(contextId: string, sha: string) {
  return `${GIT_COMMIT_TAB_PREFIX}${encodeURIComponent(contextId)}:${sha}`;
}

export function isGitCommitTabValue(value: string | null | undefined): value is string {
  return (
    !!value &&
    (value.startsWith(GIT_COMMIT_TAB_PREFIX) ||
      value.startsWith(LEGACY_GITHUB_COMMIT_TAB_PREFIX))
  );
}

export function parseGitCommitTabValue(
  value: string | null | undefined,
): { contextId: string; sha: string } | null {
  if (!isGitCommitTabValue(value)) return null;
  const prefix = value.startsWith(GIT_COMMIT_TAB_PREFIX)
    ? GIT_COMMIT_TAB_PREFIX
    : LEGACY_GITHUB_COMMIT_TAB_PREFIX;
  const separatorIndex = value.lastIndexOf(":");
  if (separatorIndex <= prefix.length) return null;
  let contextId: string;
  try {
    contextId = decodeURIComponent(value.slice(prefix.length, separatorIndex));
  } catch {
    return null;
  }
  const sha = value.slice(separatorIndex + 1);
  if (!contextId || !sha) return null;
  return { contextId, sha };
}

function upsertTab(
  tabs: GitCommitCenterTab[],
  nextTab: GitCommitCenterTab,
): GitCommitCenterTab[] {
  const existingIndex = tabs.findIndex((tab) => tab.value === nextTab.value);
  if (existingIndex === -1) return [...tabs, nextTab];
  const nextTabs = [...tabs];
  nextTabs[existingIndex] = {
    ...tabs[existingIndex],
    ...nextTab,
    openedAt: tabs[existingIndex].openedAt,
  };
  return nextTabs;
}

export const useGitCommitCenterTabsStore = create<GitCommitCenterTabsStore>()(
  persist(
    (set) => ({
      tabsByContext: {},
      openCommit: (contextId, params) => {
        const value = buildGitCommitTabValue(contextId, params.sha);
        const tab: GitCommitCenterTab = {
          ...params,
          contextId,
          id: value,
          kind: "git-commit",
          value,
          openedAt: Date.now(),
        };
        set((state) => ({
          tabsByContext: {
            ...state.tabsByContext,
            [contextId]: upsertTab(state.tabsByContext[contextId] ?? [], tab),
          },
        }));
        return tab;
      },
      closeTab: (contextId, value) =>
        set((state) => {
          const tabs = state.tabsByContext[contextId] ?? [];
          const nextTabs = tabs.filter((tab) => tab.value !== value);
          if (nextTabs.length === tabs.length) return state;
          return {
            tabsByContext: {
              ...state.tabsByContext,
              [contextId]: nextTabs,
            },
          };
        }),
    }),
    {
      name: "git-commit-center-tabs",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
