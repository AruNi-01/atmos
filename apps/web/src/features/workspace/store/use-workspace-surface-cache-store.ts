"use client";

import { create } from "zustand";
import {
  DEFAULT_SURFACE_BUDGETS,
  applyWarmTouch,
  buildProtectSignals,
  computeMountPlan,
  isProtected,
  sweepWarmByTtl,
  type BudgetRunReason,
  type ContextSurfaceSnapshot,
  type EvictReason,
  type MountPlan,
  type ProtectSignals,
  type SurfaceBudgets,
  type WarmEntry,
} from "@/app-shell/workspace-surface-policies";
export type {
  BudgetRunReason,
  EvictReason,
  MountPlan,
  SurfaceBudgets,
  WarmEntry,
} from "@/app-shell/workspace-surface-policies";

export { buildProtectSignals } from "@/app-shell/workspace-surface-policies";

interface WorkspaceSurfaceCacheState extends SurfaceBudgets {
  activeContextId: string | null;
  /**
   * Instant paint target for center-frame visibility.
   * May lead URL / activeContextId for already-mounted (warm) hops so the
   * user sees the prior surface before route commit + full promote.
   * Null means "follow activeContextId".
   */
  visualActiveContextId: string | null;
  warm: WarmEntry[];
  mountPlan: MountPlan;
  /** Optional protect override for tests only. Production uses live store signals. */
  protectOverride: ProtectSignals | null;
  surfaceSnapshots: Record<string, ContextSurfaceSnapshot>;
  /** Monotonic token to invalidate deferred freeze detach work. */
  freezeGeneration: number;

  setActiveContextId: (id: string | null) => void;
  /**
   * Cheap visibility flip only — no warm/budget work.
   * Safe on the navigation click path for already-mounted contexts.
   */
  beginVisualSwitch: (id: string | null) => void;
  touch: (id: string) => void;
  /**
   * Atomic Active leave→warm + set next active in one store update.
   * Prefer this over setActiveContextId+touch (half the React re-renders).
   */
  switchContext: (nextId: string | null) => void;
  freeze: (id: string, reason: EvictReason) => void;
  enforceMountBudgets: (reason?: BudgetRunReason) => void;
  setSurfaceSnapshot: (snapshot: ContextSurfaceSnapshot) => void;
  /** Batch publish many snapshots in one store notification (one mountPlan pass). */
  setSurfaceSnapshots: (snapshots: ContextSurfaceSnapshot[]) => void;
  setProtectOverride: (signals: ProtectSignals | null) => void;
  sweepExpired: (now?: number) => void;
  clearAll: () => void;
  loadSettings: () => Promise<void>;
  setMaxWarmWorkspaces: (n: number) => Promise<void>;
  setMaxGlobalTerminalPanes: (n: number) => Promise<void>;
  setMaxMountedEditorsPerWorkspace: (n: number) => Promise<void>;
  setMaxGlobalMountedEditors: (n: number) => Promise<void>;
  setMaxGlobalBrowsers: (n: number) => Promise<void>;
  getMountedContextIds: () => string[];
  /** Resolve which context the center stage should paint as active. */
  getVisualActiveContextId: () => string | null;
}

function budgetsFromState(state: WorkspaceSurfaceCacheState): SurfaceBudgets {
  return {
    maxWarmWorkspaces: state.maxWarmWorkspaces,
    maxGlobalTerminalPanes: state.maxGlobalTerminalPanes,
    maxGlobalMountedEditors: state.maxGlobalMountedEditors,
    maxMountedEditorsPerWorkspace: state.maxMountedEditorsPerWorkspace,
    maxGlobalBrowsers: state.maxGlobalBrowsers,
    warmTtlMs: state.warmTtlMs,
  };
}

function recomputeMountPlan(state: WorkspaceSurfaceCacheState): MountPlan {
  return computeMountPlan({
    activeContextId: state.activeContextId,
    warm: state.warm,
    contexts: Object.values(state.surfaceSnapshots),
    budgets: budgetsFromState(state),
  });
}

/** Keep previous mountPlan reference when the key list is unchanged (cuts React churn). */
function sameMountPlan(a: MountPlan, b: MountPlan): boolean {
  if (a === b) return true;
  if (a.mounted.length !== b.mounted.length) return false;
  for (let i = 0; i < a.mounted.length; i++) {
    if (a.mounted[i] !== b.mounted[i]) return false;
  }
  return true;
}

function surfaceSnapshotEqual(
  prev: ContextSurfaceSnapshot,
  next: ContextSurfaceSnapshot,
): boolean {
  return (
    prev.frameActiveTab === next.frameActiveTab &&
    prev.terminalTabIds.join("\0") === next.terminalTabIds.join("\0") &&
    Object.entries(prev.terminalPaneCountByTabId ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join("\0") ===
      Object.entries(next.terminalPaneCountByTabId ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join("\0") &&
    prev.editorPathsRecent.join("\0") === next.editorPathsRecent.join("\0") &&
    prev.browserTabValues.join("\0") === next.browserTabValues.join("\0") &&
    prev.lightIds.join("\0") === next.lightIds.join("\0") &&
    (prev.namedTerminals ?? []).join("\0") === (next.namedTerminals ?? []).join("\0")
  );
}

function withMountPlan(
  state: WorkspaceSurfaceCacheState,
  nextPartial: Partial<WorkspaceSurfaceCacheState>,
): Partial<WorkspaceSurfaceCacheState> | WorkspaceSurfaceCacheState {
  const merged = { ...state, ...nextPartial };
  const mountPlan = recomputeMountPlan(merged as WorkspaceSurfaceCacheState);
  if (sameMountPlan(state.mountPlan, mountPlan)) {
    return { ...nextPartial, mountPlan: state.mountPlan };
  }
  return { ...nextPartial, mountPlan };
}

/**
 * Runtime protect: dirty editors + panes with agent metadata.
 * Tests may inject protectOverride instead.
 */
export function resolveProtectSignals(
  activeContextId: string | null,
  protectOverride: ProtectSignals | null,
): ProtectSignals {
  if (protectOverride) {
    return {
      ...protectOverride,
      activeContextId: protectOverride.activeContextId ?? activeContextId,
    };
  }
  return buildProtectSignalsFromLiveStores(activeContextId);
}

export function buildProtectSignalsFromLiveStores(
  activeContextId: string | null,
): ProtectSignals {
  // Lazy require keeps unit tests of the WSC shell free of the full editor/UI import graph.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEditorStore } = require("@/features/editor/store/use-editor-store") as typeof import("@/features/editor/store/use-editor-store");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useTerminalStore } = require("@/features/terminal/store/use-terminal-store") as typeof import("@/features/terminal/store/use-terminal-store");
    return buildProtectSignals({
      activeContextId,
      editorWorkspaceStates: useEditorStore.getState().workspaceStates ?? {},
      terminalPanesByScope: useTerminalStore.getState().workspacePanes ?? {},
    });
  } catch {
    return {
      activeContextId,
      dirtyContextIds: [],
      liveAgentContextIds: [],
    };
  }
}

/**
 * Schedule identity-preserving detach only if context is still frozen when the
 * callback runs (not Active, not Warm). Cancels harmlessly if re-activated.
 */
function runFreezeSideEffects(
  contextId: string,
  generationAtSchedule: number,
  getState: () => WorkspaceSurfaceCacheState,
) {
  setTimeout(() => {
    const s = getState();
    // Stale work after clearAll / bulk freeze invalidation.
    if (s.freezeGeneration !== generationAtSchedule) return;
    // Re-activated or warm again — keep frontend attach/hydration.
    if (s.activeContextId === contextId) return;
    if (s.warm.some((w) => w.contextId === contextId)) return;

    void import("@/features/terminal/store/use-terminal-store").then(({ useTerminalStore }) => {
      const latest = getState();
      if (latest.freezeGeneration !== generationAtSchedule) return;
      if (latest.activeContextId === contextId) return;
      if (latest.warm.some((w) => w.contextId === contextId)) return;
      useTerminalStore.getState().detachWorkspaceFrontend(contextId);
    });
  }, 0);
}

function runFullWipeAllKnown(contextIds: string[]) {
  setTimeout(() => {
    void import("@/features/terminal/store/use-terminal-store").then(({ useTerminalStore }) => {
      const store = useTerminalStore.getState();
      for (const id of contextIds) {
        store.evictWorkspaceRuntime(id);
      }
    });
  }, 0);
}

/** Freeze oldest unprotected warm contexts until warm.length ≤ maxWarmWorkspaces. */
function trimWarmToBudget(
  get: () => WorkspaceSurfaceCacheState,
  set: (
    partial:
      | Partial<WorkspaceSurfaceCacheState>
      | ((s: WorkspaceSurfaceCacheState) => Partial<WorkspaceSurfaceCacheState> | WorkspaceSurfaceCacheState),
  ) => void,
) {
  const state = get();
  if (state.warm.length <= state.maxWarmWorkspaces) {
    get().enforceMountBudgets("settings");
    return;
  }
  const protect = resolveProtectSignals(state.activeContextId, state.protectOverride);
  // Reuse touch eviction by synthesizing a no-op touch of a dummy that never enters warm:
  // applyWarmTouch only freezes when adding — so demote inline.
  let warm = [...state.warm];
  const frozen: string[] = [];
  while (warm.length > state.maxWarmWorkspaces) {
    let victimIndex = -1;
    for (let i = 0; i < warm.length; i++) {
      if (!isProtected(warm[i].contextId, protect)) {
        victimIndex = i;
        break;
      }
    }
    if (victimIndex === -1) victimIndex = 0;
    frozen.push(warm[victimIndex].contextId);
    warm = warm.filter((_, i) => i !== victimIndex);
  }
  const generation = state.freezeGeneration;
  set((s) => {
    const next = { ...s, warm };
    return { ...next, mountPlan: recomputeMountPlan(next) };
  });
  for (const id of frozen) {
    runFreezeSideEffects(id, generation, get);
  }
}

export const useWorkspaceSurfaceCacheStore = create<WorkspaceSurfaceCacheState>((set, get) => ({
  activeContextId: null,
  visualActiveContextId: null,
  warm: [],
  mountPlan: { mounted: [] },
  protectOverride: null,
  surfaceSnapshots: {},
  freezeGeneration: 0,
  ...DEFAULT_SURFACE_BUDGETS,

  setActiveContextId: (id) => {
    set((state) => {
      if (state.activeContextId === id && state.visualActiveContextId === id) return state;
      // Do NOT bump freezeGeneration here — that would cancel deferred detach
      // for unrelated Frozen contexts. Re-activation of the same id is safe
      // because runFreezeSideEffects re-checks active/warm membership.
      const warm = state.warm.filter((w) => w.contextId !== id);
      return withMountPlan(state, {
        activeContextId: id,
        visualActiveContextId: id,
        warm,
      });
    });
  },

  beginVisualSwitch: (id) => {
    set((state) => {
      if (state.visualActiveContextId === id) return state;
      return { visualActiveContextId: id };
    });
  },

  touch: (id) => {
    const state = get();
    const protect = resolveProtectSignals(state.activeContextId, state.protectOverride);
    const { warm, frozen } = applyWarmTouch({
      activeContextId: state.activeContextId,
      warm: state.warm,
      touchContextId: id,
      now: Date.now(),
      maxWarmWorkspaces: state.maxWarmWorkspaces,
      protect,
      warmTtlMs: state.warmTtlMs,
    });

    const generation = state.freezeGeneration;
    set((s) => withMountPlan(s, { warm }));

    for (const f of frozen) {
      // Ensure removed from warm (applyWarmTouch already did) then detach if still frozen.
      set((s) => {
        const warm2 = s.warm.filter((w) => w.contextId !== f.contextId);
        return withMountPlan(s, { warm: warm2 });
      });
      runFreezeSideEffects(f.contextId, generation, get);
    }
  },

  switchContext: (nextId) => {
    const state = get();
    const prev = state.activeContextId;
    if (prev === nextId) return;

    const now = Date.now();
    // Next leaves warm (becomes Active). Prev will be touched into warm.
    const warmWithoutNext = state.warm.filter((w) => w.contextId !== nextId);

    let warm = warmWithoutNext;
    let frozen: Array<{ contextId: string; reason: EvictReason }> = [];

    if (prev) {
      // Projected size if we only append prev (no eviction).
      const alreadyWarm = warmWithoutNext.some((w) => w.contextId === prev);
      const projectedLen = alreadyWarm
        ? warmWithoutNext.length
        : warmWithoutNext.length + 1;
      // Skip full editor/terminal protect scan when under budget (common fast path).
      const protect =
        projectedLen > state.maxWarmWorkspaces
          ? resolveProtectSignals(nextId, state.protectOverride)
          : {
              activeContextId: nextId,
              dirtyContextIds: [] as string[],
              liveAgentContextIds: [] as string[],
            };

      const result = applyWarmTouch({
        activeContextId: nextId,
        warm: warmWithoutNext,
        touchContextId: prev,
        now,
        maxWarmWorkspaces: state.maxWarmWorkspaces,
        protect,
        // TTL sweep on every keystroke-switch is wasteful; periodic sweeper handles it.
        warmTtlMs: undefined,
      });
      warm = result.warm;
      frozen = result.frozen;
    }

    const generation = state.freezeGeneration;
    // Single store notification: active + visual + warm. Mount plan deferred off the switch frame.
    set({
      activeContextId: nextId,
      visualActiveContextId: nextId,
      warm,
    });

    for (const f of frozen) {
      runFreezeSideEffects(f.contextId, generation, get);
    }

    // Idle — never microtask: switch already costs a React commit; mount plan
    // recompute must not queue another commit before the next sidebar input.
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(
        () => {
          get().enforceMountBudgets("switch");
        },
        { timeout: 200 },
      );
    } else {
      setTimeout(() => get().enforceMountBudgets("switch"), 32);
    }
  },

  freeze: (id, _reason) => {
    const generation = get().freezeGeneration;
    set((s) => {
      if (s.activeContextId === id) return s;
      const warm = s.warm.filter((w) => w.contextId !== id);
      return withMountPlan(s, { warm });
    });
    runFreezeSideEffects(id, generation, get);
  },

  enforceMountBudgets: (_reason) => {
    set((s) => {
      const mountPlan = recomputeMountPlan(s);
      if (sameMountPlan(s.mountPlan, mountPlan)) return s;
      return { mountPlan };
    });
  },

  setSurfaceSnapshot: (snapshot) => {
    set((s) => {
      const prev = s.surfaceSnapshots[snapshot.contextId];
      // Avoid infinite CenterStagePanels effect loops (React #185).
      if (prev && surfaceSnapshotEqual(prev, snapshot)) {
        return s;
      }
      const surfaceSnapshots = {
        ...s.surfaceSnapshots,
        [snapshot.contextId]: snapshot,
      };
      return withMountPlan(s, { surfaceSnapshots });
    });
  },

  /**
   * Batch many context snapshots into one store notify + one mountPlan recompute.
   * Prefer this after a multi-frame host idle pass (IMP-012).
   */
  setSurfaceSnapshots: (snapshots) => {
    if (snapshots.length === 0) return;
    set((s) => {
      let changed = false;
      const surfaceSnapshots = { ...s.surfaceSnapshots };
      for (const snapshot of snapshots) {
        const prev = surfaceSnapshots[snapshot.contextId];
        if (prev && surfaceSnapshotEqual(prev, snapshot)) continue;
        surfaceSnapshots[snapshot.contextId] = snapshot;
        changed = true;
      }
      if (!changed) return s;
      return withMountPlan(s, { surfaceSnapshots });
    });
  },

  setProtectOverride: (signals) => set({ protectOverride: signals }),

  sweepExpired: (now = Date.now()) => {
    const state = get();
    const protect = resolveProtectSignals(state.activeContextId, state.protectOverride);
    const { kept, expired } = sweepWarmByTtl({
      warm: state.warm,
      now,
      warmTtlMs: state.warmTtlMs,
      protect,
    });
    if (expired.length === 0) return;
    const generation = state.freezeGeneration;
    set((s) => {
      const next = { ...s, warm: kept };
      return { ...next, mountPlan: recomputeMountPlan(next) };
    });
    for (const id of expired) {
      runFreezeSideEffects(id, generation, get);
    }
  },

  clearAll: () => {
    const state = get();
    const ids = new Set<string>();
    if (state.activeContextId) ids.add(state.activeContextId);
    for (const w of state.warm) ids.add(w.contextId);
    for (const id of Object.keys(state.surfaceSnapshots)) ids.add(id);
    set({
      activeContextId: null,
      visualActiveContextId: null,
      warm: [],
      mountPlan: { mounted: [] },
      surfaceSnapshots: {},
      protectOverride: null,
      freezeGeneration: state.freezeGeneration + 1,
    });
    runFullWipeAllKnown([...ids]);
  },

  loadSettings: async () => {
    try {
      const { useFunctionSettingsStore } = await import(
        "@/features/settings/store/function-settings-store"
      );
      const settings = await useFunctionSettingsStore.getState().load();
      const ws = (settings as Record<string, unknown>).workspace_surface as
        | Record<string, unknown>
        | undefined;
      if (!ws) return;
      set((state) => ({
        maxWarmWorkspaces:
          typeof ws.max_warm_workspaces === "number"
            ? ws.max_warm_workspaces
            : state.maxWarmWorkspaces,
        maxGlobalTerminalPanes:
          typeof ws.max_global_terminal_panes === "number"
            ? ws.max_global_terminal_panes
            : state.maxGlobalTerminalPanes,
        maxMountedEditorsPerWorkspace:
          typeof ws.max_mounted_editors_per_workspace === "number"
            ? ws.max_mounted_editors_per_workspace
            : state.maxMountedEditorsPerWorkspace,
        maxGlobalMountedEditors:
          typeof ws.max_global_mounted_editors === "number"
            ? ws.max_global_mounted_editors
            : state.maxGlobalMountedEditors,
        maxGlobalBrowsers:
          typeof ws.max_global_browsers === "number"
            ? ws.max_global_browsers
            : state.maxGlobalBrowsers,
        warmTtlMs:
          typeof ws.warm_ttl_ms === "number" ? ws.warm_ttl_ms : state.warmTtlMs,
      }));
      // Apply loaded budgets immediately (defaults may already have published snapshots).
      trimWarmToBudget(get, set);
      get().enforceMountBudgets("settings");
    } catch {
      // ignore
    }
  },

  setMaxWarmWorkspaces: async (n) => {
    const maxWarmWorkspaces = Math.min(50, Math.max(1, n));
    set({ maxWarmWorkspaces });
    // Immediately freeze excess warm contexts (do not wait for next touch).
    trimWarmToBudget(get, set);
    get().enforceMountBudgets("settings");
    try {
      const { functionSettingsApi } = await import("@/api/ws-api");
      await functionSettingsApi.update(
        "workspace_surface",
        "max_warm_workspaces",
        maxWarmWorkspaces,
      );
    } catch {
      // Settings transport may be unavailable in unit tests / offline.
    }
  },

  setMaxGlobalTerminalPanes: async (n) => {
    const maxGlobalTerminalPanes = Math.min(100, Math.max(1, n));
    set({ maxGlobalTerminalPanes });
    get().enforceMountBudgets("settings");
    try {
      const { functionSettingsApi } = await import("@/api/ws-api");
      await functionSettingsApi.update(
        "workspace_surface",
        "max_global_terminal_panes",
        maxGlobalTerminalPanes,
      );
    } catch {
      // ignore offline / test environments
    }
  },

  setMaxMountedEditorsPerWorkspace: async (n) => {
    const maxMountedEditorsPerWorkspace = Math.min(50, Math.max(1, n));
    set({ maxMountedEditorsPerWorkspace });
    get().enforceMountBudgets("settings");
    try {
      const { functionSettingsApi } = await import("@/api/ws-api");
      await functionSettingsApi.update(
        "workspace_surface",
        "max_mounted_editors_per_workspace",
        maxMountedEditorsPerWorkspace,
      );
    } catch {
      // ignore
    }
  },

  setMaxGlobalMountedEditors: async (n) => {
    const maxGlobalMountedEditors = Math.min(100, Math.max(1, n));
    set({ maxGlobalMountedEditors });
    get().enforceMountBudgets("settings");
    try {
      const { functionSettingsApi } = await import("@/api/ws-api");
      await functionSettingsApi.update(
        "workspace_surface",
        "max_global_mounted_editors",
        maxGlobalMountedEditors,
      );
    } catch {
      // ignore
    }
  },

  setMaxGlobalBrowsers: async (n) => {
    const maxGlobalBrowsers = Math.min(20, Math.max(1, n));
    set({ maxGlobalBrowsers });
    get().enforceMountBudgets("settings");
    try {
      const { functionSettingsApi } = await import("@/api/ws-api");
      await functionSettingsApi.update(
        "workspace_surface",
        "max_global_browsers",
        maxGlobalBrowsers,
      );
    } catch {
      // ignore
    }
  },

  getMountedContextIds: () => {
    const s = get();
    const ids = new Set<string>();
    if (s.activeContextId) ids.add(s.activeContextId);
    for (const w of s.warm) ids.add(w.contextId);
    return [...ids];
  },

  getVisualActiveContextId: () => {
    const s = get();
    return s.visualActiveContextId ?? s.activeContextId;
  },
}));

// Re-export for tests that previously used isProtectedSafe patterns
export { isProtected };

if (typeof window !== "undefined") {
  void useWorkspaceSurfaceCacheStore.getState().loadSettings();
}
