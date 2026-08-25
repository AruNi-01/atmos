import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyLegacyStripOrder,
  closePane,
  collectActiveTabIds,
  createDefaultLayout,
  DEFAULT_PANE_ID,
  findPaneIdForTab,
  focusPane,
  getPane,
  migrateLegacySinglePaneStripOrder,
  openTabOnFocusedPane,
  reconcileOpenTabs,
  removeTabFromLayout,
  reorderPaneTabIds,
  resolvePaneTabStripOrder,
  setPaneActiveTab,
  splitPane,
} from "@/app-shell/center-pane/center-pane-layout";
import {
  collapsedStripOrderForContext,
  shouldPersistCollapsedStripOrder,
  shouldSeedMosaicFromFullPane,
  shouldSnapPaneTilesOnContextChange,
} from "@/app-shell/center-pane/center-pane-collapse-persist";
import { resolveStripOrderForContext } from "@/app-shell/center-pane/center-pane-strip-prefs";
import { resolvePaneLocalCloseFallback } from "@/app-shell/center-pane/center-pane-close-fallback";
import {
  isBrowserHostFocusTarget,
  paneIdFromOverlayEventTarget,
  resolveOverlayOwnerFromAncestors,
  resolveOverlayOwnerPaneId,
  shouldFocusOwningPane,
} from "@/app-shell/center-pane/center-pane-overlay-focus";
import { areOpenTabIdListSourcesHydrated } from "@/app-shell/center-pane/center-pane-open-tab-hydration";
import { shouldWithholdUnmeasuredPaneTerminal } from "@/app-shell/center-pane/use-center-pane-slot-boxes";
import { applyHorizontalTabStripWheel } from "@/app-shell/center-stage-tab-scroll";
import { applySavedTabGroupOrder } from "@/app-shell/center-stage-tabs";
import {
  paneScopedTabGroupKey,
  readPaneTabGroupOrder,
} from "@/app-shell/center-stage-tab-groups";
import {
  computeMountPlan,
  DEFAULT_SURFACE_BUDGETS,
  isFramePanelVisible,
  lightMountKey,
  resolveWorkspaceFrameActiveTabIds,
  terminalMountKey,
} from "@/app-shell/workspace-surface-policies";
import { workspaceCenterFramePropsAreEqual, type WorkspaceCenterFrameProps } from "@/app-shell/workspace-center-frame-equality";
import type { MountPlan } from "@/app-shell/workspace-surface-policies";

function splitWithSecondaryTab(
  primaryTabs: string[],
  primaryActive: string,
  secondaryTab: string,
) {
  let layout = createDefaultLayout(primaryTabs, primaryActive);
  layout = splitPane(layout, { direction: "right" });
  const secondaryId = layout.order.find((id) => id !== DEFAULT_PANE_ID)!;
  layout = focusPane(layout, secondaryId);
  layout = openTabOnFocusedPane(layout, secondaryTab);
  layout = focusPane(layout, DEFAULT_PANE_ID);
  layout = setPaneActiveTab(layout, DEFAULT_PANE_ID, primaryActive);
  return { layout, secondaryId };
}

describe("content-driven pane focus", () => {
  it("updates the owning pane before a content-triggered open lands", () => {
    const { layout, secondaryId } = splitWithSecondaryTab(["a", "b"], "b", "c");
    expect(layout.focusedPaneId).toBe(DEFAULT_PANE_ID);

    const owner = resolveOverlayOwnerPaneId({
      isActiveFrame: true,
      isInert: false,
      ownerPaneId: secondaryId,
    });
    expect(shouldFocusOwningPane({ paneId: owner, focusedPaneId: layout.focusedPaneId })).toBe(
      true,
    );

    const focused = focusPane(layout, owner!);
    const opened = openTabOnFocusedPane(focused, "new.ts");
    expect(findPaneIdForTab(opened, "new.ts")).toBe(secondaryId);
    expect(getPane(opened, DEFAULT_PANE_ID)!.tabIds).toContain("a");
    expect(getPane(opened, DEFAULT_PANE_ID)!.tabIds).toContain("b");
  });

  it("ignores warm/inert frames so keepalive surfaces do not steal focus", () => {
    expect(
      resolveOverlayOwnerPaneId({
        isActiveFrame: false,
        isInert: true,
        ownerPaneId: "pane-2",
      }),
    ).toBeNull();
    expect(
      shouldFocusOwningPane({
        paneId: resolveOverlayOwnerPaneId({
          isActiveFrame: true,
          isInert: false,
          ownerPaneId: "pane-main",
        }),
        focusedPaneId: "pane-main",
      }),
    ).toBe(false);
  });

  it("maps wiki overlay clicks that sit outside a workspace frame", () => {
    expect(
      resolveOverlayOwnerFromAncestors({
        ownerPaneId: "pane-2",
        frame: null,
      }),
    ).toBe("pane-2");
  });

  it("does not route pointer targets inside inert warm frames", () => {
    expect(
      resolveOverlayOwnerFromAncestors({
        ownerPaneId: "pane-2",
        frame: { tier: "warm", inert: true },
      }),
    ).toBeNull();
  });
});

describe("pane-local close fallback", () => {
  it("keeps B=[c] when closing b from A=[a,b] even if MRU is c", () => {
    const { layout, secondaryId } = splitWithSecondaryTab(["a", "b"], "b", "c");
    expect(getPane(layout, DEFAULT_PANE_ID)!.tabIds).toEqual(["a", "b"]);
    expect(getPane(layout, secondaryId)!.tabIds).toEqual(["c"]);

    const fallback = resolvePaneLocalCloseFallback({
      layoutBefore: layout,
      closedTabIds: ["b"],
      activeTabId: "b",
      openTabValues: new Set(["a", "c", "overview"]),
      mruOrder: ["c", "a"],
      fallbackTab: "overview",
    });
    expect(fallback.nextTabId).toBe("a");
    expect(fallback.attachToFocusedPane).toBe(false);

    const after = removeTabFromLayout(layout, "b");
    expect(getPane(after, secondaryId)!.tabIds).toEqual(["c"]);
    expect(after.panes).toHaveLength(2);
    expect(getPane(after, DEFAULT_PANE_ID)!.tabIds).toEqual(["a"]);

    const copied = openTabOnFocusedPane(after, "c");
    expect(getPane(copied, secondaryId)!.tabIds).toContain("c");
    expect(getPane(copied, DEFAULT_PANE_ID)!.tabIds).toContain("c");
  });

  it("does not steal a sibling when closing several tabs in the primary pane", () => {
    const { layout, secondaryId } = splitWithSecondaryTab(["a", "b", "d"], "d", "c");
    const fallback = resolvePaneLocalCloseFallback({
      layoutBefore: layout,
      closedTabIds: ["b", "d"],
      activeTabId: "d",
      openTabValues: new Set(["a", "c", "overview"]),
      mruOrder: ["c", "a"],
      fallbackTab: "overview",
    });
    expect(fallback.nextTabId).toBe("a");
    let after = removeTabFromLayout(layout, "b");
    after = removeTabFromLayout(after, "d");
    expect(getPane(after, secondaryId)!.tabIds).toEqual(["c"]);
    expect(getPane(after, DEFAULT_PANE_ID)!.tabIds).toContain("a");
  });

  it("updates chrome to the neighbor without attaching when a secondary pane empties", () => {
    const { layout, secondaryId } = splitWithSecondaryTab(["a"], "a", "c");
    const fallback = resolvePaneLocalCloseFallback({
      layoutBefore: layout,
      closedTabIds: ["c"],
      activeTabId: "c",
      openTabValues: new Set(["a", "overview"]),
      mruOrder: ["c", "a"],
      fallbackTab: "overview",
    });
    expect(fallback.nextTabId).toBe("a");
    expect(fallback.attachToFocusedPane).toBe(false);
    const after = removeTabFromLayout(layout, "c");
    expect(after.panes.some((pane) => pane.id === secondaryId)).toBe(false);
    expect(getPane(after, DEFAULT_PANE_ID)!.tabIds).toContain("a");
  });

  it("keeps single-pane MRU close behavior", () => {
    const layout = createDefaultLayout(["a", "b", "c"], "c");
    const fallback = resolvePaneLocalCloseFallback({
      layoutBefore: layout,
      closedTabIds: ["c"],
      activeTabId: "c",
      openTabValues: new Set(["a", "b", "overview"]),
      mruOrder: ["c", "a", "b"],
      fallbackTab: "overview",
    });
    expect(fallback.nextTabId).toBe("a");
  });

  it("does not snap to Overview when the strip starts with it", () => {
    const layout = createDefaultLayout(["overview", "a", "b", "c"], "c");
    const fallback = resolvePaneLocalCloseFallback({
      layoutBefore: layout,
      closedTabIds: ["c"],
      activeTabId: "c",
      openTabValues: new Set(["overview", "a", "b"]),
      mruOrder: ["c", "b", "a", "overview"],
      fallbackTab: "overview",
    });
    expect(fallback.nextTabId).toBe("b");
    const after = removeTabFromLayout(layout, "c", fallback.nextTabId);
    expect(after.panes[0]!.activeTabId).toBe("b");
  });

  it("skips Overview when pane-local MRU is empty and other tabs remain", () => {
    const { layout } = splitWithSecondaryTab(["overview", "a", "b"], "b", "c");
    const fallback = resolvePaneLocalCloseFallback({
      layoutBefore: layout,
      closedTabIds: ["b"],
      activeTabId: "b",
      openTabValues: new Set(["overview", "a", "c"]),
      mruOrder: [],
      fallbackTab: "overview",
    });
    expect(fallback.nextTabId).toBe("a");
    const after = removeTabFromLayout(layout, "b", fallback.nextTabId);
    expect(getPane(after, DEFAULT_PANE_ID)!.activeTabId).toBe("a");
  });

  it("returns Overview when it is the most recently activated remaining tab", () => {
    const layout = createDefaultLayout(["overview", "a", "b"], "b");
    const fallback = resolvePaneLocalCloseFallback({
      layoutBefore: layout,
      closedTabIds: ["b"],
      activeTabId: "b",
      openTabValues: new Set(["overview", "a"]),
      mruOrder: ["overview", "a"],
      fallbackTab: "a",
    });
    expect(fallback.nextTabId).toBe("overview");
  });

  it("skips Overview on single-pane close when the stack has no other entry", () => {
    const layout = createDefaultLayout(["overview", "a", "b"], "b");
    const fallback = resolvePaneLocalCloseFallback({
      layoutBefore: layout,
      closedTabIds: ["b"],
      activeTabId: "b",
      openTabValues: new Set(["overview", "a"]),
      mruOrder: [],
      fallbackTab: "overview",
    });
    expect(fallback.nextTabId).toBe("a");
    const after = removeTabFromLayout(layout, "b", fallback.nextTabId);
    expect(after.panes[0]!.activeTabId).toBe("a");
  });
});

describe("warm multi-pane active retention", () => {
  it("prefer-keeps every pane-active surface on a warm workspace", () => {
    const plan = computeMountPlan({
      activeContextId: "live",
      warm: [{ contextId: "warm-split", lastAccessed: 10 }],
      budgets: {
        ...DEFAULT_SURFACE_BUDGETS,
        maxGlobalTerminalPanes: 8,
        maxGlobalMountedEditors: 10,
      },
      contexts: [
        {
          contextId: "live",
          terminalTabIds: ["terminal"],
          editorPathsRecent: [],
          browserTabValues: [],
          lightIds: [],
          frameActiveTab: "terminal",
        },
        {
          contextId: "warm-split",
          terminalTabIds: ["terminal"],
          editorPathsRecent: ["src/a.ts"],
          browserTabValues: [],
          lightIds: ["overview"],
          namedTerminals: [],
          frameActiveTab: "terminal",
          frameActiveTabIds: ["terminal", "overview"],
        },
      ],
    });
    expect(plan.mounted).toContain(terminalMountKey("warm-split", "terminal"));
    expect(plan.mounted).toContain(lightMountKey("warm-split", "overview"));
  });

  it("does not treat active-context geometry as a warm identity change", () => {
    const emptyPlan: MountPlan = { mounted: [] };
    const base: WorkspaceCenterFrameProps = {
      contextId: "ws-warm",
      isActiveContext: false,
      isUrlSyncedActive: false,
      mountPlanKeys: "terminal:ws-warm:terminal",
      mountedTabIds: ["terminal"],
      fallbackTerminalTitle: "Term",
      mountPlan: emptyPlan,
      activeValue: null,
      activeTabIds: ["terminal", "overview"],
      tabToPaneId: null,
      paneSlotBoxes: null,
      visibleTerminalTabs: undefined,
      openFiles: undefined,
      githubTabs: undefined,
      browserTabs: undefined,
      currentView: undefined,
      currentProject: undefined,
      currentWorkspace: undefined,
      currentBranch: undefined,
      currentRepoPath: undefined,
      reviewTarget: undefined,
      projectWikiTabVisible: false,
      codeReviewTabVisible: false,
      simulatorTabVisible: false,
      gitHistoryTabVisible: false,
      changesTabVisible: false,
      reviewTabVisible: false,
      runTabVisible: false,
      githubHubTabVisible: false,
      filesTabVisible: false,
      ptDesignTabVisible: false,
      terminalQuickOpenAgents: undefined,
      terminalGridRef: undefined,
      terminalGridRefs: undefined,
      projectWikiTerminalGridRef: undefined,
      codeReviewTerminalGridRef: undefined,
      handleCreateTerminalCenterTab: undefined,
      handleTerminalPaneClosed: undefined,
      handleCloseGithubTab: undefined,
      onGithubPullRequestChanged: undefined,
    };
    expect(
      workspaceCenterFramePropsAreEqual(base, {
        ...base,
        openFiles: [] as never,
        activeValue: "other.ts",
        handleCreateTerminalCenterTab: () => {},
      }),
    ).toBe(true);
    expect(
      workspaceCenterFramePropsAreEqual(base, {
        ...base,
        activeTabIds: ["terminal"],
      }),
    ).toBe(false);
  });

  it("keeps warm pane-active terminals without live slot geometry", () => {
    expect(
      shouldWithholdUnmeasuredPaneTerminal({
        applySlotGeometry: false,
        isPaneActive: true,
        slotBox: undefined,
      }),
    ).toBe(false);
    expect(
      shouldWithholdUnmeasuredPaneTerminal({
        applySlotGeometry: true,
        isPaneActive: true,
        slotBox: undefined,
      }),
    ).toBe(true);
    expect(
      shouldWithholdUnmeasuredPaneTerminal({
        applySlotGeometry: true,
        isPaneActive: true,
        slotBox: { top: 0, left: 400, width: 480, height: 320 },
      }),
    ).toBe(false);
  });

  it("activates retained tabs on warm frames but not on active-unsynced hop frames", () => {
    const retained = ["terminal", "overview"];
    const live = ["terminal", "src/a.ts"];
    expect(
      resolveWorkspaceFrameActiveTabIds({
        isActiveContext: false,
        isUrlSyncedActive: false,
        liveActiveTabIds: live,
        retainedActiveTabIds: retained,
      }),
    ).toEqual(retained);
    expect(
      resolveWorkspaceFrameActiveTabIds({
        isActiveContext: true,
        isUrlSyncedActive: false,
        liveActiveTabIds: live,
        retainedActiveTabIds: retained,
      }),
    ).toBeNull();
    expect(
      resolveWorkspaceFrameActiveTabIds({
        isActiveContext: true,
        isUrlSyncedActive: true,
        liveActiveTabIds: live,
        retainedActiveTabIds: retained,
      }),
    ).toEqual(live);

    const hopIds = resolveWorkspaceFrameActiveTabIds({
      isActiveContext: true,
      isUrlSyncedActive: false,
      retainedActiveTabIds: retained,
    });
    expect(
      isFramePanelVisible({
        isActiveFrame: true,
        frameActiveTab: "terminal",
        frameActiveTabIds: hopIds,
        panelTabId: "overview",
      }),
    ).toBe(false);
    expect(
      isFramePanelVisible({
        isActiveFrame: true,
        frameActiveTab: "terminal",
        frameActiveTabIds: hopIds,
        panelTabId: "terminal",
      }),
    ).toBe(true);

    const warmIds = resolveWorkspaceFrameActiveTabIds({
      isActiveContext: false,
      isUrlSyncedActive: false,
      retainedActiveTabIds: retained,
    });
    expect(
      isFramePanelVisible({
        isActiveFrame: false,
        frameActiveTab: "terminal",
        frameActiveTabIds: warmIds,
        panelTabId: "overview",
      }),
    ).toBe(true);
  });
});

describe("hydration-safe reconcile", () => {
  it("gates destructive reconcile until open-tab stores have hydrated", () => {
    expect(
      areOpenTabIdListSourcesHydrated({
        editorHydrated: false,
        githubHydrated: true,
        browserHydrated: true,
      }),
    ).toBe(false);
    expect(
      areOpenTabIdListSourcesHydrated({
        editorHydrated: true,
        githubHydrated: true,
        browserHydrated: true,
        layoutHydrated: false,
      }),
    ).toBe(false);
    expect(
      areOpenTabIdListSourcesHydrated({
        editorHydrated: true,
        githubHydrated: true,
        browserHydrated: true,
        layoutHydrated: true,
      }),
    ).toBe(true);

    const stage = readFileSync(join(import.meta.dir, "../CenterStage.tsx"), "utf8");
    expect(stage).toContain("React.useLayoutEffect(() => {\n    hydratePaneLayout();");
    expect(stage).toContain("if (!paneLayoutHydrated || isExtraCenterSpaceKey(mosaicContextId))");
    expect(stage).toContain("preserveDeepLink: true");

    const { layout, secondaryId } = splitWithSecondaryTab(
      ["terminal", "overview"],
      "terminal",
      "src/a.ts",
    );
    expect(getPane(layout, secondaryId)!.tabIds).toEqual(["src/a.ts"]);

    const tooEarly = reconcileOpenTabs(layout, ["terminal", "overview"], "terminal");
    expect(tooEarly.panes).toHaveLength(1);

    const afterHydration = reconcileOpenTabs(
      layout,
      ["terminal", "overview", "src/a.ts"],
      "src/a.ts",
    );
    expect(afterHydration.panes).toHaveLength(2);
    expect(getPane(afterHydration, secondaryId)!.tabIds).toEqual(["src/a.ts"]);

    const afterGenuineClose = reconcileOpenTabs(
      layout,
      ["terminal", "overview"],
      "terminal",
    );
    expect(afterGenuineClose.panes).toHaveLength(1);
  });
});

describe("independent pane order", () => {
  it("reordering pane A does not rewrite pane B", () => {
    const { layout, secondaryId } = splitWithSecondaryTab(["a", "b"], "b", "c");
    const reorderedA = reorderPaneTabIds(layout, DEFAULT_PANE_ID, ["b", "a"]);
    expect(getPane(reorderedA, DEFAULT_PANE_ID)!.tabIds).toEqual(["b", "a"]);
    expect(getPane(reorderedA, secondaryId)!.tabIds).toEqual(["c"]);

    const reorderedB = reorderPaneTabIds(reorderedA, secondaryId, ["c"]);
    expect(getPane(reorderedB, DEFAULT_PANE_ID)!.tabIds).toEqual(["b", "a"]);
    expect(getPane(reorderedB, secondaryId)!.tabIds).toEqual(["c"]);
  });

  it("keeps surviving pane order after the sibling is closed", () => {
    const { layout, secondaryId } = splitWithSecondaryTab(["a", "b"], "b", "c");
    const reordered = reorderPaneTabIds(layout, DEFAULT_PANE_ID, ["b", "a"]);
    expect(getPane(reordered, DEFAULT_PANE_ID)!.tabIds).toEqual(["b", "a"]);

    const pruned = removeTabFromLayout(reordered, "c");
    expect(pruned.panes.some((pane) => pane.id === secondaryId)).toBe(false);
    expect(pruned.panes).toHaveLength(1);
    expect(getPane(pruned, DEFAULT_PANE_ID)!.tabIds).toEqual(["b", "a"]);

    const legacyStrip = ["a", "b", "c"];
    expect(
      resolvePaneTabStripOrder(getPane(pruned, DEFAULT_PANE_ID)!.tabIds, legacyStrip),
    ).toEqual(["b", "a"]);

    const merged = closePane(reordered, secondaryId);
    expect(getPane(merged, DEFAULT_PANE_ID)!.tabIds.slice(0, 2)).toEqual(["b", "a"]);
    expect(
      resolvePaneTabStripOrder(getPane(merged, DEFAULT_PANE_ID)!.tabIds, legacyStrip),
    ).not.toEqual(legacyStrip);
  });

  it("seeds a new single-pane layout from legacy strip prefs", () => {
    expect(applyLegacyStripOrder(["b", "a", "c"], ["a", "b"])).toEqual(["a", "b", "c"]);
    expect(resolvePaneTabStripOrder([], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("scopes tab-group order keys per pane and falls back to unscoped migration", () => {
    expect(paneScopedTabGroupKey("pane-2", "file")).toBe("pane:pane-2:file");
    const stored = {
      "pane:pane-main:file": ["b", "a"],
      "pane:pane-2:file": ["c"],
      file: ["legacy"],
    };
    expect(readPaneTabGroupOrder(stored, "pane-main", "file")).toEqual(["b", "a"]);
    expect(readPaneTabGroupOrder(stored, "pane-2", "file")).toEqual(["c"]);
    expect(readPaneTabGroupOrder(stored, "pane-3", "file")).toEqual(["legacy"]);

    const group = {
      key: "file",
      label: "File",
      tabs: [
        { id: "a", label: "A", value: "a", kind: "file" as const },
        { id: "b", label: "B", value: "b", kind: "file" as const },
      ],
    };
    expect(
      applySavedTabGroupOrder(group, readPaneTabGroupOrder(stored, "pane-main", "file")).tabs.map(
        (tab) => tab.id,
      ),
    ).toEqual(["b", "a"]);
  });
});

describe("independent pane strip scroll roots", () => {
  it("wheels only the strip that owns the event target", () => {
    const targetA = { id: "a" };
    const targetB = { id: "b" };
    const paneA = {
      scrollLeft: 0,
      scrollWidth: 400,
      clientWidth: 120,
      contains(node: unknown) {
        return node === targetA;
      },
    };
    const paneB = {
      scrollLeft: 0,
      scrollWidth: 400,
      clientWidth: 120,
      contains(node: unknown) {
        return node === targetB;
      },
    };
    const event = {
      ctrlKey: false,
      deltaX: 0,
      deltaY: 40,
      preventDefault() {
        this.prevented = true;
      },
      prevented: false,
    };

    expect(
      applyHorizontalTabStripWheel(
        paneA as unknown as HTMLElement,
        event,
        targetA,
      ),
    ).toBe(true);
    expect(paneA.scrollLeft).toBe(40);
    expect(paneB.scrollLeft).toBe(0);

    event.prevented = false;
    expect(
      applyHorizontalTabStripWheel(
        paneB as unknown as HTMLElement,
        event,
        targetB,
      ),
    ).toBe(true);
    expect(paneA.scrollLeft).toBe(40);
    expect(paneB.scrollLeft).toBe(40);

    expect(
      applyHorizontalTabStripWheel(
        paneA as unknown as HTMLElement,
        event,
        targetB,
      ),
    ).toBe(false);
  });
});

describe("collectActiveTabIds for warm retention", () => {
  it("returns every pane-active tab with focus first", () => {
    const { layout, secondaryId } = splitWithSecondaryTab(["a", "b"], "b", "c");
    const ids = collectActiveTabIds(layout);
    expect(ids[0]).toBe("b");
    expect(ids).toContain("c");
    expect(findPaneIdForTab(layout, "c")).toBe(secondaryId);
  });
});

describe("context-keyed collapse strip persistence", () => {
  it("does not write destination order when switching split X to single Y", () => {
    expect(
      shouldPersistCollapsedStripOrder({
        prevContextId: "workspace-x",
        nextContextId: "workspace-y",
        prevPaneCount: 2,
        nextPaneCount: 1,
      }),
    ).toBe(false);
    expect(
      collapsedStripOrderForContext({
        collapsingContextId: "workspace-x",
        destinationContextId: "workspace-y",
        prevPaneCount: 2,
        nextPaneCount: 1,
        remainingTabIds: ["from-x-a", "from-x-b"],
      }),
    ).toBeNull();
    expect(
      shouldSeedMosaicFromFullPane({
        prevContextId: "workspace-y",
        nextContextId: "workspace-x",
        prevPaneCount: 1,
        nextPaneCount: 2,
      }),
    ).toBe(false);
    expect(shouldSnapPaneTilesOnContextChange("workspace-y", "workspace-x")).toBe(
      true,
    );
    expect(shouldSnapPaneTilesOnContextChange("workspace-x", "workspace-x")).toBe(
      false,
    );
  });

  it("persists remaining pane order only for a same-context N→1 collapse", () => {
    expect(
      collapsedStripOrderForContext({
        collapsingContextId: "workspace-x",
        destinationContextId: "workspace-x",
        prevPaneCount: 2,
        nextPaneCount: 1,
        remainingTabIds: ["b", "a"],
      }),
    ).toEqual({ contextId: "workspace-x", order: ["b", "a"] });
  });
});

describe("legacy single-pane strip migration", () => {
  it("honors stored strip prefs on an existing pre-canonical layout exactly once", () => {
    const oldLayout = createDefaultLayout(["b", "a", "c"], "a");
    expect(oldLayout.tabStripCanonical).toBeUndefined();

    const migrated = migrateLegacySinglePaneStripOrder(oldLayout, ["a", "b"]);
    expect(getPane(migrated, DEFAULT_PANE_ID)!.tabIds).toEqual(["a", "b", "c"]);
    expect(migrated.tabStripCanonical).toBe(true);

    const stalePrefs = migrateLegacySinglePaneStripOrder(migrated, ["c", "b", "a"]);
    expect(getPane(stalePrefs, DEFAULT_PANE_ID)!.tabIds).toEqual(["a", "b", "c"]);
    expect(
      resolvePaneTabStripOrder(
        getPane(stalePrefs, DEFAULT_PANE_ID)!.tabIds,
        ["c", "b", "a"],
      ),
    ).toEqual(["a", "b", "c"]);
  });

  it("does not snap back after a canonical pane reorder or collapse", () => {
    const migrated = migrateLegacySinglePaneStripOrder(
      createDefaultLayout(["b", "a", "c"], "a"),
      ["a", "b"],
    );
    const reordered = reorderPaneTabIds(migrated, DEFAULT_PANE_ID, ["c", "b", "a"]);
    expect(reordered.tabStripCanonical).toBe(true);
    expect(getPane(reordered, DEFAULT_PANE_ID)!.tabIds).toEqual(["c", "b", "a"]);
    expect(
      getPane(
        migrateLegacySinglePaneStripOrder(reordered, ["a", "b"]),
        DEFAULT_PANE_ID,
      )!.tabIds,
    ).toEqual(["c", "b", "a"]);
    expect(
      resolvePaneTabStripOrder(getPane(reordered, DEFAULT_PANE_ID)!.tabIds, ["a", "b"]),
    ).toEqual(["c", "b", "a"]);

    const { layout, secondaryId } = splitWithSecondaryTab(["a", "b"], "b", "c");
    const collapsed = removeTabFromLayout(
      reorderPaneTabIds(layout, DEFAULT_PANE_ID, ["b", "a"]),
      "c",
    );
    expect(collapsed.panes.some((pane) => pane.id === secondaryId)).toBe(false);
    expect(collapsed.tabStripCanonical).toBe(true);
    expect(getPane(collapsed, DEFAULT_PANE_ID)!.tabIds).toEqual(["b", "a"]);
    expect(
      getPane(
        migrateLegacySinglePaneStripOrder(collapsed, ["a", "b", "c"]),
        DEFAULT_PANE_ID,
      )!.tabIds,
    ).toEqual(["b", "a"]);
  });
});

describe("context-keyed strip ensure/migration/seed", () => {
  const orderA = ["files", "wiki"];
  const orderB = ["terminal", "wiki"];
  const openTabsB = ["wiki", "terminal", "files"];

  it("migrates a pre-canonical B layout with B prefs when hopping A→B", () => {
    const strip = resolveStripOrderForContext({
      contextId: "workspace-b",
      reactStripContextId: "workspace-a",
      reactStripOrder: orderA,
      storedStripOrder: orderB,
    });
    expect(strip).toEqual(orderB);
    expect(strip).not.toEqual(orderA);

    const layoutB = createDefaultLayout(["wiki", "terminal", "files"], "wiki");
    expect(layoutB.tabStripCanonical).toBeUndefined();

    const migrated = migrateLegacySinglePaneStripOrder(layoutB, strip);
    expect(getPane(migrated, DEFAULT_PANE_ID)!.tabIds).toEqual(
      applyLegacyStripOrder(openTabsB, orderB),
    );
    expect(migrated.tabStripCanonical).toBe(true);
    expect(getPane(migrated, DEFAULT_PANE_ID)!.tabIds).not.toEqual(
      applyLegacyStripOrder(openTabsB, orderA),
    );

    const later = migrateLegacySinglePaneStripOrder(migrated, orderA);
    expect(getPane(later, DEFAULT_PANE_ID)!.tabIds).toEqual(
      getPane(migrated, DEFAULT_PANE_ID)!.tabIds,
    );
    expect(
      resolvePaneTabStripOrder(getPane(later, DEFAULT_PANE_ID)!.tabIds, orderA),
    ).toEqual(getPane(migrated, DEFAULT_PANE_ID)!.tabIds);
  });

  it("does not seed a new B layout from A's React strip order", () => {
    const strip = resolveStripOrderForContext({
      contextId: "workspace-b",
      reactStripContextId: "workspace-a",
      reactStripOrder: orderA,
      storedStripOrder: orderB,
    });
    const seeded = applyLegacyStripOrder(openTabsB, strip);
    expect(seeded).toEqual(applyLegacyStripOrder(openTabsB, orderB));
    expect(seeded).not.toEqual(applyLegacyStripOrder(openTabsB, orderA));
    expect(getPane(createDefaultLayout(seeded, "wiki"), DEFAULT_PANE_ID)!.tabIds).toEqual(
      seeded,
    );
  });

  it("keeps tagged same-context React strip order without reading the other workspace", () => {
    expect(
      resolveStripOrderForContext({
        contextId: "workspace-a",
        reactStripContextId: "workspace-a",
        reactStripOrder: ["x", "y"],
        storedStripOrder: ["stale-b"],
      }),
    ).toEqual(["x", "y"]);
    expect(
      resolveStripOrderForContext({
        contextId: "workspace-b",
        reactStripContextId: null,
        reactStripOrder: orderA,
        storedStripOrder: orderB,
      }),
    ).toEqual(orderB);
  });
});

type FakeEl = {
  tagName: string;
  attrs: Record<string, string | undefined>;
  parent: FakeEl | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  closest(selector: string): FakeEl | null;
};

function fakeEl(
  tagName: string,
  attrs: Record<string, string | undefined> = {},
  parent: FakeEl | null = null,
): FakeEl {
  const node: FakeEl = {
    tagName,
    attrs,
    parent,
    getAttribute(name) {
      const value = this.attrs[name];
      return value === undefined ? null : value;
    },
    hasAttribute(name) {
      return this.attrs[name] !== undefined;
    },
    closest(selector) {
      if (selector === "[data-center-pane-owner]" && this.attrs["data-center-pane-owner"]) {
        return this;
      }
      if (selector === "[data-workspace-frame]" && this.attrs["data-workspace-frame"] !== undefined) {
        return this;
      }
      if (
        selector === "[data-atmos-browser-surface]" &&
        this.attrs["data-atmos-browser-surface"]
      ) {
        return this;
      }
      return this.parent?.closest(selector) ?? null;
    },
  };
  return node;
}

describe("browser host content-focus coverage", () => {
  it("focuses the owning pane from iframe/webview host elements", () => {
    const frame = fakeEl("DIV", {
      "data-workspace-frame": "",
      "data-tier": "active",
    });
    const owner = fakeEl("DIV", { "data-center-pane-owner": "pane-2" }, frame);
    const surface = fakeEl("DIV", { "data-atmos-browser-surface": "true" }, owner);
    const iframe = fakeEl("IFRAME", {}, surface);
    const webview = fakeEl("WEBVIEW", {}, surface);
    const urlField = fakeEl("INPUT", {}, surface);

    expect(isBrowserHostFocusTarget(iframe)).toBe(true);
    expect(isBrowserHostFocusTarget(webview)).toBe(true);
    expect(isBrowserHostFocusTarget(urlField)).toBe(true);
    expect(paneIdFromOverlayEventTarget(iframe as unknown as EventTarget)).toBe("pane-2");
    expect(paneIdFromOverlayEventTarget(webview as unknown as EventTarget)).toBe("pane-2");
    expect(paneIdFromOverlayEventTarget(urlField as unknown as EventTarget)).toBe(
      "pane-2",
    );
    expect(
      shouldFocusOwningPane({ paneId: "pane-2", focusedPaneId: "pane-main" }),
    ).toBe(true);
  });

  it("maps maximized portal host chrome that sits outside a workspace frame", () => {
    const portal = fakeEl("DIV", {
      "data-atmos-browser-surface": "true",
      "data-center-pane-owner": "pane-2",
    });
    const iframe = fakeEl("IFRAME", {}, portal);
    expect(paneIdFromOverlayEventTarget(iframe as unknown as EventTarget)).toBe("pane-2");
  });
});
