"use client";

import { create } from "zustand";
import type { ActionRun } from "@/features/github/components/ActionsPanel";

const GITHUB_PR_TAB_PREFIX = "github-pr:";
const GITHUB_ACTION_TAB_PREFIX = "github-action:";

type GithubCenterTabBase = {
  id: string;
  value: string;
  contextId: string;
  owner: string;
  repo: string;
  label: string;
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

export type GithubCenterTab =
  | GithubPullRequestCenterTab
  | GithubActionCenterTab;

type GithubCenterTabsStore = {
  tabsByContext: Record<string, GithubCenterTab[]>;
  openPullRequest: (
    contextId: string,
    params: Omit<GithubPullRequestCenterTab, "contextId" | "id" | "kind" | "value">,
  ) => GithubPullRequestCenterTab;
  openActionRun: (
    contextId: string,
    params: Omit<GithubActionCenterTab, "contextId" | "id" | "kind" | "value">,
  ) => GithubActionCenterTab;
  closeTab: (contextId: string, value: string) => void;
};

function buildGithubCenterTabValue(
  kind: "github-pr" | "github-action",
  contextId: string,
  itemId: number,
) {
  const prefix =
    kind === "github-pr" ? GITHUB_PR_TAB_PREFIX : GITHUB_ACTION_TAB_PREFIX;
  return `${prefix}${encodeURIComponent(contextId)}:${itemId}`;
}

export function buildGithubPullRequestTabValue(
  contextId: string,
  prNumber: number,
) {
  return buildGithubCenterTabValue("github-pr", contextId, prNumber);
}

export function buildGithubActionTabValue(contextId: string, runId: number) {
  return buildGithubCenterTabValue("github-action", contextId, runId);
}

export function isGithubCenterTabValue(
  value: string | null | undefined,
): value is string {
  return (
    !!value &&
    (value.startsWith(GITHUB_PR_TAB_PREFIX) ||
      value.startsWith(GITHUB_ACTION_TAB_PREFIX))
  );
}

export function parseGithubCenterTabValue(
  value: string | null | undefined,
):
  | { kind: "github-pr" | "github-action"; contextId: string; itemId: number }
  | null {
  if (!isGithubCenterTabValue(value)) return null;

  const kind = value.startsWith(GITHUB_PR_TAB_PREFIX)
    ? "github-pr"
    : "github-action";
  const prefix =
    kind === "github-pr" ? GITHUB_PR_TAB_PREFIX : GITHUB_ACTION_TAB_PREFIX;
  const separatorIndex = value.lastIndexOf(":");
  if (separatorIndex <= prefix.length) return null;

  let contextId: string;
  try {
    contextId = decodeURIComponent(value.slice(prefix.length, separatorIndex));
  } catch {
    return null;
  }
  const itemId = Number(value.slice(separatorIndex + 1));
  if (!contextId || !Number.isSafeInteger(itemId) || itemId <= 0) return null;

  return { kind, contextId, itemId };
}

function upsertTab(
  tabs: GithubCenterTab[],
  nextTab: GithubCenterTab,
): GithubCenterTab[] {
  const existingIndex = tabs.findIndex((tab) => tab.value === nextTab.value);
  if (existingIndex === -1) return [...tabs, nextTab];

  const nextTabs = [...tabs];
  nextTabs[existingIndex] = { ...tabs[existingIndex], ...nextTab } as GithubCenterTab;
  return nextTabs;
}

export const useGithubCenterTabsStore = create<GithubCenterTabsStore>()(
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
);
