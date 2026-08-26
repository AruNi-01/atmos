import { describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const requireCjs = createRequire(import.meta.url);
const slim = requireCjs("./slim-electron-runtime.cjs") as {
  KEPT_LOCALE_TAGS: readonly string[];
  normalizeLocaleTag: (raw: string) => string;
  shouldKeepLocaleFile: (filename: string) => boolean;
  slimPackagedElectronApp: (
    appOutDir: string,
    platform: string,
  ) => {
    locales: { kept: string[]; removed: string[]; removedBytes: number };
    swiftshader: { removed: string[]; removedBytes: number };
  };
  verifySlimPackagedApp: (
    appOutDir: string,
    platform: string,
  ) => { ok: boolean; problems: string[] };
};

function touch(path: string, bytes = 8) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.alloc(bytes, 1));
}

function macFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "atmos-slim-mac-"));
  const app = join(root, "Atmos.app");
  const fwRes = join(
    app,
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Resources",
  );
  const fwLib = join(
    app,
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries",
  );
  const appRes = join(app, "Contents/Resources");
  for (const loc of [
    "en.lproj",
    "en_FEMININE.lproj",
    "en_MASCULINE.lproj",
    "en_NEUTER.lproj",
    "en_GB.lproj",
    "en_GB_FEMININE.lproj",
    "ja.lproj",
    "zh_CN.lproj",
    "zh_CN_MASCULINE.lproj",
    "zh_TW.lproj",
    "de.lproj",
  ]) {
    touch(join(fwRes, loc, "locale.pak"), loc.startsWith("ja") ? 2048 : 64);
  }
  // Must not be treated as a locale pak.
  touch(join(fwRes, "resources.pak"), 128);
  touch(join(fwLib, "libvk_swiftshader.dylib"), 256);
  touch(join(fwLib, "vk_swiftshader_icd.json"), 16);
  mkdirSync(join(appRes, "ja.lproj"), { recursive: true });
  mkdirSync(join(appRes, "en.lproj"), { recursive: true });
  mkdirSync(join(appRes, "zh_CN.lproj"), { recursive: true });
  mkdirSync(join(appRes, "zh_TW.lproj"), { recursive: true });
  return root;
}

describe("slim-electron-runtime locale matching", () => {
  it("normalizes Chromium gender variants onto the base tag", () => {
    expect(slim.normalizeLocaleTag("en_FEMININE")).toBe("en");
    expect(slim.normalizeLocaleTag("zh_CN_MASCULINE")).toBe("zh-cn");
    expect(slim.normalizeLocaleTag("zh-TW_NEUTER")).toBe("zh-tw");
    expect(slim.normalizeLocaleTag("en-US")).toBe("en-us");
    expect(slim.normalizeLocaleTag("en_GB_FEMININE")).toBe("en-gb");
  });

  it("keeps en + zh-CN + zh-TW (and gender / Windows aliases)", () => {
    const keep = [
      "en.lproj",
      "en_FEMININE.lproj",
      "en_MASCULINE.lproj",
      "en_NEUTER.lproj",
      "zh_CN.lproj",
      "zh_CN_FEMININE.lproj",
      "zh_TW.lproj",
      "zh_TW_NEUTER.lproj",
      "en-US.pak",
      "zh-CN.pak",
      "zh-TW.pak",
    ];
    for (const name of keep) {
      expect(slim.shouldKeepLocaleFile(name)).toBe(true);
    }
  });

  it("drops other Chromium locales including en-GB", () => {
    const drop = [
      "ja.lproj",
      "de.lproj",
      "en_GB.lproj",
      "en_GB_FEMININE.lproj",
      "zh.lproj",
      "fr.pak",
      "ja.pak",
      "en-GB.pak",
    ];
    for (const name of drop) {
      expect(slim.shouldKeepLocaleFile(name)).toBe(false);
    }
  });
});

describe("slimPackagedElectronApp", () => {
  it("strips extra macOS .lproj folders and SwiftShader, keeps en/zh", () => {
    const appOutDir = macFixture();
    const result = slim.slimPackagedElectronApp(appOutDir, "darwin");
    expect(result.locales.kept).toContain("en.lproj");
    expect(result.locales.kept).toContain("zh_CN.lproj");
    expect(result.locales.kept).toContain("zh_TW.lproj");
    expect(result.locales.kept).toContain("en_FEMININE.lproj");
    expect(result.locales.removed).toContain("ja.lproj");
    expect(result.locales.removed).toContain("en_GB.lproj");
    expect(result.locales.removed).toContain("de.lproj");
    expect(result.swiftshader.removed.length).toBe(2);

    const fwRes = join(
      appOutDir,
      "Atmos.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources",
    );
    const fwLib = join(
      appOutDir,
      "Atmos.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries",
    );
    expect(existsSync(join(fwRes, "en.lproj/locale.pak"))).toBe(true);
    expect(existsSync(join(fwRes, "zh_CN.lproj/locale.pak"))).toBe(true);
    expect(existsSync(join(fwRes, "zh_TW.lproj/locale.pak"))).toBe(true);
    expect(existsSync(join(fwRes, "en_FEMININE.lproj/locale.pak"))).toBe(true);
    expect(existsSync(join(fwRes, "ja.lproj"))).toBe(false);
    expect(existsSync(join(fwRes, "en_GB.lproj"))).toBe(false);
    expect(existsSync(join(fwRes, "resources.pak"))).toBe(true);
    expect(existsSync(join(fwLib, "libvk_swiftshader.dylib"))).toBe(false);
    expect(existsSync(join(fwLib, "vk_swiftshader_icd.json"))).toBe(false);
    expect(
      existsSync(join(appOutDir, "Atmos.app/Contents/Resources/ja.lproj")),
    ).toBe(false);
    expect(slim.verifySlimPackagedApp(appOutDir, "darwin").ok).toBe(true);
  });

  it("strips Windows locales/*.pak and vk_swiftshader.dll", () => {
    const root = mkdtempSync(join(tmpdir(), "atmos-slim-win-"));
    const locales = join(root, "locales");
    for (const name of ["en-US.pak", "zh-CN.pak", "zh-TW.pak", "ja.pak", "de.pak"]) {
      touch(join(locales, name), 32);
    }
    touch(join(root, "vk_swiftshader.dll"), 64);
    touch(join(root, "vk_swiftshader_icd.json"), 8);

    const result = slim.slimPackagedElectronApp(root, "win32");
    expect(result.locales.kept.sort()).toEqual([
      "en-US.pak",
      "zh-CN.pak",
      "zh-TW.pak",
    ]);
    expect(result.locales.removed.sort()).toEqual(["de.pak", "ja.pak"]);
    expect(existsSync(join(locales, "en-US.pak"))).toBe(true);
    expect(existsSync(join(locales, "ja.pak"))).toBe(false);
    expect(existsSync(join(root, "vk_swiftshader.dll"))).toBe(false);
    expect(slim.verifySlimPackagedApp(root, "win32").ok).toBe(true);
  });

  it("strips Linux libvk_swiftshader.so", () => {
    const root = mkdtempSync(join(tmpdir(), "atmos-slim-linux-"));
    touch(join(root, "locales/en-US.pak"), 32);
    touch(join(root, "locales/zh-CN.pak"), 32);
    touch(join(root, "locales/zh-TW.pak"), 32);
    touch(join(root, "locales/fr.pak"), 32);
    touch(join(root, "libvk_swiftshader.so"), 96);
    touch(join(root, "vk_swiftshader_icd.json"), 8);

    slim.slimPackagedElectronApp(root, "linux");
    expect(existsSync(join(root, "locales/fr.pak"))).toBe(false);
    expect(existsSync(join(root, "libvk_swiftshader.so"))).toBe(false);
    expect(slim.verifySlimPackagedApp(root, "linux").ok).toBe(true);
  });

  it("refuses to delete every locale when the keep-set is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "atmos-slim-empty-"));
    const locales = join(root, "locales");
    touch(join(locales, "ja.pak"), 32);
    expect(() => slim.slimPackagedElectronApp(root, "linux")).toThrow(
      /refusing to delete locales/,
    );
    expect(existsSync(join(locales, "ja.pak"))).toBe(true);
  });
});
