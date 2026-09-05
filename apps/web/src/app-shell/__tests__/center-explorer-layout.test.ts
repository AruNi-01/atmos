import { describe, expect, test } from "bun:test";
import {
  applyExplorerInsetToPanelStyle,
  clampCenterExplorerWidth,
  collectUniqueHostPaneIds,
  explorerSidecarStyle,
  isChangesExplorerSurfaceTab,
  isFileExplorerSurfaceTab,
  paneActiveTabId,
  regularEditorFilePaths,
  CENTER_EXPLORER_CHROME_OFFSET_PX,
  CENTER_EXPLORER_DEFAULT_WIDTH,
  CENTER_EXPLORER_INSET_CUSTOM_PROP,
} from "@/app-shell/center-explorer-layout";
import type { OpenFile } from "@/features/editor/store/editor-store-types";

function file(path: string): OpenFile {
  return {
    path,
    name: path.split("/").pop() ?? path,
    content: "",
    originalContent: "",
    language: "plaintext",
    isSymlink: false,
    isDirty: false,
    isLoading: false,
    isPreview: false,
    lastOpenedAt: 1,
    lastFocusedAt: 1,
  };
}

describe("center explorer layout", () => {
  test("classifies files and untitled notes as file explorer surfaces", () => {
    const paths = regularEditorFilePaths([
      file("/repo/src/a.ts"),
      file("untitled:Untitled.md"),
      file("diff-group://unstaged"),
      file("git-conflict-resolve://merge-conflicts"),
      file("review-diff://abc/src/a.ts"),
    ]);
    const set = new Set(paths);
    expect(paths).toEqual(["/repo/src/a.ts", "untitled:Untitled.md"]);
    expect(isFileExplorerSurfaceTab("files", set)).toBe(true);
    expect(isFileExplorerSurfaceTab("/repo/src/a.ts", set)).toBe(true);
    expect(isFileExplorerSurfaceTab("untitled:Untitled.md", set)).toBe(true);
    expect(isFileExplorerSurfaceTab("diff-group://unstaged", set)).toBe(false);
    expect(isFileExplorerSurfaceTab("terminal", set)).toBe(false);
  });

  test("classifies changes and diff-group tabs as changes explorer surfaces", () => {
    expect(isChangesExplorerSurfaceTab("changes")).toBe(true);
    expect(isChangesExplorerSurfaceTab("diff-group://staged")).toBe(true);
    expect(isChangesExplorerSurfaceTab("git-history")).toBe(false);
    expect(isChangesExplorerSurfaceTab("/repo/src/a.ts")).toBe(false);
    expect(isChangesExplorerSurfaceTab("review-diff://abc/src/a.ts")).toBe(false);
  });

  test("keeps one host pane id when several file tabs share a pane", () => {
    const hosts = collectUniqueHostPaneIds(
      ["files", "/repo/a.ts", "/repo/b.ts"],
      (tabId) => (tabId === "files" ? ["pane-a"] : ["pane-a"]),
    );
    expect(hosts).toEqual(["pane-a"]);
  });

  test("sets a CSS inset variable instead of shrinking the panel geometry", () => {
    expect(applyExplorerInsetToPanelStyle(undefined, 0)).toBeUndefined();
    expect(applyExplorerInsetToPanelStyle(undefined, 260)).toEqual({
      [CENTER_EXPLORER_INSET_CUSTOM_PROP]: "260px",
    });
    expect(
      applyExplorerInsetToPanelStyle({ width: 800, left: 10, top: 0 }, 260),
    ).toEqual({
      width: 800,
      left: 10,
      top: 0,
      [CENTER_EXPLORER_INSET_CUSTOM_PROP]: "260px",
    });
  });

  test("pins the sidecar below chrome on the right of a mosaic slot", () => {
    const style = explorerSidecarStyle({
      singlePane: false,
      box: { top: 8, left: 20, width: 600, height: 400 },
      width: 260,
      takingSpace: true,
      radius: "12px",
    });
    expect(style.top).toBe(8 + CENTER_EXPLORER_CHROME_OFFSET_PX);
    expect(style.left).toBe(360);
    expect(style.width).toBe(260);
    expect(style.height).toBe(400 - CENTER_EXPLORER_CHROME_OFFSET_PX);
  });

  test("starts the single-pane sidecar below chrome", () => {
    const style = explorerSidecarStyle({
      singlePane: true,
      width: 260,
      takingSpace: true,
      radius: "12px",
    });
    expect(style.top).toBe(CENTER_EXPLORER_CHROME_OFFSET_PX);
    expect(style.right).toBe(0);
    expect(style.bottom).toBe(0);
    expect(style.width).toBe(260);
  });

  test("collapses sidecar width to zero without changing the inner default", () => {
    expect(clampCenterExplorerWidth(Number.NaN)).toBe(CENTER_EXPLORER_DEFAULT_WIDTH);
    const collapsed = explorerSidecarStyle({
      singlePane: true,
      width: 260,
      takingSpace: false,
      radius: "12px",
    });
    expect(collapsed.width).toBe(0);
  });

  test("reads the pane active tab in mosaic and falls back on the frame tab", () => {
    expect(
      paneActiveTabId({
        paneId: "pane-a",
        paneActiveTabById: { "pane-a": "/repo/a.ts" },
        frameActiveTab: "terminal",
      }),
    ).toBe("/repo/a.ts");
    expect(
      paneActiveTabId({
        paneId: undefined,
        paneActiveTabById: { "pane-a": "/repo/a.ts" },
        frameActiveTab: "files",
      }),
    ).toBe("files");
  });
});
