import { globalKey, readJson, writeJson } from '@/lib/browser-store';

const CANVAS_CHROME_PREFS_KEY = globalKey('canvasChrome');

export type CanvasChromePrefs = {
  isStylePanelEnabled: boolean;
  isTopLeftToolbarCollapsed: boolean;
  /** Top-right share panel action strip */
  isToolbarCollapsed: boolean;
  /** Bottom-center tldraw shape toolbar (docked = collapsed to peek bar) */
  isBottomToolbarDocked: boolean;
};

export const DEFAULT_CANVAS_CHROME_PREFS: CanvasChromePrefs = {
  isStylePanelEnabled: false,
  isTopLeftToolbarCollapsed: false,
  isToolbarCollapsed: false,
  isBottomToolbarDocked: false,
};

export function readCanvasChromePrefs(): CanvasChromePrefs {
  const raw = readJson<Partial<CanvasChromePrefs>>(CANVAS_CHROME_PREFS_KEY, DEFAULT_CANVAS_CHROME_PREFS);
  return {
    isStylePanelEnabled: raw.isStylePanelEnabled === true,
    isTopLeftToolbarCollapsed: raw.isTopLeftToolbarCollapsed === true,
    isToolbarCollapsed: raw.isToolbarCollapsed === true,
    isBottomToolbarDocked: raw.isBottomToolbarDocked === true,
  };
}

export function writeCanvasChromePrefs(prefs: CanvasChromePrefs): void {
  writeJson(CANVAS_CHROME_PREFS_KEY, prefs);
}

export function patchCanvasChromePrefs(partial: Partial<CanvasChromePrefs>): CanvasChromePrefs {
  const next = { ...readCanvasChromePrefs(), ...partial };
  writeCanvasChromePrefs(next);
  return next;
}
