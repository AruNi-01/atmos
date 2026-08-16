/**
 * Host loading chrome for the in-app Browser.
 *
 * Toolbar spinner follows main-frame document navigations.
 * There is no full-viewport loading overlay — the refresh control spins instead.
 */

export type BrowserNavigationStart = {
  isMainFrame?: boolean;
  isInPlace?: boolean;
};

export function readWebviewNavigationStart(event: Event): BrowserNavigationStart {
  const detail = event as Event & BrowserNavigationStart;
  return {
    isMainFrame: detail.isMainFrame,
    isInPlace: detail.isInPlace,
  };
}

/** True for a real document load in the top frame (not SPA / iframe). */
export function isMainFrameDocumentNavigation(detail: BrowserNavigationStart): boolean {
  return detail.isMainFrame !== false && detail.isInPlace !== true;
}
