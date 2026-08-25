import {
  buildLocatedPanePath,
  locationMatchesDestination,
  navigateToLocatedPane,
  waitForDestination,
  type LocatedResourceSessionRouteKind,
  type LiveResourceSessionLocation,
  type NavigateToLocatedPaneDeps,
  type NavigateToLocatedPaneRouter,
} from "@/features/terminal/public";

export type ResourceMonitorSessionRouteKind = LocatedResourceSessionRouteKind;

export type ResourceMonitorSessionNavigationTarget = {
  location: LiveResourceSessionLocation;
  routeKind: ResourceMonitorSessionRouteKind;
};

/**
 * Navigate from a Resource Monitor session row to the live pane.
 * Same-host dest query commits before Center Space switch. Does not raise
 * agent attention.
 */
export function navigateToResourceMonitorSession(
  location: LiveResourceSessionLocation,
  routeKind: ResourceMonitorSessionRouteKind,
  router: NavigateToLocatedPaneRouter,
  deps?: NavigateToLocatedPaneDeps,
): Promise<boolean> {
  return navigateToLocatedPane(location, { routeKind, router }, deps);
}

/**
 * Footer-owned click sequence: mark navigation, close the popover, then
 * deep-link. On failure, reopen without toast or a guessed route.
 */
export async function runResourceMonitorSessionNavigation(input: {
  target: ResourceMonitorSessionNavigationTarget;
  router: NavigateToLocatedPaneRouter;
  markNavigating: () => void;
  close: () => void;
  reopen: () => void;
  navigate?: typeof navigateToResourceMonitorSession;
  deps?: NavigateToLocatedPaneDeps;
}): Promise<boolean> {
  input.markNavigating();
  input.close();
  const navigate = input.navigate ?? navigateToResourceMonitorSession;
  const ok = await navigate(
    input.target.location,
    input.target.routeKind,
    input.router,
    input.deps,
  );
  if (!ok) input.reopen();
  return ok;
}

export {
  buildLocatedPanePath,
  locationMatchesDestination,
  navigateToLocatedPane,
  waitForDestination,
};
