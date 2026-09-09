import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  grantOverlaySourceOriginFromAnchor,
  leftSidebarGrantOrigin,
  parseViewportAnchor,
  resolveAtmosAppBundlePath,
} from "./macos-app-permission-geometry.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("macos app permissions", () => {
  it("walks execPath up to the .app bundle on macOS", () => {
    expect(
      resolveAtmosAppBundlePath(
        "/Applications/Atmos.app/Contents/MacOS/Atmos",
        "darwin",
      ),
    ).toBe("/Applications/Atmos.app");
    expect(
      resolveAtmosAppBundlePath(
        "/tmp/dev-app/Atmos.app/Contents/MacOS/Electron",
        "darwin",
      ),
    ).toBe("/tmp/dev-app/Atmos.app");
    expect(
      resolveAtmosAppBundlePath(
        "/Applications/Atmos.app/Contents/MacOS/Atmos",
        "linux",
      ),
    ).toBeNull();
  });

  it("parses viewport anchors and maps them to overlay origin", () => {
    expect(parseViewportAnchor({ x: 10, y: 20, width: 40, height: 16 })).toEqual({
      x: 10,
      y: 20,
      width: 40,
      height: 16,
    });
    expect(parseViewportAnchor({ x: 0, y: 0, width: 0, height: 10 })).toBeUndefined();
    expect(
      grantOverlaySourceOriginFromAnchor(
        { x: 100, y: 200 },
        { x: 10, y: 20, width: 40, height: 16 },
        460,
        128,
      ),
    ).toEqual({
      x: Math.round(100 + 10 + 20 - 230),
      y: Math.round(200 + 20 + 8 - 64),
    });
    expect(
      leftSidebarGrantOrigin({ x: 80, y: 40, width: 1200, height: 800 }, 188),
    ).toEqual({ x: 96, y: 128 });
  });

  it("never uses the system Accessibility lock prompt", () => {
    const src = readFileSync(join(here, "macos-app-permissions.ts"), "utf8");
    expect(src).toContain("isTrustedAccessibilityClient(false)");
    expect(src).not.toContain("isTrustedAccessibilityClient(true)");
    expect(src).toContain("showAccessibilityGrantOverlay");
    expect(src).toContain("openMacosPrivacyPane");
    expect(src).toContain('openSettings === "after"');
    expect(src).toContain("leftSidebarGrantOrigin");
    const service = readFileSync(join(here, "appshot/service.ts"), "utf8");
    expect(service).toContain("isTrustedAccessibilityClient(false)");
    expect(service).not.toContain("isTrustedAccessibilityClient(true)");
    expect(service).not.toContain("requestElectronAccessibilityPrompt");
    expect(service).toContain("grantAtmosAppPermission");
    const host = readFileSync(join(here, "host-shortcuts.ts"), "utf8");
    expect(host).not.toContain("isTrustedAccessibilityClient(true)");
    expect(host).toContain("grantAtmosAppPermission");
    const handlers = readFileSync(join(here, "ipc/handlers.ts"), "utf8");
    expect(handlers).toContain("macos_app_permissions_status");
    expect(handlers).toContain("macos_app_permissions_grant");
  });
});
