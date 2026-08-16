import { describe, expect, it } from "bun:test";
import {
  collectSavedSurfaces,
  materializeSavedLayout,
  normalizeSavedCenterLayouts,
  snapshotCenterLayout,
  tabIdToSurfaceKind,
} from "@/app-shell/center-pane/center-pane-saved-layout";
import {
  createDefaultLayout,
  DEFAULT_PANE_ID,
  splitPane,
} from "@/app-shell/center-pane/center-pane-layout";
import { FIXED_TERMINAL_TAB_VALUE } from "@/features/terminal/store/use-terminal-store";

describe("center-pane-saved-layout", () => {
  it("maps live tab ids to portable surface kinds", () => {
    expect(tabIdToSurfaceKind("files")).toBe("files");
    expect(tabIdToSurfaceKind(FIXED_TERMINAL_TAB_VALUE)).toBe("terminal");
    expect(tabIdToSurfaceKind("overview")).toBe("overview");
    expect(tabIdToSurfaceKind("/Users/me/repo/src/a.ts")).toBeNull();
  });

  it("snapshots multi-pane geometry without context-bound file paths", () => {
    let layout = createDefaultLayout(
      ["terminal", "overview", "files", "/tmp/x.ts"],
      "files",
    );
    layout = splitPane(layout, { direction: "right", moveTabId: "files" });
    const snap = snapshotCenterLayout(layout, "Files side");
    expect(snap).not.toBeNull();
    expect(snap!.name).toBe("Files side");
    expect(snap!.columnCount).toBeGreaterThanOrEqual(2);
    expect(snap!.columnFractions.length).toBe(snap!.columnCount);
    const allSurfaces = collectSavedSurfaces(snap!);
    expect(allSurfaces).toContain("files");
    expect(allSurfaces).not.toContain("/tmp/x.ts" as never);
    for (const pane of snap!.panes) {
      expect(pane.surfaces.every((s) => typeof s === "string")).toBe(true);
    }
  });

  it("normalizes raw disk/cache payloads and drops junk", () => {
    const ok = {
      id: "layout-1",
      name: "Dual",
      createdAt: 1,
      updatedAt: 2,
      columnCount: 2,
      columnFractions: [0.5, 0.5],
      rowFractions: [1],
      order: ["pane-main", "pane-2"],
      panes: [
        { id: "pane-main", surfaces: ["overview"], activeSurface: "overview" },
      ],
    };
    expect(normalizeSavedCenterLayouts([ok, { id: 1 }, null, "x"])).toEqual([
      ok,
    ]);
    expect(normalizeSavedCenterLayouts(null)).toEqual([]);
  });

  it("materializes a saved layout into live tab ids for a context", () => {
    let layout = createDefaultLayout(["terminal", "overview", "files"], "files");
    layout = splitPane(layout, { direction: "right", moveTabId: "files" });
    const snap = snapshotCenterLayout(layout, "Side files")!;
    const live = materializeSavedLayout(snap, (kind) => {
      if (kind === "terminal") return FIXED_TERMINAL_TAB_VALUE;
      return kind;
    });
    expect(live.columnCount).toBe(snap.columnCount);
    expect(live.columnFractions).toEqual(snap.columnFractions);
    expect(live.rowFractions).toEqual(snap.rowFractions);
    const filesPane = live.panes.find((p) => p.tabIds.includes("files"));
    expect(filesPane).toBeDefined();
    expect(live.panes.some((p) => p.id === DEFAULT_PANE_ID || p.tabIds.includes("overview") || p.tabIds.includes(FIXED_TERMINAL_TAB_VALUE))).toBe(true);
  });
});
