/**
 * AppShot frontmost capture adapter — uses Desktop Use Capture + Inspect (APP-052).
 * This module must not shell osascript/screencapture/AX directly.
 */

import {
  buildAppshotContextMarkdown,
  desktopUseCaptureInProcess,
  desktopUseReadFrontmost,
  parseFrontmostScriptOutput as parseDu,
  type DesktopUseFrontmost,
} from "../desktop-use/capture.js";
import {
  composeAppshotContext,
  desktopUseInspect,
} from "../desktop-use/inspect.js";

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

/** Metadata-only (for animation bounds) — no screenshot / no inspect. */
export async function readFrontmostWindow(): Promise<FrontmostWindow> {
  return desktopUseReadFrontmost();
}

/**
 * Full AppShot capture:
 * 1) Capture screenshot (Desktop Use Capture)
 * 2) Inspect UI tree (Desktop Use Inspect) — primary agent text for context.md
 */
export async function captureFrontmostWindow(
  options: { selfAppNames?: Set<string> } = {},
): Promise<FrontmostCaptureResult> {
  const selfNames = options.selfAppNames ?? SELF_APP_NAMES;
  const capture = await desktopUseCaptureInProcess({ selfAppNames: selfNames });
  const frontmost = capture.frontmost;
  const warnings = [...capture.warnings];
  const hasPng = Boolean(capture.png && capture.png.length > 0);

  let inspectResult = {
    ok: false,
    treeMarkdown: "",
    nodeCountEstimate: 0,
    quality: "unavailable",
    warnings: [] as string[],
    error: null as string | null,
  };

  if (frontmost.processId != null && frontmost.processId > 0) {
    inspectResult = await desktopUseInspect({
      processId: frontmost.processId,
      appName: frontmost.appName,
    });
  } else {
    warnings.push("inspect_skipped: missing process id");
  }

  const composed = composeAppshotContext(frontmost, inspectResult, warnings);
  const hasTree = Boolean(inspectResult.treeMarkdown.trim()) && inspectResult.ok;

  let quality: string;
  if (hasPng && hasTree) quality = "screenshot_and_accessibility";
  else if (hasPng) quality = "screenshot_only";
  else if (hasTree) quality = "accessibility_only";
  else quality = "metadata_only";

  // Rebuild context with final quality label
  const contextMarkdown = composed.contextMarkdown.replace(
    /^- Quality: .+$/m,
    `- Quality: ${quality}`,
  );

  return {
    frontmost,
    png: capture.png,
    warnings: composed.warnings,
    contextMarkdown,
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
