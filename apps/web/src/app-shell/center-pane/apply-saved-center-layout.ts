import type { CenterSurfaceKind, SavedCenterLayout } from "@/app-shell/center-pane/center-pane-saved-layout";
import {
  collectSavedSurfaces,
  isToolSurfaceKind,
  materializeSavedLayout,
  resolveSurfaceTabId,
} from "@/app-shell/center-pane/center-pane-saved-layout";
import type { CenterToolTabValue } from "@/app-shell/center-tool-tabs";

export type ApplySavedCenterLayoutDeps = {
  contextId: string;
  saved: SavedCenterLayout;
  existingBrowserTabValue: string | null;
  openBrowserTab: () => { value: string; browserContextId: string };
  focusBrowserUrl: (browserContextId: string) => void;
  openSimulatorTab: (contextId: string) => void;
  openGitHistoryTab: (contextId: string) => void;
  openToolTab: (contextId: string, surface: CenterToolTabValue) => void;
};

/**
 * Ensure saved multi-pane surfaces exist, then materialize a live layout.
 * Browser tabs are reused when present; other tool surfaces are opened as needed.
 */
export function prepareSavedCenterLayout(deps: ApplySavedCenterLayoutDeps) {
  const {
    contextId,
    saved,
    existingBrowserTabValue,
    openBrowserTab,
    focusBrowserUrl,
    openSimulatorTab,
    openGitHistoryTab,
    openToolTab,
  } = deps;

  const surfaces = collectSavedSurfaces(saved);
  let browserTabValue: string | null = existingBrowserTabValue;

  for (const surface of surfaces) {
    if (surface === "browser") {
      if (!browserTabValue) {
        const tab = openBrowserTab();
        browserTabValue = tab.value;
        focusBrowserUrl(tab.browserContextId);
      }
      continue;
    }
    if (surface === "simulator") {
      openSimulatorTab(contextId);
      continue;
    }
    if (surface === "git-history") {
      openGitHistoryTab(contextId);
      continue;
    }
    if (isToolSurfaceKind(surface)) {
      openToolTab(contextId, surface);
      continue;
    }
  }

  const resolveTabId = (kind: CenterSurfaceKind) =>
    resolveSurfaceTabId(kind, { browserTabId: browserTabValue });

  return {
    liveLayout: materializeSavedLayout(saved, resolveTabId),
    browserTabValue,
  };
}
