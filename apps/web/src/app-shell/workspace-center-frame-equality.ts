/**
 * Pure equality for WorkspaceCenterFrame memo (IMP-011).
 * Kept free of React/UI imports so unit tests stay lightweight.
 */

import type { ReviewTarget } from "@/api/ws-api";
import type { OpenFile } from "@/features/editor/store/use-editor-store";
import type { TerminalCenterTab } from "@/features/terminal/store/use-terminal-store";
import type { TerminalPaneAgent } from "@/features/terminal/types/index";
import type { TerminalPaneProps } from "@/features/terminal/types/index";
import type { Project, Workspace } from "@/shared/types/domain";
import type { GithubCenterTab } from "@/features/github/store/use-github-center-tabs";
import type { BrowserCenterTab } from "@/features/run-preview/store/use-browser-center-tabs";
import type { MountPlan } from "@/app-shell/workspace-surface-policies";
import type { TerminalGridHandle } from "@/features/terminal/components/TerminalGrid";
import type { RefObject } from "react";

export type TerminalQuickOpenAgent = {
  agent: TerminalPaneAgent;
  command: string;
};

export type WorkspaceCenterFrameProps = {
  contextId: string;
  isActiveContext: boolean;
  isUrlSyncedActive: boolean;
  /** Mount keys for this context only (stable string for memo). */
  mountPlanKeys: string;
  mountedTabIds: readonly string[];
  fallbackTerminalTitle: string;
  /** Full plan needed for isKeyMounted; host should pass stable ref when keys unchanged. */
  mountPlan: MountPlan;
  // --- URL-synced live props (ignored for warm equality when not url-synced) ---
  activeValue: string | null;
  visibleTerminalTabs: TerminalCenterTab[] | undefined;
  openFiles: OpenFile[] | undefined;
  githubTabs: GithubCenterTab[] | undefined;
  browserTabs: BrowserCenterTab[] | undefined;
  currentView: string | undefined;
  currentProject: Project | undefined;
  currentWorkspace: Workspace | undefined;
  currentBranch: string | null | undefined;
  currentRepoPath: string | null | undefined;
  reviewTarget: ReviewTarget | null | undefined;
  projectWikiTabVisible: boolean;
  codeReviewTabVisible: boolean;
  terminalQuickOpenAgents: TerminalQuickOpenAgent[] | undefined;
  terminalGridRef: RefObject<TerminalGridHandle | null> | undefined;
  terminalGridRefs: RefObject<Record<string, TerminalGridHandle | null>> | undefined;
  projectWikiTerminalGridRef: RefObject<TerminalGridHandle | null> | undefined;
  codeReviewTerminalGridRef: RefObject<TerminalGridHandle | null> | undefined;
  handleCreateTerminalCenterTab: (() => void) | undefined;
  handleTerminalPaneClosed:
    | ((event: {
        paneId: string;
        pane: TerminalPaneProps;
        terminalTabId: string;
        isLastPane: boolean;
      }) => void)
    | undefined;
  handleCloseGithubTab: ((value: string) => void) | undefined;
  onGithubPullRequestChanged: (() => void) | undefined;
};

function sameStringList(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Warm frames only care about paint + mount identity. URL/host props are ignored
 * so parent re-renders (tab bar, open files on the active hop) do not walk warm trees.
 */
export function workspaceCenterFramePropsAreEqual(
  prev: WorkspaceCenterFrameProps,
  next: WorkspaceCenterFrameProps,
): boolean {
  if (prev.contextId !== next.contextId) return false;
  if (prev.isActiveContext !== next.isActiveContext) return false;
  if (prev.isUrlSyncedActive !== next.isUrlSyncedActive) return false;
  if (prev.mountPlanKeys !== next.mountPlanKeys) return false;
  if (prev.fallbackTerminalTitle !== next.fallbackTerminalTitle) return false;
  if (!sameStringList(prev.mountedTabIds, next.mountedTabIds)) return false;
  // mountPlan object identity may churn globally; this frame only cares about its keys.

  // Both warm / non-url-synced: skip host chrome props entirely.
  if (!prev.isUrlSyncedActive && !next.isUrlSyncedActive) {
    return true;
  }

  return (
    prev.activeValue === next.activeValue &&
    prev.visibleTerminalTabs === next.visibleTerminalTabs &&
    prev.openFiles === next.openFiles &&
    prev.githubTabs === next.githubTabs &&
    prev.browserTabs === next.browserTabs &&
    prev.currentView === next.currentView &&
    prev.currentProject === next.currentProject &&
    prev.currentWorkspace === next.currentWorkspace &&
    prev.currentBranch === next.currentBranch &&
    prev.currentRepoPath === next.currentRepoPath &&
    prev.reviewTarget === next.reviewTarget &&
    prev.projectWikiTabVisible === next.projectWikiTabVisible &&
    prev.codeReviewTabVisible === next.codeReviewTabVisible &&
    prev.terminalQuickOpenAgents === next.terminalQuickOpenAgents &&
    prev.terminalGridRef === next.terminalGridRef &&
    prev.terminalGridRefs === next.terminalGridRefs &&
    prev.projectWikiTerminalGridRef === next.projectWikiTerminalGridRef &&
    prev.codeReviewTerminalGridRef === next.codeReviewTerminalGridRef &&
    prev.handleCreateTerminalCenterTab === next.handleCreateTerminalCenterTab &&
    prev.handleTerminalPaneClosed === next.handleTerminalPaneClosed &&
    prev.handleCloseGithubTab === next.handleCloseGithubTab &&
    prev.onGithubPullRequestChanged === next.onGithubPullRequestChanged
  );
}
