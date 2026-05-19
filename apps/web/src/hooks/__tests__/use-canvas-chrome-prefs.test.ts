// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it, beforeEach } from "bun:test";

import { globalKey } from "@/lib/browser-store";
import {
  DEFAULT_CANVAS_CHROME_PREFS,
  writeCanvasChromePrefs,
} from "@/lib/canvas-chrome-prefs";

const STORAGE_KEY = globalKey("canvasChrome");

describe("canvas chrome prefs storage", () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("round-trips via localStorage", () => {
    writeCanvasChromePrefs({
      isStylePanelEnabled: true,
      isTopLeftToolbarCollapsed: true,
      isToolbarCollapsed: false,
    });
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual({
      isStylePanelEnabled: true,
      isTopLeftToolbarCollapsed: true,
      isToolbarCollapsed: false,
    });
  });

  it("defaults when key is missing", () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    writeCanvasChromePrefs(DEFAULT_CANVAS_CHROME_PREFS);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(
      DEFAULT_CANVAS_CHROME_PREFS,
    );
  });
});
