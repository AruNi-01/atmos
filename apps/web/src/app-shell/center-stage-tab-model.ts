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
  | "browser";

/**
 * Visual-order descriptor for a closable center tab.
 * Used by the tab bar, context menu (close left/right/others), and pin state.
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
  /** Epoch ms when pinned; undefined when unpinned. */
  pinnedAt?: number;
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

/** Sort pinned first by pin time (oldest first), then keep original relative order. */
export function orderCenterTabsByPin(
  tabs: CenterTabDescriptor[],
): CenterTabDescriptor[] {
  const pinned: CenterTabDescriptor[] = [];
  const unpinned: CenterTabDescriptor[] = [];
  for (const tab of tabs) {
    if (typeof tab.pinnedAt === "number") {
      pinned.push(tab);
    } else {
      unpinned.push(tab);
    }
  }
  pinned.sort((left, right) => (left.pinnedAt ?? 0) - (right.pinnedAt ?? 0));
  return [...pinned, ...unpinned];
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
