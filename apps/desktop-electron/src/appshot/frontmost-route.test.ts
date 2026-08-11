import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Structural regression: AppShot production capture must route through host
 * engine when installed (unified Atmos Desktop Use TCC identity).
 */
describe("AppShot capture route structure", () => {
  it("frontmost production path prefers host engine over Electron capture", () => {
    const src = readFileSync(join(import.meta.dir, "frontmost.ts"), "utf8");
    expect(src).toContain("resolveAppShotCaptureRoute");
    expect(src).toContain("captureFrontmostViaHostEngine");
    expect(src).toContain("host_engine");
    expect(src).toContain("electron_fallback");
    // Must not be a blind always-in-process path only
    expect(src).toContain('route === "host_engine"');
  });

  it("host-capture module encodes shouldUseHostEngineCapture on installed driver", () => {
    const hostCapture = readFileSync(
      join(import.meta.dir, "../desktop-use/host-capture.ts"),
      "utf8",
    );
    expect(hostCapture).toContain("shouldUseHostEngineCapture");
    expect(hostCapture).toContain("desktopUseDriveScreenshot");
    expect(hostCapture).toContain('via: "host_engine"');

    // Installed-driver gate lives in host-window-match (pure helper).
    const hostMatch = readFileSync(
      join(import.meta.dir, "../desktop-use/host-window-match.ts"),
      "utf8",
    );
    expect(hostMatch).toContain("shouldUseHostEngineCapture");
    expect(hostMatch).toContain("status?.driver?.installed");
  });

  it("electron in-process capture is documented as pre-ensure fallback only", () => {
    const src = readFileSync(
      join(import.meta.dir, "../desktop-use/capture.ts"),
      "utf8",
    );
    expect(src).toContain("pre-ensure fallback");
    expect(src).not.toMatch(/Single shot for AppShot hot path/);
  });
});
