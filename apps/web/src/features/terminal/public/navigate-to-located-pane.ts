"use client";

import type { LiveResourceSessionLocation } from "@/features/terminal/public/pane-location";
import { useTerminalPaneLocateStore } from "@/features/terminal/store/terminal-pane-locate-store";

export type LocatedResourceSessionRouteKind = "project" | "workspace";

export type NavigateToLocatedPaneRouter = {
  push: (path: string) => void;
};

export type NavigateToLocatedPaneDeps = {
  hydrate?: () => void;
  ensureHost?: (hostId: string) => void;
  listSpaceIds?: (hostId: string) => readonly string[];
  currentHostId?: () => string | null;
  switchCenterSpace?: (
    hostId: string,
    spaceId: string,
    options: { preserveDeepLink: true },
  ) => Promise<void>;
  setActiveSpace?: (hostId: string, spaceId: string) => void;
  requestLocate?: (target: LiveResourceSessionLocation) => number;
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

export function buildLocatedPanePath(
  location: LiveResourceSessionLocation,
  routeKind: LocatedResourceSessionRouteKind,
): string {
  const params = new URLSearchParams();
  params.set("id", location.hostId);
  params.set("tab", location.terminalTabId);
  const tmux = location.tmuxWindowName?.trim();
  if (tmux) params.set("terminalTmux", tmux);
  const base = routeKind === "project" ? "/project" : "/workspace";
  return `${base}?${params.toString()}`;
}

async function activateCenterSpaceForLocation(
  location: LiveResourceSessionLocation,
  deps: NavigateToLocatedPaneDeps,
): Promise<boolean> {
  if (deps.hydrate || deps.ensureHost || deps.listSpaceIds) {
    deps.hydrate?.();
    deps.ensureHost?.(location.hostId);
    const spaceIds = deps.listSpaceIds?.(location.hostId) ?? [];
    if (!spaceIds.includes(location.spaceId)) return false;
    const currentHostId = deps.currentHostId?.() ?? currentHostIdFromLocation();
    if (currentHostId === location.hostId) {
      await deps.switchCenterSpace?.(location.hostId, location.spaceId, {
        preserveDeepLink: true,
      });
    } else {
      deps.setActiveSpace?.(location.hostId, location.spaceId);
    }
    return true;
  }

  const { useCenterSpaceStore } = await import(
    "@/app-shell/center-space/center-space-store"
  );
  const store = useCenterSpaceStore.getState();
  if (!store.hydrated) store.hydrate();
  store.ensureHost(location.hostId);
  if (!store.list(location.hostId).some((space) => space.id === location.spaceId)) {
    return false;
  }
  const currentHostId = deps.currentHostId?.() ?? currentHostIdFromLocation();
  if (currentHostId === location.hostId) {
    const { switchCenterSpace } = await import(
      "@/app-shell/center-space/center-space-switch"
    );
    await switchCenterSpace(location.hostId, location.spaceId, {
      preserveDeepLink: true,
    });
    return true;
  }
  store.setActiveSpace(location.hostId, location.spaceId);
  return true;
}

/**
 * Activate the owning Center Space, request a terminal locate pulse, then
 * deep-link the pane. Switch always completes before `router.push`.
 * Never touches agent-attention state.
 */
export async function navigateToLocatedPane(
  location: LiveResourceSessionLocation,
  options: {
    routeKind: LocatedResourceSessionRouteKind;
    router: NavigateToLocatedPaneRouter;
  },
  deps: NavigateToLocatedPaneDeps = {},
): Promise<boolean> {
  if (!isValidLocation(location)) return false;
  if (options.routeKind !== "project" && options.routeKind !== "workspace") {
    return false;
  }

  const switched = await activateCenterSpaceForLocation(location, deps);
  if (!switched) return false;

  const requestLocate =
    deps.requestLocate ?? ((target) => useTerminalPaneLocateStore.getState().request(target));
  requestLocate(location);
  options.router.push(buildLocatedPanePath(location, options.routeKind));
  return true;
}
