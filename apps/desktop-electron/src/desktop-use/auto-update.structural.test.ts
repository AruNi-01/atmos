import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

describe("desktop-use engine auto-update", () => {
  it("schedules background ensure on main boot", () => {
    const main = readFileSync(join(root, "main.ts"), "utf8");
    expect(main).toContain("scheduleDesktopUseEngineAutoUpdate");
    expect(main).toContain("desktop-use/auto-update");
  });

  it("only force-ensures when installed and update_available", () => {
    const src = readFileSync(join(root, "desktop-use/auto-update.ts"), "utf8");
    expect(src).toContain("update_available");
    expect(src).toContain("desktopUseDriverEnsure(true)");
    expect(src).toContain("skip (not installed");
    expect(src).toContain("scheduleDesktopUseEngineAutoUpdate");
    // Must not force-install on first launch for everyone.
    expect(src).not.toMatch(/desktopUseDriverEnsure\(true\).*not installed/s);
  });

  it("client prefers App Resources pin + packaged runner", () => {
    const client = readFileSync(join(root, "desktop-use/client.ts"), "utf8");
    expect(client).toContain("DESKTOP_USE_MANIFEST_ENV");
    expect(client).toContain("ATMOS_DESKTOP_USE_MANIFEST");
    expect(client).toContain("engine-manifest.json");
    expect(client).toContain("resolveDesktopUseManifestPath");
    expect(client).toContain("isPackagedElectron");
    // Production must not prefer user PATH pin over App Resources.
    expect(client).toContain("packagedCandidates");
  });
});
