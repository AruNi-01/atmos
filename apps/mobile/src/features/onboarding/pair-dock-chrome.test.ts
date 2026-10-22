// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import type { CameraScannerModel } from "./camera-permission-state";
import {
  cameraPreviewIsLive,
  pairScannerDockUsesThemeGlass,
  type PairScannerCameraKind,
} from "./pair-dock-chrome";

const here = dirname(fileURLToPath(import.meta.url));

/** Glass while the scanner is open in light theme, inverted once the feed is live. */
const GLASS_BY_KIND = {
  error: true,
  loading: true,
  preview: false,
  prompt: true,
  settings: true,
  starting: true,
} as const satisfies Record<CameraScannerModel["kind"], boolean>;

describe("pairScannerDockUsesThemeGlass", () => {
  test("uses glass for every light-theme scanner state that is not a live preview", () => {
    for (const [cameraKind, usesGlass] of Object.entries(GLASS_BY_KIND)) {
      expect(
        pairScannerDockUsesThemeGlass({
          cameraKind: cameraKind as CameraScannerModel["kind"],
          isDark: false,
          scannerOpen: true,
        }),
      ).toBe(usesGlass);
    }
    expect(
      pairScannerDockUsesThemeGlass({
        cameraKind: null,
        isDark: false,
        scannerOpen: true,
      }),
    ).toBe(true);
  });

  test("keeps the inverted dock in dark theme and while the scanner is closed", () => {
    const kinds: PairScannerCameraKind[] = [
      null,
      ...(Object.keys(GLASS_BY_KIND) as CameraScannerModel["kind"][]),
    ];
    for (const cameraKind of kinds) {
      expect(
        pairScannerDockUsesThemeGlass({
          cameraKind,
          isDark: true,
          scannerOpen: true,
        }),
      ).toBe(false);
      expect(
        pairScannerDockUsesThemeGlass({
          cameraKind,
          isDark: false,
          scannerOpen: false,
        }),
      ).toBe(false);
    }
  });

  test("treats only the preview kind as a live camera feed", () => {
    expect(cameraPreviewIsLive("preview")).toBe(true);
    expect(cameraPreviewIsLive(null)).toBe(false);
    for (const kind of Object.keys(GLASS_BY_KIND)) {
      expect(cameraPreviewIsLive(kind as CameraScannerModel["kind"])).toBe(kind === "preview");
    }
  });
});

describe("pair dock wiring", () => {
  test("the light non-preview dock is GlassPanel fed by theme tokens", () => {
    const source = readFileSync(join(here, "AuthConnectContent.tsx"), "utf8");
    const choiceStart = source.indexOf("const themeGlass");
    const choice = source.slice(choiceStart, source.indexOf("return (", choiceStart));
    const glassArms = [...choice.matchAll(/themeGlass \? ([^:\n]+) :/g)].map((match) => match[1]);
    expect(glassArms.length).toBeGreaterThan(0);
    for (const arm of glassArms) {
      expect(arm).toContain("theme.colors.");
      expect(arm).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }

    const glassPanel = source.slice(source.indexOf("<GlassPanel"), source.indexOf("</GlassPanel>"));
    expect(glassPanel).toContain("theme.colors.glassFallbackStrong");
    expect(glassPanel).toContain("theme.colors.glassTint");
    expect(glassPanel).toContain("theme.colors.glassBorder");
    expect(glassPanel).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(source).toContain("backgroundColor: dockColor");
    expect(source).toContain("DOCK_LIGHT");
  });

  test("the scanner reports its kind so the dock can follow the feed", () => {
    const source = readFileSync(join(here, "PairQrScanner.tsx"), "utf8");
    expect(source).toContain("onScannerKindChange?.(model.kind)");
    expect(source).toContain("onScannerKindChange?.(null)");
  });
});
