import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hostWindowToFrontmost,
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
    // Structural: host-capture must prefer drive capture/result png_base64.
    const src = readFileSync(join(import.meta.dir, "host-capture.ts"), "utf8");
    expect(src).toContain("capture.png_base64");
    expect(src).toContain("r.png_base64");
    expect(src).toContain("throw new Error");
    // Must not soft-warn host_engine_screenshot_missing without throw path
    expect(src).not.toContain("host_engine_screenshot_missing");
  });

  it("picks highest z_index on-screen window for frontmost", () => {
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

  it("falls back to max z when none on screen", () => {
    const pick = pickFrontmostWindow([
      { app_name: "A", z_index: 1, is_on_screen: false },
      { app_name: "B", z_index: 3, is_on_screen: false },
    ]);
    expect(pick?.app_name).toBe("B");
  });
});
