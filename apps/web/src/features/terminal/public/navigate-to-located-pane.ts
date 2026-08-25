"use client";

import type { LiveResourceSessionLocation } from "@/features/terminal/public/pane-location";
import { useTerminalPaneLocateStore } from "@/features/terminal/store/terminal-pane-locate-store";

export type LocatedResourceSessionRouteKind = "project" | "workspace";

export type NavigateToLocatedPaneRouter = {
  push: (path: string) => void;
  /**
   * Prefer this when the router is `useAppRouter()`. It keeps dest `tab` /
   * `terminalTmux` across a host hop. Tests and other callers may omit it and
   * fall back to `push`.
   */
  pushWorkspaceDeepLink?: (path: string) => void;
};

export type LocatedPaneHref = {
  pathname: string;
  search: string;
};

export type LocatedPaneDestination = {
  pathname: "/project" | "/workspace";
  id: string;
  tab: string;
  terminalTmux?: string;
};

export const LOCATE_DESTINATION_POLL_INTERVAL_MS = 50;
export const LOCATE_DESTINATION_POLL_ATTEMPTS = 20;

export type NavigateToLocatedPaneDeps = {
  hydrate?: () => void;
  ensureHost?: (hostId: string) => void;
  listSpaceIds?: (hostId: string) => readonly string[];
  currentHostId?: () => string | null;
  currentSpaceId?: (hostId: string) => string | null;
  switchCenterSpace?: (
    hostId: string,
    spaceId: string,
    options: { preserveDeepLink: true },
  ) => Promise<void>;
  setActiveSpace?: (hostId: string, spaceId: string) => void;
  requestLocate?: (target: LiveResourceSessionLocation) => number;
  clearLocate?: () => void;
  getLocation?: () => LocatedPaneHref;
  sleep?: (ms: number) => Promise<void>;
  waitAttempts?: number;
  waitIntervalMs?: number;
  waitForDestination?: (dest: LocatedPaneDestination) => Promise<boolean>;
};

function currentHostIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("id")?.trim() || null;
}

function isValidLocation(
  location: LiveResourceSessionLocation | null | undefined,
): location is LiveResourceSessionLocation {
  if (!location) return false;
  return Boolean(
    location.hostId?.trim() &&
      location.spaceId?.trim() &&
      location.paintContextId?.trim() &&
      location.terminalTabId?.trim() &&
      location.paneId?.trim() &&
      location.sessionId?.trim(),
  );
}

export function locatedPaneDestination(
  location: LiveResourceSessionLocation,
  routeKind: LocatedResourceSessionRouteKind,
): LocatedPaneDestination {
  const tmux = location.tmuxWindowName?.trim();
  return {
    pathname: routeKind === "project" ? "/project" : "/workspace",
    id: location.hostId,
    tab: location.terminalTabId,
    ...(tmux ? { terminalTmux: tmux } : {}),
  };
}

export function buildLocatedPanePath(
  location: LiveResourceSessionLocation,
  routeKind: LocatedResourceSessionRouteKind,
): string {
  const dest = locatedPaneDestination(location, routeKind);
  const params = new URLSearchParams();
  params.set("id", dest.id);
  params.set("tab", dest.tab);
  if (dest.terminalTmux) params.set("terminalTmux", dest.terminalTmux);
  return `${dest.pathname}?${params.toString()}`;
}

function normalizeCenterPathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  if (trimmed === "/workspace" || trimmed.endsWith("/workspace")) return "/workspace";
  if (trimmed === "/project" || trimmed.endsWith("/project")) return "/project";
  return trimmed;
}

function readWindowLocation(): LocatedPaneHref {
  if (typeof window === "undefined") return { pathname: "", search: "" };
  return { pathname: window.location.pathname, search: window.location.search };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export function commitLocatedPaneNavigation(
  router: NavigateToLocatedPaneRouter,
  path: string,
): void {
  if (typeof router.pushWorkspaceDeepLink === "function") {
    router.pushWorkspaceDeepLink(path);
    return;
  }
  router.push(path);
}

/**
 * Dest is committed when pathname / id match and:
 * - dest has terminalTmux → current equals that value
 * - dest has no terminalTmux (simple PTY) → leftover terminalTmux is gone
 *
 * CenterStage consumes dest `tab` as live chrome on the next paint, so a
 * missing tab is still committed. A leftover *different* tab is not.
 */
export function locationMatchesDestination(
  href: LocatedPaneHref,
  dest: LocatedPaneDestination,
): boolean {
  if (normalizeCenterPathname(href.pathname) !== dest.pathname) return false;
  const params = new URLSearchParams(href.search.startsWith("?") ? href.search.slice(1) : href.search);
  if ((params.get("id") ?? "").trim() !== dest.id) return false;
  const currentTab = (params.get("tab") ?? "").trim();
  if (currentTab && currentTab !== dest.tab) return false;
  const currentTmux = (params.get("terminalTmux") ?? "").trim();
  if (dest.terminalTmux) return currentTmux === dest.terminalTmux;
  return currentTmux === "";
}

export async function waitForDestination(
  dest: LocatedPaneDestination,
  options?: {
    getLocation?: () => LocatedPaneHref;
    sleep?: (ms: number) => Promise<void>;
    intervalMs?: number;
    attempts?: number;
  },
): Promise<boolean> {
  const getLocation = options?.getLocation ?? readWindowLocation;
  const sleep = options?.sleep ?? defaultSleep;
  const intervalMs = options?.intervalMs ?? LOCATE_DESTINATION_POLL_INTERVAL_MS;
  const attempts = options?.attempts ?? LOCATE_DESTINATION_POLL_ATTEMPTS;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (locationMatchesDestination(getLocation(), dest)) return true;
    if (attempt === attempts - 1) break;
    await sleep(intervalMs);
  }
  return locationMatchesDestination(getLocation(), dest);
}

type PreparedHost = {
  ok: true;
  currentHostId: string | null;
  currentSpaceId: string | null;
} | {
  ok: false;
};

async function prepareHostAndSpace(
  location: LiveResourceSessionLocation,
  deps: NavigateToLocatedPaneDeps,
): Promise<PreparedHost> {
  if (deps.hydrate || deps.ensureHost || deps.listSpaceIds) {
    deps.hydrate?.();
    deps.ensureHost?.(location.hostId);
    const spaceIds = deps.listSpaceIds?.(location.hostId) ?? [];
    if (!spaceIds.includes(location.spaceId)) return { ok: false };
    return {
      ok: true,
      currentHostId: deps.currentHostId?.() ?? currentHostIdFromLocation(),
      currentSpaceId: deps.currentSpaceId?.(location.hostId) ?? null,
    };
  }

  const { useCenterSpaceStore } = await import(
    "@/app-shell/center-space/center-space-store"
  );
  const store = useCenterSpaceStore.getState();
  if (!store.hydrated) store.hydrate();
  store.ensureHost(location.hostId);
  if (!store.list(location.hostId).some((space) => space.id === location.spaceId)) {
    return { ok: false };
  }
  return {
    ok: true,
    currentHostId: deps.currentHostId?.() ?? currentHostIdFromLocation(),
    currentSpaceId: store.getActiveSpaceId(location.hostId),
  };
}

async function switchSameHostSpace(
  location: LiveResourceSessionLocation,
  deps: NavigateToLocatedPaneDeps,
): Promise<void> {
  if (deps.switchCenterSpace) {
    await deps.switchCenterSpace(location.hostId, location.spaceId, {
      preserveDeepLink: true,
    });
    return;
  }
  const { switchCenterSpace } = await import(
    "@/app-shell/center-space/center-space-switch"
  );
  await switchCenterSpace(location.hostId, location.spaceId, {
    preserveDeepLink: true,
  });
}

/**
 * Commit the dest query before a same-host Center Space switch so leftover
 * `terminalTmux` cannot bounce the incoming space back to default.
 * Already-on dest space skips that wait: CenterStage strips dest `tab` (and
 * later `terminalTmux`) as live chrome, which would otherwise time out and
 * reopen Resource Monitor. Locate is requested only after the dest space
 * exists and before switch, while a warm hidden pane still cannot arrive.
 * Never touches agent attention.
 */
export async function navigateToLocatedPane(
  location: LiveResourceSessionLocation,
  options: {
    routeKind: LocatedResourceSessionRouteKind;
    router: NavigateToLocatedPaneRouter;
  },
  deps: NavigateToLocatedPaneDeps = {},
): Promise<boolean> {
  const clearLocate =
    deps.clearLocate ?? (() => useTerminalPaneLocateStore.getState().clear());
  const requestLocate =
    deps.requestLocate ??
    ((target) => useTerminalPaneLocateStore.getState().request(target));

  if (!isValidLocation(location)) {
    clearLocate();
    return false;
  }
  if (options.routeKind !== "project" && options.routeKind !== "workspace") {
    clearLocate();
    return false;
  }

  const prepared = await prepareHostAndSpace(location, deps);
  if (!prepared.ok) {
    clearLocate();
    return false;
  }

  const dest = locatedPaneDestination(location, options.routeKind);
  const path = buildLocatedPanePath(location, options.routeKind);
  const sameHost = prepared.currentHostId === location.hostId;
  const alreadyOnDestSpace = sameHost && prepared.currentSpaceId === location.spaceId;

  if (!sameHost) {
    if (deps.setActiveSpace) {
      deps.setActiveSpace(location.hostId, location.spaceId);
    } else {
      const { useCenterSpaceStore } = await import(
        "@/app-shell/center-space/center-space-store"
      );
      useCenterSpaceStore.getState().setActiveSpace(location.hostId, location.spaceId);
    }
  }

  requestLocate(location);
  commitLocatedPaneNavigation(options.router, path);

  if (!alreadyOnDestSpace) {
    const committed = deps.waitForDestination
      ? await deps.waitForDestination(dest)
      : await waitForDestination(dest, {
          getLocation: deps.getLocation,
          sleep: deps.sleep,
          attempts: deps.waitAttempts,
          intervalMs: deps.waitIntervalMs,
        });
    if (!committed) {
      clearLocate();
      return false;
    }
  }

  if (sameHost && !alreadyOnDestSpace) {
    await switchSameHostSpace(location, deps);
  }
  return true;
}
