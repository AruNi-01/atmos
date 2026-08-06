import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasIconComposerPackage,
  ICON_COMPOSER_REL,
  ICON_ICNS_REL,
} from "./macos-icon.ts";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(appRoot, "../..");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("macos Liquid Glass icon packaging helpers", () => {
  it("keeps Icon Composer package in resources/icons", () => {
    expect(hasIconComposerPackage(appRoot)).toBe(true);
    expect(existsSync(join(appRoot, ICON_COMPOSER_REL, "icon.json"))).toBe(
      true,
    );
    expect(
      existsSync(join(appRoot, ICON_COMPOSER_REL, "Assets", "Logo.png")),
    ).toBe(true);
  });

  it("keeps legacy icns for DMG / older macOS", () => {
    expect(existsSync(join(appRoot, ICON_ICNS_REL))).toBe(true);
  });

  it("keeps Desktop Use host + notification icons in lockstep with app icns", () => {
    const appIcns = join(appRoot, ICON_ICNS_REL);
    const hostIcns = join(
      repoRoot,
      "crates/desktop-use/assets/host-app-icon.icns",
    );
    const notificationPng = join(
      repoRoot,
      "apps/web/public/notification-icon.png",
    );
    expect(existsSync(hostIcns)).toBe(true);
    expect(existsSync(notificationPng)).toBe(true);
    // Same classic brand plate for host and main app (byte-identical icns).
    expect(sha256(hostIcns)).toBe(sha256(appIcns));
  });
});
