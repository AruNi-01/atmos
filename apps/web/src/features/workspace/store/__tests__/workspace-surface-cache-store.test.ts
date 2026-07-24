// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { beforeEach, describe, expect, it } from "bun:test";
import { useWorkspaceSurfaceCacheStore } from "../use-workspace-surface-cache-store";
import {
  FIXED_TERMINAL_TAB_VALUE,
  useTerminalStore,
} from "@/features/terminal/store/use-terminal-store";
import { getTerminalWorkspaceScopeKey } from "@/features/terminal/store/terminal-store-helpers";

const wscInitial = useWorkspaceSurfaceCacheStore.getInitialState();
const terminalInitial = useTerminalStore.getInitialState();

function seedTerminal(workspaceId: string) {
  const scope = getTerminalWorkspaceScopeKey(workspaceId, false);
  useTerminalStore.setState({
    workspaceTerminalTabs: {
      [workspaceId]: [{ id: FIXED_TERMINAL_TAB_VALUE, title: "Term", closable: true }],
    },
    workspaceActiveTerminalTabIds: { [workspaceId]: FIXED_TERMINAL_TAB_VALUE },
    workspacePanes: { [workspaceId]: {} },
    workspaceLayouts: { [workspaceId]: null },
    persistedTerminalLayouts: { [scope]: { schemaVersion: 1, tabs: [] } as never },
    hydratedTerminalScopes: new Set([workspaceId]),
    loadedWorkspaces: new Set([scope]),
  });
}

describe("useWorkspaceSurfaceCacheStore", () => {
  beforeEach(() => {
    useWorkspaceSurfaceCacheStore.setState(wscInitial, true);
    useTerminalStore.setState(terminalInitial, true);
  });

  it("active is not in warm; touch builds LRU", () => {
    const store = useWorkspaceSurfaceCacheStore.getState();
    store.setActiveContextId("a");
    store.setActiveContextId("b");
    store.touch("a");
    const s = useWorkspaceSurfaceCacheStore.getState();
    expect(s.activeContextId).toBe("b");
    expect(s.warm.map((w) => w.contextId)).toEqual(["a"]);
    expect(s.warm.find((w) => w.contextId === "b")).toBeUndefined();
  });

  it("enforces maxWarmWorkspaces", () => {
    useWorkspaceSurfaceCacheStore.setState({ maxWarmWorkspaces: 2 });
    const store = useWorkspaceSurfaceCacheStore.getState();
    store.setActiveContextId("z");
    store.touch("a");
    store.touch("b");
    store.touch("c");
    const warm = useWorkspaceSurfaceCacheStore.getState().warm;
    expect(warm.length).toBeLessThanOrEqual(2);
    expect(warm.map((w) => w.contextId)).toContain("c");
  });

  it("freeze keeps terminal tab identity (detach path)", async () => {
    seedTerminal("ws-freeze");
    const store = useWorkspaceSurfaceCacheStore.getState();
    store.setActiveContextId("other");
    store.touch("ws-freeze");
    store.freeze("ws-freeze", "lru_warm_cap");

    // detach is deferred
    await new Promise((r) => setTimeout(r, 10));

    const term = useTerminalStore.getState();
    expect(term.workspaceTerminalTabs["ws-freeze"]?.length).toBe(1);
    expect(term.persistedTerminalLayouts[getTerminalWorkspaceScopeKey("ws-freeze", false)]).toBeTruthy();
    expect(term.hydratedTerminalScopes.has("ws-freeze")).toBe(false);
    expect(
      useWorkspaceSurfaceCacheStore.getState().warm.find((w) => w.contextId === "ws-freeze"),
    ).toBeUndefined();
  });

  it("clearAll empties warm/active/mountPlan", async () => {
    seedTerminal("ws1");
    const store = useWorkspaceSurfaceCacheStore.getState();
    store.setActiveContextId("ws1");
    store.touch("ws2");
    store.setSurfaceSnapshot({
      contextId: "ws1",
      terminalTabIds: [FIXED_TERMINAL_TAB_VALUE],
      editorPathsRecent: [],
      browserTabValues: [],
      lightIds: [],
    });
    store.clearAll();
    const s = useWorkspaceSurfaceCacheStore.getState();
    expect(s.activeContextId).toBeNull();
    expect(s.warm).toEqual([]);
    expect(s.mountPlan.mounted).toEqual([]);
    expect(Object.keys(s.surfaceSnapshots)).toEqual([]);
  });

  it("settings cap change is reflected on next touch", () => {
    useWorkspaceSurfaceCacheStore.setState({ maxWarmWorkspaces: 1 });
    const store = useWorkspaceSurfaceCacheStore.getState();
    store.setActiveContextId("z");
    store.touch("a");
    store.touch("b");
    expect(useWorkspaceSurfaceCacheStore.getState().warm.length).toBe(1);
  });

  it("setMaxWarmWorkspaces immediately freezes excess warm contexts", async () => {
    useWorkspaceSurfaceCacheStore.setState({
      activeContextId: "z",
      maxWarmWorkspaces: 4,
      warm: [
        { contextId: "a", lastAccessed: 1 },
        { contextId: "b", lastAccessed: 2 },
        { contextId: "c", lastAccessed: 3 },
      ],
      protectOverride: {
        activeContextId: "z",
        dirtyContextIds: [],
        liveAgentContextIds: [],
      },
    });
    await useWorkspaceSurfaceCacheStore.getState().setMaxWarmWorkspaces(1);
    expect(useWorkspaceSurfaceCacheStore.getState().maxWarmWorkspaces).toBe(1);
    expect(useWorkspaceSurfaceCacheStore.getState().warm.length).toBe(1);
    expect(useWorkspaceSurfaceCacheStore.getState().warm[0]?.contextId).toBe("c");
  });

  it("getMountedContextIds returns active ∪ warm", () => {
    const store = useWorkspaceSurfaceCacheStore.getState();
    store.setActiveContextId("a");
    store.touch("b");
    const ids = useWorkspaceSurfaceCacheStore.getState().getMountedContextIds();
    expect(ids.sort()).toEqual(["a", "b"]);
  });

  it("runtime touch prefers freezing clean idle over dirty contexts (via protectOverride / live path)", () => {
    // Prefer protectOverride so this suite does not pull the full editor UI import graph.
    // Live dirty/agent reading is covered by pure buildProtectSignals + production resolveProtectSignals.
    useWorkspaceSurfaceCacheStore.setState({
      maxWarmWorkspaces: 2,
      protectOverride: {
        activeContextId: "z",
        dirtyContextIds: ["dirty"],
        liveAgentContextIds: [],
      },
    });
    const store = useWorkspaceSurfaceCacheStore.getState();
    store.setActiveContextId("z");
    useWorkspaceSurfaceCacheStore.setState({
      warm: [
        { contextId: "dirty", lastAccessed: 1 },
        { contextId: "clean", lastAccessed: 2 },
      ],
    });
    useWorkspaceSurfaceCacheStore.getState().touch("new");
    const warm = useWorkspaceSurfaceCacheStore.getState().warm.map((w) => w.contextId);
    expect(warm).toContain("dirty");
    expect(warm).toContain("new");
    expect(warm).not.toContain("clean");
  });

  it("sweepExpired freezes warm entries older than warmTtlMs", async () => {
    seedTerminal("ttl-old");
    useWorkspaceSurfaceCacheStore.setState({
      activeContextId: "active",
      warmTtlMs: 1_000,
      warm: [
        { contextId: "ttl-old", lastAccessed: Date.now() - 10_000 },
        { contextId: "ttl-fresh", lastAccessed: Date.now() },
      ],
      protectOverride: null,
    });
    useWorkspaceSurfaceCacheStore.getState().sweepExpired(Date.now());
    const warm = useWorkspaceSurfaceCacheStore.getState().warm.map((w) => w.contextId);
    expect(warm).toEqual(["ttl-fresh"]);
    expect(warm).not.toContain("ttl-old");

    await new Promise((r) => setTimeout(r, 15));
    // still-frozen old context should have been detached (hydration cleared)
    expect(useTerminalStore.getState().hydratedTerminalScopes.has("ttl-old")).toBe(false);
    // tab identity retained
    expect(useTerminalStore.getState().workspaceTerminalTabs["ttl-old"]?.length).toBe(1);
  });

  it("does not detach if frozen context is re-activated before deferred detach runs", async () => {
    seedTerminal("race-ws");
    useTerminalStore.setState({
      hydratedTerminalScopes: new Set(["race-ws"]),
      loadedWorkspaces: new Set([getTerminalWorkspaceScopeKey("race-ws", false)]),
    });
    const store = useWorkspaceSurfaceCacheStore.getState();
    store.setActiveContextId("other");
    store.freeze("race-ws", "manual");
    // Immediately re-activate — deferred detach must no-op
    store.setActiveContextId("race-ws");
    await new Promise((r) => setTimeout(r, 20));
    expect(useTerminalStore.getState().hydratedTerminalScopes.has("race-ws")).toBe(true);
  });

  it("still detaches frozen A when switching active to unrelated B", async () => {
    seedTerminal("freeze-a");
    useTerminalStore.setState({
      hydratedTerminalScopes: new Set(["freeze-a"]),
      loadedWorkspaces: new Set([getTerminalWorkspaceScopeKey("freeze-a", false)]),
    });
    const store = useWorkspaceSurfaceCacheStore.getState();
    store.setActiveContextId("other");
    store.freeze("freeze-a", "manual");
    // Switching to an unrelated active context must NOT cancel freeze-a's detach
    store.setActiveContextId("unrelated-b");
    await new Promise((r) => setTimeout(r, 20));

    const term = useTerminalStore.getState();
    expect(term.hydratedTerminalScopes.has("freeze-a")).toBe(false);
    expect(term.workspaceTerminalTabs["freeze-a"]?.length).toBe(1);
    expect(
      term.persistedTerminalLayouts[getTerminalWorkspaceScopeKey("freeze-a", false)],
    ).toBeTruthy();
  });
});

