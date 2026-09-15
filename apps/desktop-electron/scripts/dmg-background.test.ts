import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

describe("macOS DMG backdrop layout", () => {
  it("keeps Dmgly window, icon size, and contents in electron-builder.yml", () => {
    const yml = readFileSync(join(appRoot, "electron-builder.yml"), "utf8");
    const dmg = yml.split("\ndmg:")[1]?.split("\nwin:")[0] ?? "";
    expect(dmg).toContain("background: resources/dmg/background.png");
    expect(dmg).toContain("icon: resources/icons/dmg-icon.icns");
    expect(dmg).toContain("iconSize: 128");
    expect(dmg).toContain("width: 642");
    expect(dmg).toContain("height: 406");
    expect(dmg).toContain("x: 95");
    expect(dmg).toContain("y: 72");
    expect(dmg).toContain("type: file");
    expect(dmg).toContain("x: 367");
    expect(dmg).toContain("y: 213");
    expect(dmg).toContain("path: /Applications");
    expect(dmg).toContain("title: Atmos");
    expect(dmg).toContain("artifactName: Atmos.${ext}");
  });

  it("ships 1x/2x backgrounds and the Applications folder glyph", () => {
    const bg1x = join(appRoot, "resources/dmg/background.png");
    const bg2x = join(appRoot, "resources/dmg/background@2x.png");
    const folder = join(appRoot, "resources/dmg/applications-folder.png");
    expect(existsSync(bg1x)).toBe(true);
    expect(existsSync(bg2x)).toBe(true);
    expect(existsSync(folder)).toBe(true);
    expect(pngSize(bg1x)).toEqual({ width: 642, height: 406 });
    expect(pngSize(bg2x)).toEqual({ width: 1284, height: 812 });
    expect(pngSize(folder)).toEqual({ width: 256, height: 256 });
  });

  it("keeps overlay constants aligned with electron-builder.yml", () => {
    const py = readFileSync(
      join(appRoot, "scripts/generate-dmg-background.py"),
      "utf8",
    );
    expect(py).toContain("W, H = 642, 406");
    expect(py).toContain("ICON_APP = (95, 72)");
    expect(py).toContain("ICON_APPLICATIONS = (367, 213)");
    expect(py).toContain("ICON_SIZE = 128");
    expect(py).toContain('TEXT = "Drag to Applications to install"');
    const pkg = readFileSync(join(appRoot, "scripts/package.ts"), "utf8");
    expect(pkg).toContain("stampDmgApplicationsAlias");
  });
});
