import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  APP_ID,
  APP_PRODUCT_NAME,
  resolveAppIcons,
  resolveIconFile,
} from "./branding-paths.ts";

describe("branding-paths", () => {
  it("exposes primary Atmos product identity", () => {
    expect(APP_PRODUCT_NAME).toBe("Atmos");
    expect(APP_ID).toBe("com.atmos.desktop");
  });

  it("resolves icon files from the first root that contains them", () => {
    const root = join(
      tmpdir(),
      `atmos-electron-icons-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(root, { recursive: true });
    try {
      writeFileSync(join(root, "icon.png"), "fake-png");
      expect(resolveIconFile("icon.png", [root])).toBe(join(root, "icon.png"));
      expect(resolveIconFile("icon.ico", [root])).toBeNull();

      const icons = resolveAppIcons([root], "darwin");
      expect(icons.pngPath).toBe(join(root, "icon.png"));
      expect(icons.windowIconPath).toBe(join(root, "icon.png"));
      expect(icons.dockIconPath).toBe(join(root, "icon.png"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prefers .ico on win32 for window icon", () => {
    const root = join(
      tmpdir(),
      `atmos-electron-icons-win-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(root, { recursive: true });
    try {
      writeFileSync(join(root, "icon.png"), "png");
      writeFileSync(join(root, "icon.ico"), "ico");
      const icons = resolveAppIcons([root], "win32");
      expect(icons.windowIconPath).toBe(join(root, "icon.ico"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
