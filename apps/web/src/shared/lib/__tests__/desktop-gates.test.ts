// @ts-expect-error bun:test
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";

import {
  isDesktopRuntime,
  isTauriRuntime,
} from "../desktop-runtime";

/**
 * Contract: product desktop features must use isDesktopRuntime(), not Tauri-only,
 * so Electron shell gets cookie tools + desktop preview.
 */
describe("desktop runtime gates for dual-shell", () => {
  let previousWindow: PropertyDescriptor | undefined;

  beforeEach(() => {
    previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  });

  afterEach(() => {
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("electron shell is desktop but not tauri", () => {
    const win = new Window({ url: "https://app.atmos.land/" });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: win,
      writable: true,
    });
    (win as unknown as { __ATMOS_DESKTOP__: object }).__ATMOS_DESKTOP__ = {
      shell: "electron",
      invoke: async () => ({}),
    };
    expect(isDesktopRuntime()).toBe(true);
    expect(isTauriRuntime()).toBe(false);
  });

  it("tauri shell is both desktop and tauri", () => {
    const win = new Window({ url: "https://app.atmos.land/" });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: win,
      writable: true,
    });
    (win as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: async () => ({}),
    };
    expect(isDesktopRuntime()).toBe(true);
    expect(isTauriRuntime()).toBe(true);
  });

  it("cookieToolsAvailable formula is true on electron+Mac UA", () => {
    const macUa =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
    const win = new Window({
      url: "https://app.atmos.land/",
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: win,
      writable: true,
    });
    // happy-dom may use global navigator; mirror Preview's window-aware check.
    Object.defineProperty(win.navigator, "userAgent", {
      configurable: true,
      get: () => macUa,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: macUa },
    });
    (win as unknown as { __ATMOS_DESKTOP__: object }).__ATMOS_DESKTOP__ = {
      shell: "electron",
      invoke: async () => ({}),
    };
    const ua =
      typeof window !== "undefined" && window.navigator?.userAgent
        ? window.navigator.userAgent
        : typeof navigator !== "undefined"
          ? navigator.userAgent
          : "";
    // Same formula as Preview.tsx cookieToolsAvailable
    const cookieToolsAvailable =
      isDesktopRuntime() && /Mac/i.test(ua);
    expect(isDesktopRuntime()).toBe(true);
    expect(/Mac/i.test(ua)).toBe(true);
    expect(cookieToolsAvailable).toBe(true);
  });
});

