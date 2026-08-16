// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import {
  applyWarmTouch,
  buildProtectSignals,
  computeMountPlan,
  editorMountKey,
  isFramePanelVisible,
  pruneStickyLeavingContexts,
  pushStickyLeavingContext,
  resolveContextIdsToRender,
  resolveFrameActiveTab,
  selectEditorMountSet,
  sweepWarmByTtl,
  browserKeepAlivePanelClass,
  lightSurfacePanelClass,
  terminalKeepAlivePanelClass,
  terminalMountKey,
  namedTerminalMountKey,
  isProtected,
  DEFAULT_SURFACE_BUDGETS,
} from "../workspace-surface-policies";

describe("resolveFrameActiveTab / panel visibility", () => {
  it("active frame prefers URL/editor tab", () => {
    expect(
      resolveFrameActiveTab({
        isActiveFrame: true,
        urlOrEditorTab: "file/a.ts",
        lastCenterTab: "terminal",
        fallbackTab: "overview",
      }),
    ).toBe("file/a.ts");
  });

  it("warm frame ignores global URL tab and uses lastCenterTab", () => {
    expect(
      resolveFrameActiveTab({
        isActiveFrame: false,
        urlOrEditorTab: "terminal",
        lastCenterTab: "file/x.ts",
        fallbackTab: "overview",
      }),
    ).toBe("file/x.ts");
  });

  it("active frame rejects stale URL not in validTabs and falls back to lastCenterTab", () => {
    expect(
      resolveFrameActiveTab({
        isActiveFrame: true,
        urlOrEditorTab: "github-pr:other-ws/1",
        lastCenterTab: "file/local.ts",
        fallbackTab: "terminal",
        validTabs: ["file/local.ts", "terminal", "overview"],
      }),
    ).toBe("file/local.ts");
  });

  it("panel visibility matches last tab even when frame is warm (outer shell gates paint)", () => {
    // Warm frames keep the last-tab panel layout-ready so unhiding the shell
    // reveals retained content without waiting for a React isActiveFrame flip.
    expect(
      isFramePanelVisible({
        isActiveFrame: false,
        frameActiveTab: "file/x.ts",
        panelTabId: "file/x.ts",
      }),
    ).toBe(true);
    expect(
      isFramePanelVisible({
        isActiveFrame: true,
        frameActiveTab: "terminal",
        frameActiveTabIds: ["terminal", "overview"],
        panelTabId: "overview",
      }),
    ).toBe(true);
    expect(
      isFramePanelVisible({
        isActiveFrame: true,
        frameActiveTab: "terminal",
        frameActiveTabIds: ["terminal", "overview"],
        panelTabId: "wiki",
      }),
    ).toBe(false);
    expect(
      isFramePanelVisible({
        isActiveFrame: true,
        frameActiveTab: "file/x.ts",
        panelTabId: "file/x.ts",
      }),
    ).toBe(true);
    expect(
      isFramePanelVisible({
        isActiveFrame: false,
        frameActiveTab: "file/x.ts",
        panelTabId: "terminal",
      }),
    ).toBe(false);
  });

  it("terminal keep-alive panels avoid display:none class names", () => {
    expect(terminalKeepAlivePanelClass(true)).toBe("atmos-terminal-panel-active");
    expect(terminalKeepAlivePanelClass(false)).toBe("atmos-terminal-panel-keepalive");
    expect(terminalKeepAlivePanelClass(false)).not.toContain("hidden");
    expect(lightSurfacePanelClass(true)).toContain("absolute");
    expect(lightSurfacePanelClass(true)).toContain("bg-background");
    expect(lightSurfacePanelClass(true)).not.toContain("hidden");
    expect(lightSurfacePanelClass(false)).toContain("hidden");
    expect(lightSurfacePanelClass(false)).toContain("bg-background");
    expect(browserKeepAlivePanelClass(true)).toContain("absolute");
    expect(browserKeepAlivePanelClass(true)).toContain("bg-background");
    expect(browserKeepAlivePanelClass(true).split(/\s+/)).not.toContain("hidden");
    expect(browserKeepAlivePanelClass(true)).not.toContain("opacity-0");
    expect(browserKeepAlivePanelClass(false).split(/\s+/)).not.toContain("hidden");
    expect(browserKeepAlivePanelClass(false)).toContain("opacity-0");
    expect(browserKeepAlivePanelClass(false)).toContain("pointer-events-none");
    expect(browserKeepAlivePanelClass(false)).toContain("bg-background");
  });
});

describe("applyWarmTouch LRU + protect", () => {
  it("caps warm length and freezes oldest unprotected", () => {
    const { warm, frozen } = applyWarmTouch({
      activeContextId: "active",
      warm: [
        { contextId: "a", lastAccessed: 1 },
        { contextId: "b", lastAccessed: 2 },
        { contextId: "c", lastAccessed: 3 },
      ],
      touchContextId: "d",
      now: 100,
      maxWarmWorkspaces: 3,
      protect: {
        activeContextId: "active",
        dirtyContextIds: [],
        liveAgentContextIds: [],
      },
    });
    expect(warm.length).toBe(3);
    expect(warm.map((w) => w.contextId)).toContain("d");
    expect(frozen.some((f) => f.contextId === "a")).toBe(true);
  });

  it("does not freeze dirty victim before clean", () => {
    const { warm, frozen } = applyWarmTouch({
      activeContextId: "active",
      warm: [
        { contextId: "dirty", lastAccessed: 1 },
        { contextId: "clean", lastAccessed: 2 },
      ],
      touchContextId: "new",
      now: 100,
      maxWarmWorkspaces: 2,
      protect: {
        activeContextId: "active",
        dirtyContextIds: ["dirty"],
        liveAgentContextIds: [],
      },
    });
    expect(frozen.map((f) => f.contextId)).toContain("clean");
    expect(warm.map((w) => w.contextId)).toContain("dirty");
    expect(warm.map((w) => w.contextId)).toContain("new");
  });

  it("never puts active into warm via touch", () => {
    const { warm, frozen } = applyWarmTouch({
      activeContextId: "a",
      warm: [],
      touchContextId: "a",
      now: 1,
      maxWarmWorkspaces: 4,
      protect: {
        activeContextId: "a",
        dirtyContextIds: [],
        liveAgentContextIds: [],
      },
    });
    expect(warm).toEqual([]);
    expect(frozen).toEqual([]);
  });
});

describe("isProtected", () => {
  it("protects active, dirty, live agent", () => {
    const signals = {
      activeContextId: "a",
      dirtyContextIds: ["b"],
      liveAgentContextIds: ["c"],
    };
    expect(isProtected("a", signals)).toBe(true);
    expect(isProtected("b", signals)).toBe(true);
    expect(isProtected("c", signals)).toBe(true);
    expect(isProtected("d", signals)).toBe(false);
  });
});

describe("buildProtectSignals", () => {
  it("marks dirty editors and panes with agent as protected contexts", () => {
    const signals = buildProtectSignals({
      activeContextId: "active",
      editorWorkspaceStates: {
        dirty: {
          openFiles: [
            { isDirty: false },
            { isDirty: true },
          ],
        },
        clean: {
          openFiles: [{ isDirty: false }],
        },
      },
      terminalPanesByScope: {
        agentWs: {
          p1: { agent: { id: "claude", label: "Claude" } },
        },
        "agentWs::extra": {
          p2: {},
        },
        idleWs: {
          p1: {},
        },
      },
    });
    expect(signals.activeContextId).toBe("active");
    expect(signals.dirtyContextIds).toContain("dirty");
    expect(signals.dirtyContextIds).not.toContain("clean");
    expect(
      signals.liveAgentContextIds instanceof Set
        ? [...signals.liveAgentContextIds]
        : signals.liveAgentContextIds,
    ).toContain("agentWs");
    expect(
      signals.liveAgentContextIds instanceof Set
        ? [...signals.liveAgentContextIds]
        : signals.liveAgentContextIds,
    ).not.toContain("idleWs");
  });
});

describe("warm TTL", () => {
  it("applyWarmTouch freezes expired unprotected warm entries via warmTtlMs", () => {
    const { warm, frozen } = applyWarmTouch({
      activeContextId: "active",
      warm: [
        { contextId: "old", lastAccessed: 0 },
        { contextId: "fresh", lastAccessed: 9000 },
      ],
      touchContextId: "new",
      now: 10_000,
      maxWarmWorkspaces: 10,
      warmTtlMs: 5_000,
      protect: {
        activeContextId: "active",
        dirtyContextIds: [],
        liveAgentContextIds: [],
      },
    });
    expect(frozen.some((f) => f.contextId === "old" && f.reason === "ttl")).toBe(true);
    expect(warm.map((w) => w.contextId).sort()).toEqual(["fresh", "new"]);
  });

  it("sweepWarmByTtl keeps protected expired entries", () => {
    const { kept, expired } = sweepWarmByTtl({
      warm: [
        { contextId: "dirty-old", lastAccessed: 0 },
        { contextId: "idle-old", lastAccessed: 0 },
        { contextId: "fresh", lastAccessed: 9000 },
      ],
      now: 10_000,
      warmTtlMs: 5_000,
      protect: {
        activeContextId: "active",
        dirtyContextIds: ["dirty-old"],
        liveAgentContextIds: [],
      },
    });
    expect(expired).toEqual(["idle-old"]);
    expect(kept.map((w) => w.contextId).sort()).toEqual(["dirty-old", "fresh"]);
  });
});

describe("resolveContextIdsToRender / sticky leave", () => {
  it("keeps the leaving context mounted before warm store catches up", () => {
    let sticky = pushStickyLeavingContext([], "ws-a", "ws-b");
    expect(sticky).toEqual(["ws-a"]);

    const duringGap = resolveContextIdsToRender({
      effectiveContextId: "ws-b",
      warmIds: [],
      stickyLeavingIds: sticky,
    });
    expect(duringGap).toEqual(expect.arrayContaining(["ws-a", "ws-b"]));
    expect(duringGap).toHaveLength(2);

    sticky = pruneStickyLeavingContexts(sticky, {
      effectiveContextId: "ws-b",
      warmIds: ["ws-a"],
    });
    expect(sticky).toEqual([]);

    const afterWarm = resolveContextIdsToRender({
      effectiveContextId: "ws-b",
      warmIds: ["ws-a"],
      stickyLeavingIds: sticky,
    });
    expect(afterWarm).toEqual(expect.arrayContaining(["ws-a", "ws-b"]));
  });
});

describe("selectEditorMountSet + computeMountPlan", () => {
  it("limits editors per workspace", () => {
    const paths = Array.from({ length: 20 }, (_, i) => `f${i}.ts`);
    const set = selectEditorMountSet({
      openPathsRecent: paths,
      activePath: "active.ts",
      maxMounted: 5,
    });
    expect(set.length).toBe(5);
    expect(set[0]).toBe("active.ts");
  });

  it("respects global browser and terminal caps", () => {
    const plan = computeMountPlan({
      activeContextId: "a",
      warm: [
        { contextId: "b", lastAccessed: 1 },
        { contextId: "c", lastAccessed: 2 },
      ],
      budgets: {
        ...DEFAULT_SURFACE_BUDGETS,
        maxGlobalBrowsers: 2,
        maxGlobalTerminalPanes: 3,
        maxGlobalMountedEditors: 10,
        maxMountedEditorsPerWorkspace: 5,
      },
      contexts: [
        {
          contextId: "a",
          terminalTabIds: ["terminal", "terminal-tab:2"],
          editorPathsRecent: ["a.ts"],
          browserTabValues: ["browser:a"],
          lightIds: ["overview"],
          frameActiveTab: "terminal",
        },
        {
          contextId: "b",
          terminalTabIds: ["terminal"],
          editorPathsRecent: [],
          browserTabValues: ["browser:b"],
          lightIds: [],
          frameActiveTab: "terminal",
        },
        {
          contextId: "c",
          terminalTabIds: ["terminal"],
          editorPathsRecent: [],
          browserTabValues: ["browser:c"],
          lightIds: ["wiki"],
          frameActiveTab: "wiki",
        },
      ],
    });

    const browsers = plan.mounted.filter((k) => k.startsWith("browser:"));
    const terminals = plan.mounted.filter((k) => k.startsWith("terminal:"));
    expect(browsers.length).toBeLessThanOrEqual(2);
    expect(terminals.length).toBeLessThanOrEqual(3);
    expect(plan.mounted).toContain(terminalMountKey("a", "terminal"));
    expect(plan.mounted).toContain(editorMountKey("a", "a.ts"));
  });

  it("does not mount all light panels when last tab is terminal", () => {
    const plan = computeMountPlan({
      activeContextId: "a",
      warm: [],
      budgets: DEFAULT_SURFACE_BUDGETS,
      contexts: [
        {
          contextId: "a",
          terminalTabIds: ["terminal"],
          editorPathsRecent: [],
          browserTabValues: [],
          lightIds: [], // narrow: only listed lights
          frameActiveTab: "terminal",
        },
      ],
    });
    expect(plan.mounted.some((k) => k.startsWith("light:"))).toBe(false);
  });

  it("prefers warm frameActiveTab terminals over active secondary tabs", () => {
    const plan = computeMountPlan({
      activeContextId: "a",
      warm: [{ contextId: "b", lastAccessed: 10 }],
      budgets: {
        ...DEFAULT_SURFACE_BUDGETS,
        maxGlobalTerminalPanes: 2,
      },
      contexts: [
        {
          contextId: "a",
          terminalTabIds: ["terminal", "terminal-tab:2", "terminal-tab:3"],
          editorPathsRecent: [],
          browserTabValues: [],
          lightIds: [],
          frameActiveTab: "terminal",
        },
        {
          contextId: "b",
          terminalTabIds: ["terminal"],
          editorPathsRecent: [],
          browserTabValues: [],
          lightIds: [],
          frameActiveTab: "terminal",
        },
      ],
    });

    const terminals = plan.mounted.filter((k) => k.startsWith("terminal:"));
    expect(terminals).toContain(terminalMountKey("a", "terminal"));
    expect(terminals).toContain(terminalMountKey("b", "terminal"));
    expect(terminals).not.toContain(terminalMountKey("a", "terminal-tab:2"));
    expect(terminals.length).toBe(2);
  });

  it("counts terminal split-pane units toward max_global_terminal_panes", () => {
    const plan = computeMountPlan({
      activeContextId: "a",
      warm: [{ contextId: "b", lastAccessed: 10 }],
      budgets: {
        ...DEFAULT_SURFACE_BUDGETS,
        maxGlobalTerminalPanes: 3,
      },
      contexts: [
        {
          contextId: "a",
          terminalTabIds: ["terminal"],
          terminalPaneCountByTabId: { terminal: 2 },
          editorPathsRecent: [],
          browserTabValues: [],
          lightIds: [],
          frameActiveTab: "terminal",
        },
        {
          contextId: "b",
          terminalTabIds: ["terminal", "terminal-tab:2"],
          terminalPaneCountByTabId: { terminal: 1, "terminal-tab:2": 2 },
          editorPathsRecent: [],
          browserTabValues: [],
          lightIds: [],
          frameActiveTab: "terminal",
        },
      ],
    });

    // a:terminal (2) + b:terminal (1) = 3; b secondary (2) does not fit
    expect(plan.mounted).toContain(terminalMountKey("a", "terminal"));
    expect(plan.mounted).toContain(terminalMountKey("b", "terminal"));
    expect(plan.mounted).not.toContain(terminalMountKey("b", "terminal-tab:2"));
  });

  it("always mounts active frameActiveTab even when pane weight exceeds the cap alone", () => {
    const plan = computeMountPlan({
      activeContextId: "a",
      warm: [],
      budgets: {
        ...DEFAULT_SURFACE_BUDGETS,
        maxGlobalTerminalPanes: 2,
      },
      contexts: [
        {
          contextId: "a",
          terminalTabIds: ["terminal", "terminal-tab:2"],
          terminalPaneCountByTabId: { terminal: 5, "terminal-tab:2": 1 },
          editorPathsRecent: [],
          browserTabValues: [],
          lightIds: [],
          frameActiveTab: "terminal",
        },
      ],
    });

    expect(plan.mounted).toContain(terminalMountKey("a", "terminal"));
    expect(plan.mounted).not.toContain(terminalMountKey("a", "terminal-tab:2"));
  });

  it("counts named terminals toward max_global_terminal_panes", () => {
    const plan = computeMountPlan({
      activeContextId: "a",
      warm: [{ contextId: "b", lastAccessed: 10 }],
      budgets: {
        ...DEFAULT_SURFACE_BUDGETS,
        maxGlobalTerminalPanes: 2,
      },
      contexts: [
        {
          contextId: "a",
          terminalTabIds: ["terminal"],
          terminalPaneCountByTabId: { terminal: 1 },
          editorPathsRecent: [],
          browserTabValues: [],
          lightIds: [],
          namedTerminals: ["project-wiki", "code-review"],
          frameActiveTab: "terminal",
        },
        {
          contextId: "b",
          terminalTabIds: ["terminal"],
          terminalPaneCountByTabId: { terminal: 1 },
          editorPathsRecent: [],
          browserTabValues: [],
          lightIds: [],
          frameActiveTab: "terminal",
        },
      ],
    });

    // a:terminal (1, forced) + b:terminal (1) fill the cap; named must not exceed it.
    expect(plan.mounted).toContain(terminalMountKey("a", "terminal"));
    expect(plan.mounted).toContain(terminalMountKey("b", "terminal"));
    expect(plan.mounted).not.toContain(namedTerminalMountKey("a", "project-wiki"));
    expect(plan.mounted).not.toContain(namedTerminalMountKey("a", "code-review"));
  });
});
