/**
 * APP-043 workspace switch critical path.
 *
 * CRITICAL PERFORMANCE RULE:
 * Never write the WSC store (setActive/touch/switchContext) inside click handlers
 * before router.push. Zustand notifies subscribers synchronously and forces a full
 * CenterStage multi-frame re-render while the left sidebar is still waiting for the
 * URL to change — that is the 1–2s “selection lag”.
 *
 * Nav-time work must stay pure/cheap (last-tab URL inject only). WSC promote runs
 * after the route commits (CenterStage layout effect / switchContext).
 */

import { useWorkspaceSurfaceCacheStore } from "@/features/workspace/store/use-workspace-surface-cache-store";
import { readCenterStageLastTab } from "@/shared/stores/use-ui-pref-hooks";

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
    return { previousContextId, alreadyActive: true };
  }
  store.switchContext(nextContextId);
  return { previousContextId, alreadyActive: false };
}

/**
 * Nav-time prep: **only** inject last tab into href.
 * Must NOT touch WSC — that blocks the click until CenterStage re-renders.
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
