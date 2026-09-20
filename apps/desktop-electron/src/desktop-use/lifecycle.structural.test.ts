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

  it("does not kill shared Runtime or host daemon on Desktop quit (APP-076)", () => {
    const main = readFileSync(join(root, "main.ts"), "utf8");
    expect(main).toContain("desktopQuitShouldStopRuntime");
    expect(main).toContain("before-quit");
    const src = readFileSync(join(root, "desktop-use/lifecycle.ts"), "utf8");
    expect(src).toContain("APP-076");
    expect(src).not.toContain("desktopUseDriverStop");
    expect(src.toLowerCase()).not.toContain("cua-driver");
    expect(src.toLowerCase()).not.toContain("trycua");
  });

  it("driver stop uses a short quit-friendly timeout", () => {
    const client = readFileSync(join(root, "desktop-use/client.ts"), "utf8");
    expect(client).toMatch(
      /desktopUseDriverStop\([^)]*timeoutMs = 8_000/,
    );
    expect(client).toContain("DRIVER_RESTART_DEBOUNCE_MS");
    expect(client).toContain("driverRestartInFlight");
  });
});
