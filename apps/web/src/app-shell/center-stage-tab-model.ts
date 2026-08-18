import type { MouseEvent, PointerEvent } from "react";
import type { OpenFile } from "@/features/editor/store/use-editor-store";

/** Closable center-stage tab kinds that appear in the tab strip. */
export type CenterTabKind =
  | "terminal"
  | "project-wiki"
  | "code-review"
  | "file"
  | "diff"
  | "diff-group"
  | "review-diff"
  | "conflict"
  | "github-pr"
  | "github-issue"
  | "github-action"
  | "github-commit"
  | "github"
  | "browser"
  | "simulator"
  | "git-history"
  | "changes"
  | "review"
  | "run"
  | "files"
  | "pt-design";

/**
 * Visual-order descriptor for a closable center tab.
 * Used by the tab bar, context menu (close left/right/others), and strip drag order.
 */
export type CenterTabDescriptor = {
  /** Stable id for React keys / menu targeting (usually same as value). */
  id: string;
  /** TabsTab value / route tab id. */
  value: string;
  kind: CenterTabKind;
  label: string;
  /** Present for editor/diff/conflict/review file tabs. */
  file?: OpenFile;
  /** Terminal custom title (rename draft seed). */
  customTitle?: string;
};

export type CenterTabContextMenuState = {
  x: number;
  y: number;
  tab: CenterTabDescriptor;
  /** Visual order snapshot at menu open (for close left/right/others). */
  orderedTabs: CenterTabDescriptor[];
} | null;

export function isFileLikeCenterTabKind(kind: CenterTabKind): boolean {
  return (
    kind === "file" ||
    kind === "diff" ||
    kind === "diff-group" ||
    kind === "review-diff" ||
    kind === "conflict"
  );
}

export function isGithubCenterTabKind(kind: CenterTabKind): boolean {
  return (
    kind === "github-pr" ||
    kind === "github-issue" ||
    kind === "github-action" ||
    kind === "github-commit"
  );
}

/**
 * Default strip membership order used only when the user has never dragged
 * (or when seeding a first saved order). Type grouping here is a fallback,
 * not the add-tab rule — new tabs always go to the end of the strip.
 */
export function collectDefaultCenterStripTabIds(input: {
  terminalTabIds: readonly string[];
  projectWikiVisible?: boolean;
  codeReviewVisible?: boolean;
  simulatorVisible?: boolean;
  gitHistoryVisible?: boolean;
  changesVisible?: boolean;
  reviewVisible?: boolean;
  runVisible?: boolean;
  githubHubVisible?: boolean;
  filesVisible?: boolean;
  ptDesignVisible?: boolean;
  surfaceTabIds?: readonly string[];
}): string[] {
  const ids: string[] = [...input.terminalTabIds];
  if (input.projectWikiVisible) ids.push("project-wiki");
  if (input.codeReviewVisible) ids.push("code-review");
  if (input.simulatorVisible) ids.push("simulator");
  if (input.gitHistoryVisible) ids.push("git-history");
  if (input.changesVisible) ids.push("changes");
  if (input.reviewVisible) ids.push("review");
  if (input.runVisible) ids.push("run");
  if (input.githubHubVisible) ids.push("github");
  if (input.filesVisible) ids.push("files");
  if (input.ptDesignVisible) ids.push("pt-design");
  if (input.surfaceTabIds) ids.push(...input.surfaceTabIds);
  return ids;
}

/**
 * Apply a saved strip order. Known ids keep relative saved positions; new tabs
 * append in the order they appear in `tabs`.
 *
 * Independent of the grouped-tab popover order.
 */
export function orderCenterTabsBySavedOrder(
  tabs: CenterTabDescriptor[],
  savedOrder?: string[],
): CenterTabDescriptor[] {
  if (!savedOrder?.length) return tabs;
  const remaining = new Map(tabs.map((tab) => [tab.id, tab]));
  const ordered: CenterTabDescriptor[] = [];
  for (const id of savedOrder) {
    const tab = remaining.get(id);
    if (!tab) continue;
    ordered.push(tab);
    remaining.delete(id);
  }
  for (const tab of tabs) {
    if (remaining.has(tab.id)) ordered.push(tab);
  }
  return ordered;
}

/**
 * Put a newly added center strip tab at the end.
 * Already-open tabs stay put. If there is no saved drag order yet, seed from
 * the current visual strip so the new tab is not inserted into a type group.
 */
export function appendCenterTabToStripOrder(
  savedOrder: string[] | undefined,
  currentVisualIds: readonly string[],
  newTabId: string,
): string[] {
  if (currentVisualIds.includes(newTabId)) {
    return savedOrder?.length ? [...savedOrder] : [...currentVisualIds];
  }
  const base = savedOrder?.length
    ? savedOrder.filter((id) => id !== newTabId)
    : currentVisualIds.filter((id) => id !== newTabId);
  return [...base, newTabId];
}

/**
 * Block non-primary pointer from activating a tab (right-click must not switch).
 * Call from onPointerDown on CenterStageTab.
 */
export function preventNonPrimaryTabActivate(
  event: PointerEvent | MouseEvent,
): void {
  if ("button" in event && event.button !== 0) {
    event.preventDefault();
    event.stopPropagation();
  }
}
