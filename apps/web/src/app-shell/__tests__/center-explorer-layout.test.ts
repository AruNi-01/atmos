import { describe, expect, test } from "bun:test";
import {
  applyExplorerInsetToPanelStyle,
  changesExplorerFoldScopeId,
  clampCenterExplorerWidth,
  collectChangesExplorerFoldScopeIds,
  collectUniqueHostPaneIds,
  explorerSidecarStyle,
  isCenterExplorerSinglePaneLayout,
  isChangesExplorerSurfaceTab,
  isFileExplorerSurfaceTab,
  paneActiveTabId,
  regularEditorFilePaths,
  resolveCenterExplorerResize,
  resolveExplorerSlotBox,
  shouldAnimateExplorerFold,
  stabilizeExplorerHostPaneIds,
  CENTER_EXPLORER_BODY_INSET_CLASS,
  CENTER_EXPLORER_CHROME_OFFSET_PX,
  CENTER_EXPLORER_COLLAPSE_TRANSITION_CLASS,
  CENTER_EXPLORER_COLLAPSE_WIDTH,
  CENTER_EXPLORER_DEFAULT_WIDTH,
  CENTER_EXPLORER_INSET_CUSTOM_PROP,
  CENTER_EXPLORER_MIN_WIDTH,
  CENTER_EXPLORER_REOPEN_WIDTH,
} from "@/app-shell/center-explorer-layout";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    // Deferred openFiles: new path not yet in the set still keeps Files chrome.
    expect(isFileExplorerSurfaceTab("/repo/src/new.ts", set)).toBe(true);
    expect(isFileExplorerSurfaceTab("diff-group://unstaged", set)).toBe(false);
    expect(isFileExplorerSurfaceTab("terminal", set)).toBe(false);
    expect(isFileExplorerSurfaceTab("changes", set)).toBe(false);
    expect(isFileExplorerSurfaceTab("overview", set)).toBe(false);
  });

  test("classifies changes and diff-group tabs as changes explorer surfaces", () => {
    expect(isChangesExplorerSurfaceTab("changes")).toBe(true);
    expect(isChangesExplorerSurfaceTab("diff-group://staged")).toBe(true);
    expect(isChangesExplorerSurfaceTab("git-history")).toBe(false);
    expect(isChangesExplorerSurfaceTab("/repo/src/a.ts")).toBe(false);
    expect(isChangesExplorerSurfaceTab("review-diff://abc/src/a.ts")).toBe(false);
  });

  test("isolates Changes fold scope ids per DiffGroup option and landing", () => {
    expect(changesExplorerFoldScopeId("changes")).toBe("changes");
    expect(changesExplorerFoldScopeId("diff-group://unstaged")).toBe(
      "diff-group://unstaged",
    );
    expect(changesExplorerFoldScopeId("diff-group://staged")).toBe(
      "diff-group://staged",
    );
    expect(changesExplorerFoldScopeId("diff-group://commit")).toBe(
      "diff-group://commit",
    );
    expect(changesExplorerFoldScopeId("/repo/a.ts")).toBeNull();
    expect(changesExplorerFoldScopeId("files")).toBeNull();
    expect(
      collectChangesExplorerFoldScopeIds({
        changesTabVisible: true,
        openDiffGroupPaths: [
          "diff-group://unstaged",
          "diff-group://staged",
          "diff-group://unstaged",
          "/repo/a.ts",
        ],
      }),
    ).toEqual(["changes", "diff-group://unstaged", "diff-group://staged"]);
    expect(
      collectChangesExplorerFoldScopeIds({
        changesTabVisible: false,
        openDiffGroupPaths: ["diff-group://branch"],
      }),
    ).toEqual(["diff-group://branch"]);
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
    expect(style.zIndex).toBe(10);
    expect(style.borderTopLeftRadius).toBe("12px");
    expect(style.borderBottomLeftRadius).toBe("12px");
    expect(style.borderBottomRightRadius).toBe("12px");
  });

  test("right-anchors when mosaic box is missing or too small to dock", () => {
    const missing = explorerSidecarStyle({
      singlePane: false,
      box: null,
      width: 260,
      takingSpace: true,
      radius: "12px",
    });
    expect(missing.right).toBe(0);
    expect(missing.left).toBe("auto");
    expect(missing.zIndex).toBe(10);

    const tiny = explorerSidecarStyle({
      singlePane: false,
      box: { top: 0, left: 0, width: 100, height: 40 },
      width: 260,
      takingSpace: true,
      radius: "12px",
    });
    expect(tiny.right).toBe(0);
    expect(tiny.left).toBe("auto");
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
    expect(style.zIndex).toBe(10);
    expect(style.borderTopLeftRadius).toBe("12px");
    expect(style.borderBottomLeftRadius).toBe("12px");
  });

  test("resolves the sole content-slot box when the explorer host has no pane id", () => {
    const sole = { top: 28, left: 0, width: 900, height: 500 };
    expect(
      resolveExplorerSlotBox(undefined, { "pane-a": sole }),
    ).toEqual(sole);
    expect(
      resolveExplorerSlotBox("pane-a", { "pane-a": sole }),
    ).toEqual(sole);
    expect(
      resolveExplorerSlotBox(undefined, {
        "pane-a": sole,
        "pane-b": { top: 0, left: 400, width: 400, height: 500 },
      }),
    ).toBeNull();
  });

  test("single-pane still uses content-slot top so the border sits under in-panel chrome", () => {
    const style = explorerSidecarStyle({
      singlePane: true,
      box: { top: 28, left: 0, width: 900, height: 500 },
      width: 260,
      takingSpace: true,
      radius: "12px",
    });
    expect(style.top).toBe(28 + CENTER_EXPLORER_CHROME_OFFSET_PX);
    expect(style.height).toBe(500 - CENTER_EXPLORER_CHROME_OFFSET_PX);
    expect(style.right).toBe(0);
    expect(style.left).toBe("auto");
    expect(style.bottom).toBeUndefined();
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
    expect(collapsed.borderTopLeftRadius).toBeUndefined();
    expect(collapsed.borderBottomLeftRadius).toBeUndefined();
  });

  test("resolves resize below collapse threshold into collapse instead of a stuck min width", () => {
    expect(CENTER_EXPLORER_COLLAPSE_WIDTH).toBe(130);
    expect(CENTER_EXPLORER_MIN_WIDTH).toBe(130);
    expect(CENTER_EXPLORER_REOPEN_WIDTH).toBe(145);
    expect(resolveCenterExplorerResize(CENTER_EXPLORER_COLLAPSE_WIDTH - 1)).toEqual({
      action: "collapse",
    });
    expect(resolveCenterExplorerResize(CENTER_EXPLORER_COLLAPSE_WIDTH)).toEqual({
      action: "resize",
      width: CENTER_EXPLORER_MIN_WIDTH,
    });
    expect(resolveCenterExplorerResize(220)).toEqual({
      action: "resize",
      width: 220,
    });
    expect(resolveCenterExplorerResize(Number.NaN)).toEqual({
      action: "resize",
      width: CENTER_EXPLORER_DEFAULT_WIDTH,
    });
  });

  test("keeps collapse until reopen hysteresis while pointer-down can pull open again", () => {
    expect(
      resolveCenterExplorerResize(CENTER_EXPLORER_REOPEN_WIDTH - 1, {
        collapsed: true,
      }),
    ).toEqual({ action: "collapse" });
    expect(
      resolveCenterExplorerResize(CENTER_EXPLORER_COLLAPSE_WIDTH, {
        collapsed: true,
      }),
    ).toEqual({ action: "collapse" });
    expect(
      resolveCenterExplorerResize(CENTER_EXPLORER_REOPEN_WIDTH, {
        collapsed: true,
      }),
    ).toEqual({
      action: "resize",
      width: CENTER_EXPLORER_REOPEN_WIDTH,
    });
    expect(
      resolveCenterExplorerResize(200, { collapsed: true }),
    ).toEqual({ action: "resize", width: 200 });
  });

  test("shares collapse transition classes for sidecar and body inset", () => {
    expect(CENTER_EXPLORER_COLLAPSE_TRANSITION_CLASS).toContain("transition-[width,left]");
    expect(CENTER_EXPLORER_BODY_INSET_CLASS).toContain("transition-[width]");
    expect(CENTER_EXPLORER_BODY_INSET_CLASS).toContain(
      "in-[[data-workspace-frame][data-center-explorer-resizing]]:transition-none",
    );
    expect(CENTER_EXPLORER_BODY_INSET_CLASS).toContain(
      "in-[[data-workspace-frame]:not([data-center-explorer-collapsing])]:transition-none",
    );
    const sidecar = readFileSync(
      join(import.meta.dir, "../CenterExplorerSidecar.tsx"),
      "utf8",
    );
    expect(sidecar).toContain("CENTER_EXPLORER_COLLAPSE_TRANSITION_CLASS");
    expect(sidecar).toContain("CENTER_EXPLORER_COLLAPSE_TRANSITION_MS");
    expect(sidecar).toContain("resolveCenterExplorerResize");
    expect(sidecar).toContain("shouldAnimateExplorerFold");
    expect(sidecar).toContain("onCollapse");
    expect(sidecar).toContain("onExpand");
    expect(sidecar).toContain("collapsedDuringDrag");
    expect(sidecar).toContain("takingSpace || isResizing");
    expect(sidecar).toContain("beginThresholdTransition");
    expect(sidecar).toContain("collapseAnimating && !liveResize && CENTER_EXPLORER_COLLAPSE_TRANSITION_CLASS");
    expect(sidecar).toContain("liveResize && \"transition-none\"");
    expect(sidecar).not.toContain("isResizing && \"transition-none\"");
    expect(sidecar).not.toContain("endResize();\n                return;");
    expect(sidecar).toContain('data-center-explorer-resizing={liveResize ? "" : undefined}');
    expect(sidecar).toContain('data-center-explorer-collapsing={collapseAnimating ? "" : undefined}');
    expect(sidecar).toContain("data-center-explorer-resize");
    expect(sidecar).toContain("surfaceActive");
    expect(sidecar).toContain("collapsed");
    // Frame + fill; z-10 above full-bleed light surfaces.
    expect(sidecar).toContain('takingSpace && "border border-r-0 border-border/40 bg-background"');
    expect(sidecar).toContain('"absolute z-10 flex min-h-0 overflow-hidden"');
    expect(sidecar).toContain(
      'className="flex h-full min-h-0 shrink-0 flex-col bg-background pl-[0.5px]"',
    );
    const frame = readFileSync(
      join(import.meta.dir, "../workspace-center-frame.tsx"),
      "utf8",
    );
    expect(frame).toContain("return [undefined]");
    expect(frame).not.toContain("if (tabHostPaneIds || tabToPaneId) return [];");
    expect(frame).toContain("resolveExplorerSlotBox");
    expect(frame).toContain("isCenterExplorerSinglePaneLayout");
    expect(frame).toContain("stabilizeExplorerHostPaneIds");
    expect(frame).toContain("singlePane: explorerSinglePane");
    expect(frame).toContain("collectChangesExplorerFoldScopeIds");
    expect(frame).toContain("changesExplorerFoldScopeIds");
    expect(frame).toContain('surfaceActive={surfaceActive}');
    expect(frame).toContain("collapsed={explorerLayout.filesCollapsed}");
    expect(frame).toContain("explorerLayoutActions.changesForScope(foldScopeId)");
    expect(frame).toContain("`${contextId}-files-explorer`");
    expect(frame).toContain(
      "`${contextId}-changes-explorer-${foldScopeId}`",
    );
    expect(frame).toContain(
      '`${contextId}-changes-explorer-${foldScopeId}-${paneId ?? "root"}`',
    );
    expect(frame).not.toContain(
      '`${contextId}-changes-explorer-${paneId ?? "root"}`',
    );
    expect(frame).not.toContain("singlePane: !multiActiveTabIds");
    expect(frame).not.toContain("paneId ? paneSlotBoxes?.[paneId] : null");
    expect(frame).not.toContain("takingSpace={takingSpace}");
    expect(frame).toContain('onCollapse={() => explorerLayoutActions.setCollapsed("files", true)}');
    expect(frame).toContain(
      'explorerLayoutActions.setCollapsed("changes", true, foldScopeId)',
    );
    expect(frame).toContain('onExpand={() => explorerLayoutActions.setCollapsed("files", false)}');
    expect(frame).toContain(
      'explorerLayoutActions.setCollapsed("changes", false, foldScopeId)',
    );
  });

  test("animates fold only when collapsed flips on a stable surface", () => {
    expect(
      shouldAnimateExplorerFold({
        prevCollapsed: false,
        nextCollapsed: true,
        prevSurfaceActive: true,
        nextSurfaceActive: true,
      }),
    ).toBe(true);
    expect(
      shouldAnimateExplorerFold({
        prevCollapsed: true,
        nextCollapsed: false,
        prevSurfaceActive: true,
        nextSurfaceActive: true,
      }),
    ).toBe(true);
    // Files ↔ Changes (or deferred tab catch-up): snap, do not shrink-then-grow.
    expect(
      shouldAnimateExplorerFold({
        prevCollapsed: false,
        nextCollapsed: false,
        prevSurfaceActive: true,
        nextSurfaceActive: false,
      }),
    ).toBe(false);
    expect(
      shouldAnimateExplorerFold({
        prevCollapsed: false,
        nextCollapsed: false,
        prevSurfaceActive: false,
        nextSurfaceActive: true,
      }),
    ).toBe(false);
    expect(
      shouldAnimateExplorerFold({
        prevCollapsed: false,
        nextCollapsed: true,
        prevSurfaceActive: true,
        nextSurfaceActive: false,
      }),
    ).toBe(false);
  });

  test("stabilizes explorer hosts so undefined root does not remount beside a pane", () => {
    expect(
      stabilizeExplorerHostPaneIds([undefined, "pane-a"], { singlePane: true }),
    ).toEqual(["pane-a"]);
    expect(
      stabilizeExplorerHostPaneIds(["pane-a", undefined], { singlePane: false }),
    ).toEqual(["pane-a"]);
    expect(
      stabilizeExplorerHostPaneIds([undefined], { singlePane: true }),
    ).toEqual([undefined]);
    expect(
      stabilizeExplorerHostPaneIds(["pane-a", "pane-b"], { singlePane: true }),
    ).toEqual(["pane-a"]);
    expect(
      stabilizeExplorerHostPaneIds(["pane-a", "pane-b"], { singlePane: false }),
    ).toEqual(["pane-a", "pane-b"]);
  });

  test("right-anchors when overlay hosts a single pane with multiActiveTabIds", () => {
    expect(
      isCenterExplorerSinglePaneLayout({
        multiActiveTabIds: ["/repo/readme.md"],
        paneSlotBoxes: { "pane-a": { top: 0, left: 0, width: 800, height: 600 } },
      }),
    ).toBe(true);
    expect(
      isCenterExplorerSinglePaneLayout({
        multiActiveTabIds: ["/repo/a.ts", "/repo/b.ts"],
        paneSlotBoxes: {
          "pane-a": { top: 0, left: 0, width: 400, height: 600 },
          "pane-b": { top: 0, left: 400, width: 400, height: 600 },
        },
      }),
    ).toBe(false);
    expect(
      isCenterExplorerSinglePaneLayout({
        multiActiveTabIds: ["/repo/a.ts", "/repo/b.ts"],
        // Zero-size leftover must not force mosaic positioning.
        paneSlotBoxes: {
          "pane-a": { top: 0, left: 0, width: 800, height: 600 },
          "pane-b": { top: 0, left: 0, width: 0, height: 0 },
        },
      }),
    ).toBe(true);
    expect(
      isCenterExplorerSinglePaneLayout({
        multiActiveTabIds: null,
        paneSlotBoxes: null,
      }),
    ).toBe(true);
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
