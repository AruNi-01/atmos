import type { CSSProperties } from "react";

import { CHANGES_TAB_VALUE, FILES_TAB_VALUE } from "@/app-shell/center-tool-tabs";
import { isDiffGroupEditorPath } from "@/features/diff/lib/diff-editor-paths";
import {
  isConflictResolveEditorPath,
  isDiffEditorPath,
} from "@/features/editor/store/editor-store-paths";
import type { OpenFile } from "@/features/editor/store/editor-store-types";

export const CENTER_EXPLORER_DEFAULT_WIDTH = 260;
export const CENTER_EXPLORER_MIN_WIDTH = 180;
export const CENTER_EXPLORER_MAX_WIDTH = 480;

export type CenterExplorerKind = "files" | "changes";

export type CenterExplorerSlotBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function clampCenterExplorerWidth(width: number): number {
  if (!Number.isFinite(width)) return CENTER_EXPLORER_DEFAULT_WIDTH;
  return Math.min(
    CENTER_EXPLORER_MAX_WIDTH,
    Math.max(CENTER_EXPLORER_MIN_WIDTH, Math.round(width)),
  );
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

export function isFileExplorerSurfaceTab(
  tabId: string | null | undefined,
  regularFilePathSet: ReadonlySet<string>,
): boolean {
  if (!tabId) return false;
  if (tabId === FILES_TAB_VALUE) return true;
  return regularFilePathSet.has(tabId);
}

export function isChangesExplorerSurfaceTab(
  tabId: string | null | undefined,
): boolean {
  if (!tabId) return false;
  return tabId === CHANGES_TAB_VALUE || isDiffGroupEditorPath(tabId);
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
  singlePane: boolean,
): CSSProperties | undefined {
  if (inset <= 0) return style;
  if (singlePane) {
    return { ...style, right: inset };
  }
  if (!style || typeof style.width !== "number") return style;
  return { ...style, width: Math.max(0, style.width - inset) };
}

export function explorerSidecarStyle(input: {
  singlePane: boolean;
  box?: CenterExplorerSlotBox | null;
  width: number;
  takingSpace: boolean;
  radius: string;
}): CSSProperties {
  const displayWidth = input.takingSpace ? input.width : 0;
  if (input.singlePane || !input.box) {
    return {
      top: 0,
      right: 0,
      bottom: 0,
      left: "auto",
      width: displayWidth,
      height: "auto",
      borderBottomRightRadius: input.radius,
    };
  }
  return {
    top: input.box.top,
    left: input.box.left + input.box.width - displayWidth,
    width: displayWidth,
    height: input.box.height,
    borderBottomRightRadius: input.radius,
  };
}
