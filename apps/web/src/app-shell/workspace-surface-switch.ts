/**
 * APP-043 workspace switch critical path.
 *
 * PERFORMANCE RULES:
 * 1. Never run full WSC promote (switchContext / warm / budgets) inside click
 *    handlers before router.push — that forces multi-frame re-render on the
 *    nav path and freezes sidebar feedback (IMP-003).
 * 2. For already-mounted (Active ∪ Warm) targets, schedule a visual lead on the
 *    nav path so center paint flips before the URL commits (IMP-008).
 *    That write only touches visualActiveContextId — no mountPlan / warm work.
 * 3. Full promote still runs after the route commits (CenterStage effect).
 * 4. Rapid hops coalesce visual + promote to the latest target (IMP-009) so
 *    intermediate multi-frame commits do not stack on the main thread.
 */

import { useWorkspaceSurfaceCacheStore } from "@/features/workspace/store/use-workspace-surface-cache-store";
import { readCenterStageLastTab } from "@/shared/stores/use-ui-pref-hooks";

/** After this quiet gap, the next visual flip is applied immediately (slow hop). */
export const VISUAL_SWITCH_QUIET_MS = 140;
/** While hopping faster than the quiet gap, only the latest target paints. */
export const VISUAL_SWITCH_COALESCE_MS = 32;
/** URL promote coalesce window for intermediate route commits. */
export const PROMOTE_COALESCE_MS = 48;

type TimerHandle = ReturnType<typeof setTimeout>;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// --- Visual lead scheduler (nav path) ---------------------------------------

let lastVisualFlushAt = -Infinity;
let pendingVisualId: string | null | undefined = undefined;
let visualTimer: TimerHandle | null = null;

function flushPendingVisualSwitch(): void {
  if (pendingVisualId === undefined) return;
  const id = pendingVisualId;
  pendingVisualId = undefined;
  lastVisualFlushAt = nowMs();
  useWorkspaceSurfaceCacheStore.getState().beginVisualSwitch(id);
}

/**
 * Apply or coalesce a center-frame visibility flip.
 * - Slow hop (quiet ≥ VISUAL_SWITCH_QUIET_MS): flush immediately.
 * - Rapid hop: trailing-edge coalesce so only the final target commits.
 */
export function scheduleVisualActiveSwitch(id: string | null): void {
  pendingVisualId = id;
  const quiet = nowMs() - lastVisualFlushAt >= VISUAL_SWITCH_QUIET_MS;

  if (quiet) {
    if (visualTimer != null) {
      clearTimeout(visualTimer);
      visualTimer = null;
    }
    flushPendingVisualSwitch();
    return;
  }

  if (visualTimer != null) {
    clearTimeout(visualTimer);
  }
  visualTimer = setTimeout(() => {
    visualTimer = null;
    flushPendingVisualSwitch();
  }, VISUAL_SWITCH_COALESCE_MS);
}

/** Cancel a pending coalesced visual flip (cold nav / tests). */
export function cancelScheduledVisualActiveSwitch(): void {
  if (visualTimer != null) {
    clearTimeout(visualTimer);
    visualTimer = null;
  }
  pendingVisualId = undefined;
}

// --- Promote scheduler (URL commit path) ------------------------------------

let lastPromoteFlushAt = -Infinity;
let pendingPromoteId: string | null | undefined = undefined;
let pendingPromoteLeaves: string[] = [];
let promoteTimer: TimerHandle | null = null;

function flushPendingPromote(): void {
  if (pendingPromoteId === undefined) return;
  const nextId = pendingPromoteId;
  const leaves = pendingPromoteLeaves;
  pendingPromoteId = undefined;
  pendingPromoteLeaves = [];
  lastPromoteFlushAt = nowMs();

  const store = useWorkspaceSurfaceCacheStore.getState();
  // Intermediate hops that never got their own promote still need warm membership
  // so their frames are not torn down when sticky expires (A→B→C rapid).
  // Prefer a single store write over N× touch()+switchContext (avoids protect scans
  // and stacked subscriber notifications during rapid hops).
  const now = Date.now();
  const warmIds = new Set(store.warm.map((w) => w.contextId));
  const nextWarm = [...store.warm];
  for (const leave of leaves) {
    if (!leave || leave === nextId) continue;
    if (leave === store.activeContextId) continue;
    if (warmIds.has(leave)) continue;
    warmIds.add(leave);
    nextWarm.push({ contextId: leave, lastAccessed: now });
  }

  if (store.activeContextId === nextId) {
    if (store.visualActiveContextId !== nextId || nextWarm.length !== store.warm.length) {
      useWorkspaceSurfaceCacheStore.setState({
        visualActiveContextId: nextId,
        warm: nextWarm,
      });
    }
    return;
  }

  // Leave current active into warm, then activate next (mirrors switchContext).
  const prev = store.activeContextId;
  let warm = nextWarm.filter((w) => w.contextId !== nextId);
  if (prev && prev !== nextId && !warm.some((w) => w.contextId === prev)) {
    warm = [...warm, { contextId: prev, lastAccessed: now }];
  }
  // Cap by maxWarmWorkspaces (drop oldest unprotected-first is overkill here;
  // enforceMountBudgets / next quiet promote will rebalance).
  const maxWarm = store.maxWarmWorkspaces;
  if (warm.length > maxWarm) {
    warm = warm
      .slice()
      .sort((a, b) => b.lastAccessed - a.lastAccessed)
      .slice(0, maxWarm);
  }
  useWorkspaceSurfaceCacheStore.setState({
    activeContextId: nextId,
    visualActiveContextId: nextId,
    warm,
  });
  if (typeof queueMicrotask === "function") {
    queueMicrotask(() => {
      useWorkspaceSurfaceCacheStore.getState().enforceMountBudgets("switch");
    });
  } else {
    setTimeout(() => {
      useWorkspaceSurfaceCacheStore.getState().enforceMountBudgets("switch");
    }, 0);
  }
}

/**
 * Coalesce URL-driven promotes during rapid route commits.
 * Sticky leave bookkeeping still runs per hop in the caller; this only batches
 * `switchContext` / intermediate `touch` work.
 */
export function schedulePromoteWorkspaceSurfaceSwitch(
  nextContextId: string | null,
  leavingContextId?: string | null,
): () => void {
  if (leavingContextId && leavingContextId !== nextContextId) {
    if (!pendingPromoteLeaves.includes(leavingContextId)) {
      pendingPromoteLeaves.push(leavingContextId);
    }
  }
  pendingPromoteId = nextContextId;

  const quiet = nowMs() - lastPromoteFlushAt >= VISUAL_SWITCH_QUIET_MS;

  if (quiet) {
    if (promoteTimer != null) {
      clearTimeout(promoteTimer);
      promoteTimer = null;
    }
    flushPendingPromote();
    return () => {};
  }

  if (promoteTimer != null) {
    clearTimeout(promoteTimer);
  }
  promoteTimer = setTimeout(() => {
    promoteTimer = null;
    flushPendingPromote();
  }, PROMOTE_COALESCE_MS);

  // Keep the timer across effect cleanups so a rapid successor can replace it
  // via clearTimeout + reschedule; pending leaves/id are module-scoped.
  return () => {};
}

/** Test helper: reset coalescing clocks and pending work. */
export function resetWorkspaceSwitchSchedulersForTests(): void {
  cancelScheduledVisualActiveSwitch();
  if (promoteTimer != null) {
    clearTimeout(promoteTimer);
    promoteTimer = null;
  }
  pendingPromoteId = undefined;
  pendingPromoteLeaves = [];
  lastVisualFlushAt = -Infinity;
  lastPromoteFlushAt = -Infinity;
}

export type ParsedContextHref = {
  contextId: string | null;
  view: "workspace" | "project" | null;
  /** Raw `tab` query value when present (including empty string). */
  tabParam: string | null;
  hasTabParam: boolean;
  pathname: string;
  searchParams: URLSearchParams;
  hash: string;
};

/** Parse `/workspace?id=` / `/project?id=` targets used by the app shell. */
export function parseWorkspaceContextHref(path: string): ParsedContextHref {
  const url = new URL(path, "http://atmos.local");
  const segment = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean)[0] ?? "";
  const view = segment === "workspace" || segment === "project" ? segment : null;
  const contextId = view ? url.searchParams.get("id") : null;
  const hasTabParam = url.searchParams.has("tab");
  const tabParam = hasTabParam ? url.searchParams.get("tab") : null;
  return {
    contextId,
    view,
    tabParam,
    hasTabParam,
    pathname: url.pathname,
    searchParams: url.searchParams,
    hash: url.hash,
  };
}

/**
 * When the href has no explicit `tab`, inject the remembered last center tab so
 * the first paint already matches chrome (avoids a second restore navigation).
 * Pure string rewrite — no store writes.
 */
export function injectLastCenterTabIfMissing(
  path: string,
  lastTab: string | null | undefined,
): string {
  if (!lastTab) return path;
  try {
    const url = new URL(path, "http://atmos.local");
    if (url.searchParams.has("tab")) return path;
    url.searchParams.set("tab", lastTab);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return path;
  }
}

/**
 * Atomic leave→warm + set active. Prefer over setActive+touch.
 * Call only after URL/context has committed (layout effect), never before router.push.
 */
export function promoteWorkspaceSurfaceSwitch(nextContextId: string | null): {
  previousContextId: string | null;
  alreadyActive: boolean;
} {
  const store = useWorkspaceSurfaceCacheStore.getState();
  const previousContextId = store.activeContextId;
  if (previousContextId === nextContextId) {
    // URL caught up to an optimistic visual flip — keep visual aligned.
    if (store.visualActiveContextId !== nextContextId) {
      store.beginVisualSwitch(nextContextId);
    }
    return { previousContextId, alreadyActive: true };
  }
  store.switchContext(nextContextId);
  return { previousContextId, alreadyActive: false };
}

/**
 * Nav-time prep: inject last tab into href (pure string).
 * Does not touch WSC — use {@link primeWorkspaceSurfaceNavigation} for paint.
 */
export function prepareWorkspaceContextNavigation(path: string): string {
  try {
    const parsed = parseWorkspaceContextHref(path);
    if (!parsed.view || !parsed.contextId) return path;
    if (parsed.hasTabParam) return path;

    const lastTab = readCenterStageLastTab(parsed.contextId);
    return injectLastCenterTabIfMissing(path, lastTab);
  } catch {
    return path;
  }
}

/**
 * Instant center paint for hops to an already-mounted context (Active ∪ Warm).
 * Safe on the click path: schedules `visualActiveContextId` only (no promote).
 * Slow hops flush immediately; rapid hops coalesce to the latest target.
 * Cold / frozen targets are left alone so we never flash an empty frame.
 */
export function primeWorkspaceSurfaceNavigation(path: string): boolean {
  try {
    const parsed = parseWorkspaceContextHref(path);
    if (!parsed.view || !parsed.contextId) return false;

    const store = useWorkspaceSurfaceCacheStore.getState();
    const mounted = store.getMountedContextIds();
    if (!mounted.includes(parsed.contextId)) {
      // Cold / frozen: cancel any pending warm lead and snap paint to committed active.
      cancelScheduledVisualActiveSwitch();
      if (
        store.visualActiveContextId != null &&
        store.visualActiveContextId !== store.activeContextId
      ) {
        store.beginVisualSwitch(store.activeContextId);
        lastVisualFlushAt = nowMs();
      }
      return false;
    }

    scheduleVisualActiveSwitch(parsed.contextId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Full nav-time helper: last-tab inject + optional warm visual prime.
 * Prefer this from app-router push/replace.
 */
export function prepareAndPrimeWorkspaceNavigation(path: string): string {
  const prepared = prepareWorkspaceContextNavigation(path);
  primeWorkspaceSurfaceNavigation(prepared);
  return prepared;
}

/**
 * Run after the current React commit flushes (useEffect is already post-paint).
 * Prefer this for switch promote — double-rAF was waiting 0.5–1s under multi-frame load.
 */
export function scheduleAfterCommit(fn: () => void): () => void {
  let cancelled = false;
  const run = () => {
    if (!cancelled) fn();
  };
  if (typeof queueMicrotask === "function") {
    queueMicrotask(run);
  } else {
    setTimeout(run, 0);
  }
  return () => {
    cancelled = true;
  };
}

/**
 * Run after the next frame (single rAF). Use for non-critical rebind work
 * (git context, file tree) that should not block click handlers.
 */
export function scheduleAfterPaint(fn: () => void): () => void {
  let cancelled = false;
  if (typeof requestAnimationFrame === "undefined") {
    const t = setTimeout(() => {
      if (!cancelled) fn();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }
  const id = requestAnimationFrame(() => {
    if (!cancelled) fn();
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(id);
  };
}

/**
 * Coalesce rapid calls: only the latest `fn` runs after `delayMs`.
 * Used so fast workspace hops only apply the final context.
 */
export function scheduleCoalesced(
  fn: () => void,
  delayMs = 32,
): () => void {
  let cancelled = false;
  const t = setTimeout(() => {
    if (!cancelled) fn();
  }, delayMs);
  return () => {
    cancelled = true;
    clearTimeout(t);
  };
}

/**
 * Run when the browser is idle (falls back to short timeout).
 * `timeoutMs` caps how long we wait before forcing the work.
 */
export function scheduleIdle(fn: () => void, timeoutMs = 120): () => void {
  let cancelled = false;
  const run = () => {
    if (!cancelled) fn();
  };

  if (typeof requestIdleCallback !== "undefined") {
    const id = requestIdleCallback(run, { timeout: timeoutMs });
    return () => {
      cancelled = true;
      cancelIdleCallback(id);
    };
  }

  const t = setTimeout(run, Math.min(timeoutMs, 32));
  return () => {
    cancelled = true;
    clearTimeout(t);
  };
}
