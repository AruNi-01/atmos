import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  collectSavedSurfaces,
  LAYOUT_CENTER_SURFACE_KINDS,
  materializeSavedLayout,
  normalizeSavedCenterLayouts,
  shouldConfirmReplaceCenterLayout,
  snapshotCenterLayout,
  tabIdToSurfaceKind,
} from "@/app-shell/center-pane/center-pane-saved-layout";
import { CENTER_TAB_KINDS } from "@/app-shell/center-stage-tab-model";
import {
  createDefaultLayout,
  DEFAULT_PANE_ID,
  isEmptyPane,
  splitPane,
} from "@/app-shell/center-pane/center-pane-layout";
import { FIXED_TERMINAL_TAB_VALUE } from "@/features/terminal/store/use-terminal-store";

describe("center-pane-saved-layout", () => {
  it("maps every center tab kind, and drops document tabs", () => {
    const saved = new Set<string>(LAYOUT_CENTER_SURFACE_KINDS);
    expect(saved.has("agent-chat")).toBe(true);
    expect(saved.has("run")).toBe(true);
    expect(saved.has("file")).toBe(false);
    for (const kind of CENTER_TAB_KINDS) {
      expect(tabIdToSurfaceKind(kind)).toBe(saved.has(kind) ? kind : null);
    }
    expect(tabIdToSurfaceKind("files")).toBe("files");
    expect(tabIdToSurfaceKind("pt-design")).toBe("pt-design");
    expect(tabIdToSurfaceKind("github")).toBe("github");
    expect(tabIdToSurfaceKind(FIXED_TERMINAL_TAB_VALUE)).toBe("terminal");
    expect(tabIdToSurfaceKind("terminal-tab:abc")).toBe("terminal");
    expect(tabIdToSurfaceKind("browser:ws:abc")).toBe("browser");
    expect(tabIdToSurfaceKind("agent-chat:draft:1")).toBe("agent-chat");
    expect(tabIdToSurfaceKind("agent-chat:chat-1")).toBe("agent-chat");
    expect(tabIdToSurfaceKind("overview")).toBe("overview");
    expect(tabIdToSurfaceKind("git-history")).toBe("git-history");
    expect(tabIdToSurfaceKind("project-wiki")).toBe("project-wiki");
    expect(tabIdToSurfaceKind("wiki")).toBeNull();
    expect(tabIdToSurfaceKind("github-pr:ws:12")).toBeNull();
    expect(tabIdToSurfaceKind("github-issue:ws:4")).toBeNull();
    expect(tabIdToSurfaceKind("review-diff://commit/a")).toBeNull();
    expect(tabIdToSurfaceKind("/Users/me/repo/src/a.ts")).toBeNull();
  });

  it("snapshots mosaic geometry and plus-menu tabs, dropping editor/PR content", () => {
    let layout = createDefaultLayout(
      ["terminal", "overview", "files", "/tmp/x.ts", "github-pr:ws:1"],
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
    expect(allSurfaces).toContain("terminal");
    expect(allSurfaces).toContain("overview");
    expect(allSurfaces).not.toContain("agent-chat");
    expect(allSurfaces).not.toContain("/tmp/x.ts" as never);
    expect(allSurfaces).not.toContain("github-pr:ws:1" as never);
    const secondary = snap!.panes.find((pane) => pane.id !== DEFAULT_PANE_ID);
    expect(secondary?.surfaces).toEqual([]);
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
    const secondary = live.panes.find((p) => p.id !== DEFAULT_PANE_ID);
    expect(secondary && isEmptyPane(secondary)).toBe(true);
    expect(live.panes.some((p) => p.id === DEFAULT_PANE_ID || p.tabIds.includes("overview") || p.tabIds.includes(FIXED_TERMINAL_TAB_VALUE))).toBe(true);
  });

  it("snapshots an open Chat tab as the agent-chat surface", () => {
    const layout = createDefaultLayout(
      ["terminal", "agent-chat:chat-1", "run"],
      "agent-chat:chat-1",
    );
    const snap = snapshotCenterLayout(layout, "With chat");
    expect(snap).not.toBeNull();
    expect(collectSavedSurfaces(snap!)).toEqual(
      expect.arrayContaining(["terminal", "agent-chat", "run"]),
    );
    expect(snap!.panes[0]?.activeSurface).toBe("agent-chat");
    const live = materializeSavedLayout(snap!, (kind, paneId) => {
      if (kind === "agent-chat") return `agent-chat:draft:${paneId}`;
      if (kind === "terminal") return FIXED_TERMINAL_TAB_VALUE;
      return kind;
    });
    const pane = live.panes[0];
    expect(pane?.tabIds).toContain("agent-chat:draft:" + pane?.id);
    expect(pane?.activeTabId).toBe("agent-chat:draft:" + pane?.id);
  });

  it("asks for confirmation when the current stage is not overview-only", () => {
    expect(
      shouldConfirmReplaceCenterLayout({ paneCount: 1, openTabIds: ["overview"] }),
    ).toBe(false);
    expect(
      shouldConfirmReplaceCenterLayout({
        paneCount: 1,
        openTabIds: ["overview", "files"],
      }),
    ).toBe(true);
    expect(
      shouldConfirmReplaceCenterLayout({ paneCount: 2, openTabIds: ["overview"] }),
    ).toBe(true);
  });

  it("opens a saved layout in a new space instead of replacing the current one", () => {
    const stage = readFileSync(join(import.meta.dir, "../CenterStage.tsx"), "utf8");
    const tabBar = readFileSync(join(import.meta.dir, "../CenterStageTabBar.tsx"), "utf8");
    expect(stage).toContain("openNewCenterSpace");
    expect(stage).not.toContain("shouldConfirmReplaceCenterLayout");
    expect(tabBar).toContain("onCreateSpace");
  });
});
