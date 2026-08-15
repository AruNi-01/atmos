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
  | "browser"
  | "simulator";

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
 * Apply a saved strip order. Known ids keep relative saved positions; new tabs
 * append in the order they appear in `tabs`.
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
 * Block non-primary pointer from activating Base UI Tabs (right-click must not switch).
 * Call from onPointerDown on TabsTab.
 */
export function preventNonPrimaryTabActivate(
  event: PointerEvent | MouseEvent,
): void {
  if ("button" in event && event.button !== 0) {
    event.preventDefault();
    event.stopPropagation();
  }
}
