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
import type { BrowserCenterTab } from "@/features/browser/store/use-browser-center-tabs";
import type { MountPlan } from "@/app-shell/workspace-surface-policies";
import type { TerminalGridHandle } from "@/features/terminal/components/TerminalGrid";
import type { RefObject } from "react";

export type TerminalQuickOpenAgent = {
  agent: TerminalPaneAgent;
  command: string;
};

export type PaneSlotBox = {
  top: number;
  left: number;
  width: number;
  height: number;
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
  /**
   * Multi-pane: every pane's active tab is visible simultaneously on the active frame.
   * When null/empty, falls back to single `activeValue` / frameActiveTab behavior.
   */
  activeTabIds?: readonly string[] | null;
  /** Multi-pane: map tab id → pane id for slot positioning. */
  tabToPaneId?: Readonly<Record<string, string>> | null;
  /** Multi-pane: every pane that lists a tab (shareable tabs may have many). */
  tabHostPaneIds?: Readonly<Record<string, readonly string[]>> | null;
  /** Multi-pane: pane id → that pane's active tab. */
  paneActiveTabById?: Readonly<Record<string, string>> | null;
  /** Multi-pane: content-slot boxes relative to the panel host. */
  paneSlotBoxes?: Readonly<Record<string, PaneSlotBox>> | null;
  /** Mosaic pane filling the center body; sibling overlay content is hidden. */
  fullscreenPaneId?: string | null;
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
  simulatorTabVisible: boolean;
  gitHistoryTabVisible: boolean;
  changesTabVisible: boolean;
  reviewTabVisible: boolean;
  runTabVisible: boolean;
  githubHubTabVisible: boolean;
  filesTabVisible: boolean;
  ptDesignTabVisible: boolean;
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

  // Warm frames skip host chrome, but pane-active retention is per-context
  // identity — changing it must remount/keep the right surfaces.
  if (!prev.isUrlSyncedActive && !next.isUrlSyncedActive) {
    return (
      sameStringList(prev.activeTabIds ?? [], next.activeTabIds ?? []) &&
      prev.tabToPaneId === next.tabToPaneId &&
      prev.tabHostPaneIds === next.tabHostPaneIds &&
      prev.paneActiveTabById === next.paneActiveTabById &&
      prev.paneSlotBoxes === next.paneSlotBoxes &&
      prev.fullscreenPaneId === next.fullscreenPaneId
    );
  }

  return (
    prev.activeValue === next.activeValue &&
    sameStringList(prev.activeTabIds ?? [], next.activeTabIds ?? []) &&
    prev.tabToPaneId === next.tabToPaneId &&
    prev.tabHostPaneIds === next.tabHostPaneIds &&
    prev.paneActiveTabById === next.paneActiveTabById &&
    prev.paneSlotBoxes === next.paneSlotBoxes &&
    prev.fullscreenPaneId === next.fullscreenPaneId &&
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
    prev.simulatorTabVisible === next.simulatorTabVisible &&
    prev.gitHistoryTabVisible === next.gitHistoryTabVisible &&
    prev.changesTabVisible === next.changesTabVisible &&
    prev.reviewTabVisible === next.reviewTabVisible &&
    prev.runTabVisible === next.runTabVisible &&
    prev.githubHubTabVisible === next.githubHubTabVisible &&
    prev.filesTabVisible === next.filesTabVisible &&
    prev.ptDesignTabVisible === next.ptDesignTabVisible &&
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
