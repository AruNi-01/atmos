/**
 * AppShot frontmost capture adapter — production path uses Desktop Use Capture
 * in-process (APP-052). This module must not shell osascript/screencapture.
 */

import {
  buildAppshotContextMarkdown,
  desktopUseCaptureInProcess,
  desktopUseReadFrontmost,
  parseFrontmostScriptOutput as parseDu,
  type DesktopUseFrontmost,
} from "../desktop-use/capture.js";

export type FrontmostWindow = DesktopUseFrontmost;

export type FrontmostCaptureResult = {
  frontmost: FrontmostWindow;
  png: Buffer | null;
  warnings: string[];
  contextMarkdown: string;
  quality: string;
};

const SELF_APP_NAMES = new Set([
  "Atmos",
  "Atmos Electron",
  "Atmos Desktop",
  "Electron",
]);

/** Metadata-only (for animation bounds) — no screenshot. */
export async function readFrontmostWindow(): Promise<FrontmostWindow> {
  return desktopUseReadFrontmost();
}

/** Single full capture via Desktop Use (one screenshot). */
export async function captureFrontmostWindow(
  options: { selfAppNames?: Set<string> } = {},
): Promise<FrontmostCaptureResult> {
  const result = await desktopUseCaptureInProcess({
    selfAppNames: options.selfAppNames ?? SELF_APP_NAMES,
  });
  const quality =
    result.png && result.png.length > 0
      ? result.quality === "display_fallback"
        ? "screenshot_only"
        : "screenshot_only"
      : "metadata_only";
  return {
    frontmost: result.frontmost,
    png: result.png,
    warnings: result.warnings,
    contextMarkdown: result.contextMarkdown,
    quality,
  };
}

export function buildContextMarkdown(
  frontmost: FrontmostWindow,
  warnings: string[],
): string {
  return buildAppshotContextMarkdown(frontmost, warnings);
}

/** Pure helper for tests — build FrontmostWindow from script stdout. */
export function parseFrontmostScriptOutput(stdout: string): FrontmostWindow {
  return parseDu(stdout);
}
