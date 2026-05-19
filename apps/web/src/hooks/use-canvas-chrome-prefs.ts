"use client";

import * as React from "react";

import {
  DEFAULT_CANVAS_CHROME_PREFS,
  type CanvasChromePrefs,
  patchCanvasChromePrefs,
  readCanvasChromePrefs,
} from "@/lib/canvas-chrome-prefs";

/**
 * Canvas chrome UI prefs (toolbar collapse, style panel, …) backed by
 * `localStorage` (`atmos:v1:global:canvasChrome`).
 *
 * Hydrates from storage after mount so SSR defaults are not written back
 * over saved values on the first client effect tick.
 */
export function useCanvasChromePrefs() {
  const [prefs, setPrefs] = React.useState<CanvasChromePrefs>(DEFAULT_CANVAS_CHROME_PREFS);
  const hydratedRef = React.useRef(false);

  React.useEffect(() => {
    setPrefs(readCanvasChromePrefs());
    hydratedRef.current = true;
  }, []);

  const patch = React.useCallback((partial: Partial<CanvasChromePrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...partial };
      if (hydratedRef.current) {
        patchCanvasChromePrefs(next);
      }
      return next;
    });
  }, []);

  return {
    ...prefs,
    setIsStylePanelEnabled: (value: boolean) => patch({ isStylePanelEnabled: value }),
    setIsTopLeftToolbarCollapsed: (value: boolean) =>
      patch({ isTopLeftToolbarCollapsed: value }),
    setIsToolbarCollapsed: (value: boolean) => patch({ isToolbarCollapsed: value }),
    setIsBottomToolbarDocked: (value: boolean) => patch({ isBottomToolbarDocked: value }),
    toggleIsStylePanelEnabled: () =>
      patch({ isStylePanelEnabled: !prefs.isStylePanelEnabled }),
    toggleIsTopLeftToolbarCollapsed: () =>
      patch({ isTopLeftToolbarCollapsed: !prefs.isTopLeftToolbarCollapsed }),
    toggleIsToolbarCollapsed: () => patch({ isToolbarCollapsed: !prefs.isToolbarCollapsed }),
    toggleIsBottomToolbarDocked: () =>
      patch({ isBottomToolbarDocked: !prefs.isBottomToolbarDocked }),
  };
}
