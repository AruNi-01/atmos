// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";

import { globalKey } from "@/shared/lib/browser-store";
import {
  DEFAULT_CANVAS_CHROME_PREFS,
  writeCanvasChromePrefs,
} from "@/features/canvas/lib/canvas-chrome-prefs";

const STORAGE_KEY = globalKey("canvasChrome");

let previousWindow: PropertyDescriptor | undefined;

function installDom() {
  const win = new Window({ url: "http://localhost:3030" });
  previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: win,
    writable: true,
  });
  // happy-dom exposes localStorage on window; mirror for bare localStorage access
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: win.localStorage,
    writable: true,
  });
  return win;
}

function restoreDom() {
  if (previousWindow) {
    Object.defineProperty(globalThis, "window", previousWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
  Reflect.deleteProperty(globalThis, "localStorage");
}

describe("canvas chrome prefs storage", () => {
  beforeEach(() => {
    installDom();
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    restoreDom();
  });

  it("round-trips via localStorage", () => {
    writeCanvasChromePrefs({
      isStylePanelEnabled: true,
      isTopLeftToolbarCollapsed: true,
      isToolbarCollapsed: false,
      isBottomToolbarDocked: true,
    });
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual({
      isStylePanelEnabled: true,
      isTopLeftToolbarCollapsed: true,
      isToolbarCollapsed: false,
      isBottomToolbarDocked: true,
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
