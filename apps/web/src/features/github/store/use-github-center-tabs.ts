"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ActionRun } from "@/features/github/components/ActionsPanel";

const GITHUB_PR_TAB_PREFIX = "github-pr:";
const GITHUB_ACTION_TAB_PREFIX = "github-action:";
const GITHUB_COMMIT_TAB_PREFIX = "github-commit:";

type GithubCenterTabBase = {
  id: string;
  value: string;
  contextId: string;
  owner: string;
  repo: string;
  label: string;
  /** Optional description shown in tooltip on hover. */
  description?: string;
  /** Wall-clock time (ms) the tab was first opened; used to order center tabs. */
  openedAt: number;
};

export type GithubPullRequestCenterTab = GithubCenterTabBase & {
  kind: "github-pr";
  branch: string;
  prNumber: number;
};

export type GithubActionCenterTab = GithubCenterTabBase & {
  kind: "github-action";
  runId: number;
  run: ActionRun | null;
};

export type GithubCommitCenterTab = GithubCenterTabBase & {
  kind: "github-commit";
  sha: string;
  subject: string;
  authorName: string;
};

export type GithubCenterTab =
  | GithubPullRequestCenterTab
  | GithubActionCenterTab
  | GithubCommitCenterTab;

type GithubCenterTabsStore = {
  tabsByContext: Record<string, GithubCenterTab[]>;
  openPullRequest: (
    contextId: string,
    params: Omit<GithubPullRequestCenterTab, "contextId" | "id" | "kind" | "value" | "openedAt">,
  ) => GithubPullRequestCenterTab;
  openActionRun: (
    contextId: string,
    params: Omit<GithubActionCenterTab, "contextId" | "id" | "kind" | "value" | "openedAt">,
  ) => GithubActionCenterTab;
  openCommit: (
    contextId: string,
    params: Omit<GithubCommitCenterTab, "contextId" | "id" | "kind" | "value" | "openedAt">,
  ) => GithubCommitCenterTab;
  closeTab: (contextId: string, value: string) => void;
};

function buildGithubCenterTabValue(
  kind: "github-pr" | "github-action" | "github-commit",
  contextId: string,
  itemId: string,
) {
  const prefix =
    kind === "github-pr"
      ? GITHUB_PR_TAB_PREFIX
      : kind === "github-action"
        ? GITHUB_ACTION_TAB_PREFIX
        : GITHUB_COMMIT_TAB_PREFIX;
  return `${prefix}${encodeURIComponent(contextId)}:${itemId}`;
}

export function buildGithubPullRequestTabValue(
  contextId: string,
  prNumber: number,
) {
  return buildGithubCenterTabValue("github-pr", contextId, String(prNumber));
}

export function buildGithubActionTabValue(contextId: string, runId: number) {
  return buildGithubCenterTabValue("github-action", contextId, String(runId));
}

export function buildGithubCommitTabValue(
  contextId: string,
  sha: string,
) {
  return buildGithubCenterTabValue("github-commit", contextId, sha);
}

export function isGithubCenterTabValue(
  value: string | null | undefined,
): value is string {
  return (
    !!value &&
    (value.startsWith(GITHUB_PR_TAB_PREFIX) ||
      value.startsWith(GITHUB_ACTION_TAB_PREFIX) ||
      value.startsWith(GITHUB_COMMIT_TAB_PREFIX))
  );
}

export function parseGithubCenterTabValue(
  value: string | null | undefined,
):
  | {
      kind: "github-pr" | "github-action" | "github-commit";
      contextId: string;
      itemId: string;
    }
  | null {
  if (!isGithubCenterTabValue(value)) return null;

  const kind = value.startsWith(GITHUB_PR_TAB_PREFIX)
    ? "github-pr"
    : value.startsWith(GITHUB_ACTION_TAB_PREFIX)
      ? "github-action"
      : "github-commit";
  const prefix =
    kind === "github-pr"
      ? GITHUB_PR_TAB_PREFIX
      : kind === "github-action"
        ? GITHUB_ACTION_TAB_PREFIX
        : GITHUB_COMMIT_TAB_PREFIX;
  const separatorIndex = value.lastIndexOf(":");
  if (separatorIndex <= prefix.length) return null;

  let contextId: string;
  try {
    contextId = decodeURIComponent(value.slice(prefix.length, separatorIndex));
  } catch {
    return null;
  }
  const itemId = value.slice(separatorIndex + 1);
  if (!contextId || !itemId) return null;

  // Validate numeric IDs for PR and action tabs
  if (
    (kind === "github-pr" || kind === "github-action") &&
    (!Number.isSafeInteger(Number(itemId)) || Number(itemId) <= 0)
  )
    return null;

  return { kind, contextId, itemId };
}

function upsertTab(
  tabs: GithubCenterTab[],
  nextTab: GithubCenterTab,
): GithubCenterTab[] {
  const existingIndex = tabs.findIndex((tab) => tab.value === nextTab.value);
  if (existingIndex === -1) return [...tabs, nextTab];

  const nextTabs = [...tabs];
  // Preserve the original open time so refreshing/re-opening a tab does not reorder it.
  nextTabs[existingIndex] = {
    ...tabs[existingIndex],
    ...nextTab,
    openedAt: tabs[existingIndex].openedAt,
  } as GithubCenterTab;
  return nextTabs;
}

/** Strip transient `run` data from action tabs before persisting.
 *  Action run status / conclusion goes stale quickly, and the detail view
 *  re-fetches fresh data when the tab becomes active. */
function stripTransientRunData(
  tabsByContext: Record<string, GithubCenterTab[]>,
): Record<string, GithubCenterTab[]> {
  const result: Record<string, GithubCenterTab[]> = {};
  for (const [contextId, tabs] of Object.entries(tabsByContext)) {
    result[contextId] = tabs.map((tab) =>
      tab.kind === "github-action" ? { ...tab, run: null } : tab,
    );
  }
  return result;
}

export const useGithubCenterTabsStore = create<GithubCenterTabsStore>()(
  persist(
    (set) => ({
      tabsByContext: {},
      openPullRequest: (contextId, params) => {
        const value = buildGithubPullRequestTabValue(contextId, params.prNumber);
        const tab: GithubPullRequestCenterTab = {
          ...params,
          contextId,
          id: value,
          kind: "github-pr",
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
      openActionRun: (contextId, params) => {
        const value = buildGithubActionTabValue(contextId, params.runId);
        const tab: GithubActionCenterTab = {
          ...params,
          contextId,
          id: value,
          kind: "github-action",
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
      openCommit: (contextId, params) => {
        const value = buildGithubCommitTabValue(contextId, params.sha);
        const tab: GithubCommitCenterTab = {
          ...params,
          contextId,
          id: value,
          kind: "github-commit",
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
      name: "github-center-tabs",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tabsByContext: stripTransientRunData(state.tabsByContext),
      }),
    },
  ),
);
