import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hostWindowToFrontmost,
  matchWindowForFrontmost,
  mergeFrontmostIdentity,
  pickFrontmostWindow,
  shouldUseHostEngineCapture,
  type HostWindowRow,
} from "./host-capture.ts";

describe("host engine capture routing", () => {
  it("uses host engine only when control engine is installed", () => {
    expect(shouldUseHostEngineCapture({ driver: { installed: true, phase: "ready" } })).toBe(
      true,
    );
    expect(
      shouldUseHostEngineCapture({ driver: { installed: false, phase: "not_installed" } }),
    ).toBe(false);
    expect(shouldUseHostEngineCapture(null)).toBe(false);
    expect(shouldUseHostEngineCapture(undefined)).toBe(false);
  });

  it("reads Atmos-normalized capture.png_base64 (not phantom engine keys only)", () => {
    const src = readFileSync(join(import.meta.dir, "host-capture.ts"), "utf8");
    expect(src).toContain("capture.png_base64");
    expect(src).toContain("r.png_base64");
    expect(src).toContain("throw new Error");
    expect(src).not.toContain("host_engine_screenshot_missing");
    // User-facing records must not spam capture_via diagnostics
    expect(src).not.toContain("capture_via: Atmos Desktop Use host engine");
  });

  it("prefers focused app over high-z utility overlays", () => {
    const windows: HostWindowRow[] = [
      {
        app_name: "CursorUIViewService",
        pid: 1,
        window_id: 1,
        is_on_screen: false,
        z_index: 999,
        title: "",
        bounds: { x: 0, y: 0, width: 64, height: 64 },
      },
      {
        app_name: "豆包",
        pid: 2,
        window_id: 2,
        is_on_screen: false,
        z_index: 100,
        title: "豆包",
        bounds: { x: 0, y: 0, width: 1400, height: 800 },
      },
      {
        app_name: "QQ音乐",
        pid: 3,
        window_id: 3,
        is_on_screen: false,
        z_index: 50,
        title: "周杰伦",
        bounds: { x: 28, y: 40, width: 1428, height: 868 },
      },
    ];
    // Without focus hint, pick largest real window with title over tiny z-max overlay
    const pick = pickFrontmostWindow(windows);
    expect(pick?.app_name).not.toBe("CursorUIViewService");
    expect(["豆包", "QQ音乐"]).toContain(pick?.app_name);

    // With System Events saying QQ音乐 is frontmost — must match QQ
    const focused = matchWindowForFrontmost(
      windows,
      { appName: "QQ音乐", processId: 3 },
    );
    expect(focused?.app_name).toBe("QQ音乐");
    expect(focused?.title).toBe("周杰伦");
  });

  it("for any pid with chrome + content windows, picks largest content rect", () => {
    // Pattern seen across custom-UI apps: SE has 0 AX windows; host list has
    // thin title strips (high z) plus one real content window.
    const windows: HostWindowRow[] = [
      {
        app_name: "SomeApp",
        pid: 91609,
        window_id: 1,
        z_index: 189,
        is_on_screen: false,
        title: "",
        bounds: { x: 0, y: 0, width: 1512, height: 33 },
      },
      {
        app_name: "SomeApp",
        pid: 91609,
        window_id: 36971,
        z_index: 134,
        is_on_screen: false,
        title: "",
        bounds: { x: 68, y: 45, width: 1402, height: 832 },
      },
      {
        app_name: "SomeApp",
        pid: 91609,
        window_id: 3,
        z_index: 135,
        is_on_screen: false,
        bounds: { x: 0, y: 482, width: 500, height: 500 },
      },
    ];
    const focused = matchWindowForFrontmost(windows, {
      appName: "SomeAppHelperName", // name need not match exactly — pid wins
      processId: 91609,
    });
    expect(focused?.window_id).toBe(36971);
    expect(focused?.bounds?.width).toBe(1402);
    expect(focused?.bounds?.height).toBe(832);
  });

  it("merges System Events app name over mismatched host z-order pick", () => {
    const se = {
      appName: "QQ音乐",
      windowTitle: null,
      bundleId: null,
      processId: 3,
      windowId: null,
      x: 28,
      y: 40,
      width: 1428,
      height: 868,
    };
    const hostRow: HostWindowRow = {
      app_name: "豆包",
      title: "豆包",
      pid: 2,
      window_id: 99,
      z_index: 200,
      bounds: { x: 0, y: 0, width: 1400, height: 800 },
    };
    // Host row does not match SE app → keep SE identity, drop wrong host title
    const merged = mergeFrontmostIdentity(se, hostRow);
    expect(merged.appName).toBe("QQ音乐");
    expect(merged.processId).toBe(3);
  });

  it("merges host bounds when same app as System Events", () => {
    const se = {
      appName: "Notes",
      windowTitle: null,
      bundleId: null,
      processId: 10,
      windowId: null,
      x: null,
      y: null,
      width: null,
      height: null,
    };
    const hostRow: HostWindowRow = {
      app_name: "Notes",
      title: "Shopping",
      pid: 10,
      window_id: 55,
      bounds: { x: 1, y: 2, width: 300, height: 400 },
    };
    const merged = mergeFrontmostIdentity(se, hostRow);
    expect(merged.appName).toBe("Notes");
    expect(merged.windowTitle).toBe("Shopping");
    expect(merged.windowId).toBe("55");
    expect(merged.width).toBe(300);
  });

  it("picks highest-scoring real on-screen window", () => {
    const windows: HostWindowRow[] = [
      {
        app_name: "Safari",
        pid: 1,
        window_id: 10,
        is_on_screen: true,
        z_index: 5,
        bounds: { x: 0, y: 0, width: 800, height: 600 },
      },
      {
        app_name: "Notes",
        pid: 2,
        window_id: 20,
        is_on_screen: true,
        z_index: 50,
        title: "Todo",
        bounds: { x: 10, y: 20, width: 400, height: 300 },
      },
      {
        app_name: "Background",
        pid: 3,
        is_on_screen: false,
        z_index: 999,
        bounds: { x: 0, y: 0, width: 800, height: 600 },
      },
    ];
    const pick = pickFrontmostWindow(windows);
    expect(pick?.app_name).toBe("Notes");
    expect(pick?.pid).toBe(2);
    const fm = hostWindowToFrontmost(pick);
    expect(fm.appName).toBe("Notes");
    expect(fm.windowTitle).toBe("Todo");
    expect(fm.processId).toBe(2);
    expect(fm.width).toBe(400);
  });

  it("falls back among off-screen windows without utility noise", () => {
    const pick = pickFrontmostWindow([
      {
        app_name: "CursorUIViewService",
        z_index: 99,
        is_on_screen: false,
        bounds: { width: 64, height: 64, x: 0, y: 0 },
      },
      {
        app_name: "A",
        z_index: 1,
        is_on_screen: false,
        title: "Doc",
        bounds: { width: 800, height: 600, x: 0, y: 0 },
      },
      {
        app_name: "B",
        z_index: 3,
        is_on_screen: false,
        title: "Sheet",
        bounds: { width: 800, height: 600, x: 0, y: 0 },
      },
    ]);
    expect(pick?.app_name).toBe("B");
  });
});
