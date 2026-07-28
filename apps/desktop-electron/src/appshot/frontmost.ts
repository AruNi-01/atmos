/**
 * macOS frontmost window capture (non-interactive).
 * Uses System Events for identity/bounds + screencapture -R / full display.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);

export type FrontmostWindow = {
  appName: string;
  windowTitle: string | null;
  bundleId: string | null;
  processId: number | null;
  windowId: string | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
};

export type FrontmostCaptureResult = {
  frontmost: FrontmostWindow;
  png: Buffer | null;
  warnings: string[];
  contextMarkdown: string;
  quality: string;
};

const SELF_APP_NAMES = new Set([
  "Atmos",
  "Atmos Electron", // legacy product name from older dogfood builds
  "Electron",
]);

const FRONTMOST_SCRIPT = `
tell application "System Events"
  set p to first application process whose frontmost is true
  set appName to name of p
  set winTitle to ""
  set winX to -1
  set winY to -1
  set winW to -1
  set winH to -1
  set pid to unix id of p
  try
    set w to first window of p
    set winTitle to name of w
    set pos to position of w
    set sz to size of w
    set winX to item 1 of pos as integer
    set winY to item 2 of pos as integer
    set winW to item 1 of sz as integer
    set winH to item 2 of sz as integer
  end try
  return appName & linefeed & winTitle & linefeed & (winX as text) & "," & (winY as text) & "," & (winW as text) & "," & (winH as text) & linefeed & (pid as text)
end tell
`.trim();

export async function readFrontmostWindow(): Promise<FrontmostWindow> {
  if (process.platform !== "darwin") {
    throw new Error("frontmost capture is only supported on macOS");
  }
  const { stdout } = await execFileAsync("osascript", ["-e", FRONTMOST_SCRIPT], {
    timeout: 5_000,
    maxBuffer: 1024 * 1024,
  });
  const lines = stdout.replace(/\r/g, "").split("\n");
  const appName = (lines[0] ?? "Unknown App").trim() || "Unknown App";
  const windowTitle = (lines[1] ?? "").trim() || null;
  const bounds = (lines[2] ?? "").split(",").map((s) => parseInt(s.trim(), 10));
  const processId = parseInt((lines[3] ?? "").trim(), 10);
  const [x, y, width, height] = bounds;
  return {
    appName,
    windowTitle,
    bundleId: null,
    processId: Number.isFinite(processId) ? processId : null,
    windowId: null,
    x: Number.isFinite(x) && x >= 0 ? x : null,
    y: Number.isFinite(y) && y >= 0 ? y : null,
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
  };
}

/**
 * Non-interactive screenshot of the frontmost window (or full display fallback).
 * Does not use screencapture -i (region drag).
 */
export async function captureFrontmostWindow(
  options: { selfAppNames?: Set<string> } = {},
): Promise<FrontmostCaptureResult> {
  const warnings: string[] = [];
  const selfNames = options.selfAppNames ?? SELF_APP_NAMES;
  let frontmost: FrontmostWindow;
  try {
    frontmost = await readFrontmostWindow();
  } catch (e) {
    frontmost = {
      appName: "Unknown App",
      windowTitle: null,
      bundleId: null,
      processId: null,
      windowId: null,
      x: null,
      y: null,
      width: null,
      height: null,
    };
    warnings.push(
      `frontmost_identity_failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (selfNames.has(frontmost.appName)) {
    warnings.push(
      `${frontmost.appName} is frontmost; focus another app and trigger Appshots again.`,
    );
  }

  const png = await captureScreenshotPng(frontmost, warnings);
  const contextMarkdown = buildContextMarkdown(frontmost, warnings);
  const quality =
    png && png.length > 0
      ? "screenshot_only"
      : "metadata_only";

  return {
    frontmost,
    png,
    warnings,
    contextMarkdown,
    quality,
  };
}

async function captureScreenshotPng(
  frontmost: FrontmostWindow,
  warnings: string[],
): Promise<Buffer | null> {
  const out = join(tmpdir(), `atmos-appshot-${randomUUID()}.png`);
  try {
    const hasBounds =
      frontmost.x != null &&
      frontmost.y != null &&
      frontmost.width != null &&
      frontmost.height != null &&
      frontmost.width >= 32 &&
      frontmost.height >= 32;

    if (hasBounds) {
      const rect = `${frontmost.x},${frontmost.y},${frontmost.width},${frontmost.height}`;
      try {
        await execFileAsync("screencapture", ["-x", "-R", rect, out], {
          timeout: 8_000,
        });
      } catch (e) {
        warnings.push(
          `window_region_capture_failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        await execFileAsync("screencapture", ["-x", out], { timeout: 8_000 });
        warnings.push("fell_back_to_full_display_capture");
      }
    } else {
      warnings.push(
        "Unable to determine the focused window bounds; capturing full display.",
      );
      await execFileAsync("screencapture", ["-x", out], { timeout: 8_000 });
    }

    if (!existsSync(out)) {
      warnings.push("screencapture produced no file");
      return null;
    }
    const buf = readFileSync(out);
    return buf.length > 0 ? buf : null;
  } catch (e) {
    warnings.push(
      `screencapture failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  } finally {
    try {
      if (existsSync(out)) unlinkSync(out);
    } catch {
      /* ignore */
    }
  }
}

export function buildContextMarkdown(
  frontmost: FrontmostWindow,
  warnings: string[],
): string {
  const lines = [
    "# Appshot Context",
    "",
    `- App: ${frontmost.appName}`,
  ];
  if (frontmost.windowTitle) {
    lines.push(`- Window: ${frontmost.windowTitle}`);
  }
  if (frontmost.bundleId) {
    lines.push(`- Bundle ID: ${frontmost.bundleId}`);
  }
  if (frontmost.processId != null) {
    lines.push(`- Process ID: ${frontmost.processId}`);
  }
  if (
    frontmost.x != null &&
    frontmost.y != null &&
    frontmost.width != null &&
    frontmost.height != null
  ) {
    lines.push(
      `- Bounds: ${frontmost.x},${frontmost.y} ${frontmost.width}×${frontmost.height}`,
    );
  }
  if (warnings.length) {
    lines.push("", "## Warnings");
    for (const w of warnings) lines.push(`- ${w}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** Pure helper for tests — build FrontmostWindow from script stdout. */
export function parseFrontmostScriptOutput(stdout: string): FrontmostWindow {
  const lines = stdout.replace(/\r/g, "").split("\n");
  const appName = (lines[0] ?? "Unknown App").trim() || "Unknown App";
  const windowTitle = (lines[1] ?? "").trim() || null;
  const bounds = (lines[2] ?? "").split(",").map((s) => parseInt(s.trim(), 10));
  const processId = parseInt((lines[3] ?? "").trim(), 10);
  const [x, y, width, height] = bounds;
  return {
    appName,
    windowTitle,
    bundleId: null,
    processId: Number.isFinite(processId) ? processId : null,
    windowId: null,
    x: Number.isFinite(x) && x >= 0 ? x : null,
    y: Number.isFinite(y) && y >= 0 ? y : null,
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
  };
}
