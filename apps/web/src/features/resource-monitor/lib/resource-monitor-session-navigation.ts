import {
  buildLocatedPanePath,
  navigateToLocatedPane,
  type LocatedResourceSessionRouteKind,
  type LiveResourceSessionLocation,
  type NavigateToLocatedPaneDeps,
  type NavigateToLocatedPaneRouter,
} from "@/features/terminal/public";

export type ResourceMonitorSessionRouteKind = LocatedResourceSessionRouteKind;

/**
 * Navigate from a Resource Monitor session row to the live pane.
 * Switch completes before the route push. Does not raise agent attention.
 */
export function navigateToResourceMonitorSession(
  location: LiveResourceSessionLocation,
  routeKind: ResourceMonitorSessionRouteKind,
  router: NavigateToLocatedPaneRouter,
  deps?: NavigateToLocatedPaneDeps,
): Promise<boolean> {
  return navigateToLocatedPane(location, { routeKind, router }, deps);
}

export { buildLocatedPanePath, navigateToLocatedPane };
