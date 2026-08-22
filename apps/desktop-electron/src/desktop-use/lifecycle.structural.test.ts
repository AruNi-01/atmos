import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

describe("desktop-use quit lifecycle", () => {
  it("applies host branding on boot before AppShot", () => {
    const main = readFileSync(join(root, "main.ts"), "utf8");
    expect(main).toContain("ensureDesktopUseHostBranding");
    const brandingAt = main.indexOf("ensureDesktopUseHostBranding");
    const appshotAt = main.indexOf("appshotStatus");
    expect(brandingAt).toBeGreaterThan(-1);
    expect(appshotAt).toBeGreaterThan(brandingAt);
    const branding = readFileSync(
      join(root, "desktop-use/host-branding.ts"),
      "utf8",
    );
    expect(branding).toContain("AppIcon.icns");
    expect(branding).toContain("applyHostAppIcon");
  });

  it("stops the host daemon on real quit, not window hide", () => {
    const main = readFileSync(join(root, "main.ts"), "utf8");
    expect(main).toContain("stopDesktopUseOnAppQuit");
    expect(main).toContain("desktop-use/lifecycle");
    expect(main).toContain("before-quit");
    const hideHandler = main.slice(
      main.indexOf('app.on("window-all-closed"'),
      main.indexOf('app.on("activate"'),
    );
    expect(hideHandler).not.toContain("stopDesktopUseOnAppQuit");
  });

  it("uses CLI stop plus host serve pkill, no vendor process name", () => {
    const src = readFileSync(join(root, "desktop-use/lifecycle.ts"), "utf8");
    expect(src).toContain("desktopUseDriverStop");
    expect(src).toContain("Atmos Desktop Use.app/Contents/MacOS/.*serve");
    expect(src).toContain("isAtmosCliInstalled");
    expect(src.toLowerCase()).not.toContain("cua-driver");
    expect(src.toLowerCase()).not.toContain("trycua");
  });

  it("driver stop uses a short quit-friendly timeout", () => {
    const client = readFileSync(join(root, "desktop-use/client.ts"), "utf8");
    expect(client).toMatch(
      /desktopUseDriverStop\([^)]*timeoutMs = 8_000/,
    );
  });
});
