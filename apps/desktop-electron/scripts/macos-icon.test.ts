import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasIconComposerPackage,
  ICON_COMPOSER_REL,
  ICON_ICNS_REL,
} from "./macos-icon.ts";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

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
});
