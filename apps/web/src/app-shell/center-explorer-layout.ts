import type { CSSProperties } from "react";

import { FIXED_TABS } from "@/app-shell/center-stage-fixed-tabs";
import { CHANGES_TAB_VALUE, FILES_TAB_VALUE } from "@/app-shell/center-tool-tabs";
import { isDiffGroupEditorPath } from "@/features/diff/lib/diff-editor-paths";
import {
  isConflictResolveEditorPath,
  isDiffEditorPath,
} from "@/features/editor/store/editor-store-paths";
import type { OpenFile } from "@/features/editor/store/editor-store-types";
import { FIXED_TERMINAL_TAB_VALUE } from "@/features/terminal/lib/terminal-layout-document";

/** Match `TERMINAL_TAB_VALUE_PREFIX` without importing the terminal store graph. */
const TERMINAL_TAB_VALUE_PREFIX = "terminal-tab:";

export const CENTER_EXPLORER_DEFAULT_WIDTH = 260;
/** Smallest persisted open width; matches collapse floor so drag is not stuck. */
export const CENTER_EXPLORER_MIN_WIDTH = 130;
export const CENTER_EXPLORER_MAX_WIDTH = 480;
/**
 * Dragging thinner than this collapses the sidecar (same as the fold toggle).
 * Equal to min so there is no stuck dead-zone between collapse and clamp.
 */
export const CENTER_EXPLORER_COLLAPSE_WIDTH = 130;
/**
 * While still pointer-down after auto-collapse, widening past this reopens.
 * Slightly above collapse width to avoid edge flicker.
 */
export const CENTER_EXPLORER_REOPEN_WIDTH = 145;
/** `h-8` chrome (32px). Sidecar starts below this. */
export const CENTER_EXPLORER_CHROME_OFFSET_PX = 32;
export const CENTER_EXPLORER_INSET_CUSTOM_PROP = "--center-explorer-inset";
/** Match LeftSidebarLaunchpad collapse timing. */
export const CENTER_EXPLORER_COLLAPSE_TRANSITION_MS = 300;
export const CENTER_EXPLORER_COLLAPSE_TRANSITION_CLASS =
  "transition-[width,left] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";
export const CENTER_EXPLORER_BODY_INSET_CLASS =
  "min-w-0 w-[calc(100%-var(--center-explorer-inset,0px))] self-start transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none in-[[data-workspace-frame][data-center-explorer-resizing]]:transition-none in-[[data-workspace-frame]:not([data-center-explorer-collapsing])]:transition-none";

export type CenterExplorerKind = "files" | "changes";

export type CenterExplorerSlotBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function isUsableExplorerSlotBox(
  box: CenterExplorerSlotBox | null | undefined,
): box is CenterExplorerSlotBox {
  return Boolean(box && box.width > 0 && box.height > 0);
}

/** Prefer the pane's measured content slot; if unhosted, use the sole usable box. */
export function resolveExplorerSlotBox(
  paneId: string | undefined,
  paneSlotBoxes: Readonly<Record<string, CenterExplorerSlotBox>> | null | undefined,
): CenterExplorerSlotBox | null {
  if (paneId) {
    const box = paneSlotBoxes?.[paneId];
    return isUsableExplorerSlotBox(box) ? box : null;
  }
  if (!paneSlotBoxes) return null;
  const usable = Object.values(paneSlotBoxes).filter(isUsableExplorerSlotBox);
  return usable.length === 1 ? usable[0]! : null;
}

/**
 * Overlay hosting always passes `multiActiveTabIds` — even for one pane.
 * Right-anchor the sidecar whenever this is not a true multi-pane mosaic so
 * slot remasure (editor mode switches) cannot CSS-transition `left`.
 * Only count usable slot boxes (ignore zero-size leftovers).
 */
export function isCenterExplorerSinglePaneLayout(input: {
  multiActiveTabIds?: readonly string[] | null;
  paneSlotBoxes?: Readonly<Record<string, CenterExplorerSlotBox>> | null;
}): boolean {
  const usableBoxes = input.paneSlotBoxes
    ? Object.values(input.paneSlotBoxes).filter(isUsableExplorerSlotBox)
    : [];
  if (usableBoxes.length > 1) return false;
  if (usableBoxes.length === 1) return true;
  return !input.multiActiveTabIds || input.multiActiveTabIds.length <= 1;
}

export function clampCenterExplorerWidth(width: number): number {
  if (!Number.isFinite(width)) return CENTER_EXPLORER_DEFAULT_WIDTH;
  return Math.min(
    CENTER_EXPLORER_MAX_WIDTH,
    Math.max(CENTER_EXPLORER_MIN_WIDTH, Math.round(width)),
  );
}

export type CenterExplorerResizeOutcome =
  | { action: "resize"; width: number }
  | { action: "collapse" };

/**
 * Resolve a live drag width across open/collapsed.
 * Collapse below `CENTER_EXPLORER_COLLAPSE_WIDTH`; while collapsed, reopen at
 * `CENTER_EXPLORER_REOPEN_WIDTH` (hysteresis) so the same pointer-down can pull
 * the sidecar back open.
 */
export function resolveCenterExplorerResize(
  rawWidth: number,
  options?: { collapsed?: boolean },
): CenterExplorerResizeOutcome {
  if (!Number.isFinite(rawWidth)) {
    return { action: "resize", width: CENTER_EXPLORER_DEFAULT_WIDTH };
  }
  const rounded = Math.round(rawWidth);
  if (options?.collapsed) {
    if (rounded >= CENTER_EXPLORER_REOPEN_WIDTH) {
      return { action: "resize", width: clampCenterExplorerWidth(rounded) };
    }
    return { action: "collapse" };
  }
  if (rounded < CENTER_EXPLORER_COLLAPSE_WIDTH) {
    return { action: "collapse" };
  }
  return { action: "resize", width: clampCenterExplorerWidth(rounded) };
}

export function regularEditorFilePaths(
  openFiles: readonly OpenFile[] | null | undefined,
): string[] {
  if (!openFiles) return [];
  return openFiles
    .filter(
      (file) =>
        !isDiffEditorPath(file.path) && !isConflictResolveEditorPath(file.path),
    )
    .map((file) => file.path);
}

/**
 * Center tabs that must not keep the shared Files fold chrome active.
 * Used so a newly opened file path can stay on Files before `openFiles`
 * catches up — otherwise the fold bar width/inset briefly collapses (flash).
 */
function isNonFileExplorerCenterTab(tabId: string): boolean {
  if (isChangesExplorerSurfaceTab(tabId)) return true;
  if (tabId === FILES_TAB_VALUE) return false;
  if (FIXED_TABS.has(tabId)) return true;
  if (
    tabId === FIXED_TERMINAL_TAB_VALUE ||
    tabId.startsWith(TERMINAL_TAB_VALUE_PREFIX)
  ) {
    return true;
  }
  if (isDiffEditorPath(tabId) || isConflictResolveEditorPath(tabId)) return true;
  if (
    tabId.startsWith("github-pr:") ||
    tabId.startsWith("github-issue:") ||
    tabId.startsWith("github-action:") ||
    tabId.startsWith("github-commit:") ||
    tabId.startsWith("browser:") ||
    tabId.startsWith("agent-chat:")
  ) {
    return true;
  }
  return false;
}

export function isFileExplorerSurfaceTab(
  tabId: string | null | undefined,
  regularFilePathSet: ReadonlySet<string>,
): boolean {
  if (!tabId) return false;
  if (tabId === FILES_TAB_VALUE) return true;
  if (regularFilePathSet.has(tabId)) return true;
  // File → file (or first open): active tab already switched, openFiles may lag.
  return !isNonFileExplorerCenterTab(tabId);
}

export function isChangesExplorerSurfaceTab(
  tabId: string | null | undefined,
): boolean {
  if (!tabId) return false;
  return tabId === CHANGES_TAB_VALUE || isDiffGroupEditorPath(tabId);
}

/**
 * Fold/collapse identity for Changes. Each DiffGroup option is its own list —
 * do not share one fold bar across `diff-group://unstaged` vs staged/branch/…
 * Landing `changes` is a separate scope from every DiffGroup tab.
 */
export function changesExplorerFoldScopeId(
  tabId: string | null | undefined,
): string | null {
  if (!tabId) return null;
  if (tabId === CHANGES_TAB_VALUE) return CHANGES_TAB_VALUE;
  if (isDiffGroupEditorPath(tabId)) return tabId;
  return null;
}

export function collectChangesExplorerFoldScopeIds(input: {
  changesTabVisible: boolean;
  openDiffGroupPaths: readonly string[];
}): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  if (input.changesTabVisible) push(CHANGES_TAB_VALUE);
  for (const path of input.openDiffGroupPaths) {
    if (isDiffGroupEditorPath(path)) push(path);
  }
  return ids;
}

export function collectUniqueHostPaneIds(
  tabIds: readonly string[],
  hostedPaneIds: (tabId: string) => ReadonlyArray<string | undefined>,
): Array<string | undefined> {
  const seen = new Set<string>();
  const result: Array<string | undefined> = [];
  for (const tabId of tabIds) {
    for (const paneId of hostedPaneIds(tabId)) {
      const key = paneId ?? "__root__";
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(paneId);
    }
  }
  return result;
}

/**
 * Keep explorer sidecar hosts stable across tab→pane map catch-up.
 * Drop `__root__` (undefined) once any real pane id exists so React keys do not
 * remount the fold rail. Single-pane always collapses to one host.
 */
export function stabilizeExplorerHostPaneIds(
  hosts: ReadonlyArray<string | undefined>,
  options?: { singlePane?: boolean },
): Array<string | undefined> {
  const defined: string[] = [];
  const seen = new Set<string>();
  for (const id of hosts) {
    if (typeof id !== "string" || id.length === 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    defined.push(id);
  }
  if (options?.singlePane) {
    return defined.length > 0 ? [defined[0]!] : [undefined];
  }
  if (defined.length > 0) return defined;
  return hosts.length > 0 ? [...hosts] : [undefined];
}

/**
 * CSS width/left fold transition only when the collapsed pref flips while the
 * explorer surface stays active. Surface swaps (Files↔Changes, deferred tab
 * catch-up) must snap — otherwise the rail shrinks then grows.
 */
export function shouldAnimateExplorerFold(input: {
  prevCollapsed: boolean;
  nextCollapsed: boolean;
  prevSurfaceActive: boolean;
  nextSurfaceActive: boolean;
}): boolean {
  return (
    input.prevCollapsed !== input.nextCollapsed &&
    input.prevSurfaceActive === input.nextSurfaceActive
  );
}

export function paneActiveTabId(input: {
  paneId: string | undefined;
  paneActiveTabById?: Readonly<Record<string, string>> | null;
  frameActiveTab: string | null | undefined;
}): string | null {
  if (input.paneId && input.paneActiveTabById) {
    return input.paneActiveTabById[input.paneId] ?? null;
  }
  return input.frameActiveTab ?? null;
}

export function applyExplorerInsetToPanelStyle(
  style: CSSProperties | undefined,
  inset: number,
): CSSProperties | undefined {
  if (inset <= 0) return style;
  return {
    ...style,
    [CENTER_EXPLORER_INSET_CUSTOM_PROP]: `${Math.round(inset)}px`,
  } as CSSProperties;
}

export function explorerSidecarStyle(input: {
  singlePane: boolean;
  box?: CenterExplorerSlotBox | null;
  width: number;
  takingSpace: boolean;
  radius: string;
  chromeOffset?: number;
}): CSSProperties {
  const displayWidth = input.takingSpace ? input.width : 0;
  const chromeOffset = Math.max(
    0,
    input.chromeOffset ?? CENTER_EXPLORER_CHROME_OFFSET_PX,
  );
  const leftRadius = input.takingSpace ? input.radius : undefined;
  const slot = isUsableExplorerSlotBox(input.box) ? input.box : null;
  // Overlay panels sit in `[data-center-pane-content-slot]` (below the pane tab
  // bar). Sidecar must share that vertical origin — `top: chromeOffset` alone
  // pins to the card top and draws the border above the in-panel chrome.
  const top = (slot?.top ?? 0) + chromeOffset;
  const height = slot ? Math.max(0, slot.height - chromeOffset) : undefined;
  // Prefer right-anchor unless we have a true mosaic slot large enough to dock.
  // Zero/stale boxes previously produced left < 0 or height 0 → "invisible" sidecar.
  const useMosaic =
    !input.singlePane &&
    slot != null &&
    slot.width > displayWidth &&
    (height ?? 0) > 0;
  if (!useMosaic) {
    return {
      top,
      right: 0,
      bottom: height == null ? 0 : undefined,
      left: "auto",
      width: displayWidth,
      height: height ?? "auto",
      // Above full-bleed light surfaces (`z-[1]`) so the list is not covered.
      zIndex: 10,
      borderTopLeftRadius: leftRadius,
      borderBottomLeftRadius: leftRadius,
      borderBottomRightRadius: input.radius,
    };
  }
  return {
    top,
    left: slot!.left + slot!.width - displayWidth,
    width: displayWidth,
    height,
    zIndex: 10,
    borderTopLeftRadius: leftRadius,
    borderBottomLeftRadius: leftRadius,
    borderBottomRightRadius: input.radius,
  };
}
