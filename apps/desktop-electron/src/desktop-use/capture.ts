/**
 * Desktop Use Capture — runs in the Atmos Desktop (Electron) process so TCC
 * Screen Recording / Accessibility stay on the Atmos app identity (APP-052).
 *
 * AppShot business code must call this surface, not osascript directly.
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DesktopUseFrontmost = {
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

export type DesktopUseCaptureResult = {
  ok: boolean;
  frontmost: DesktopUseFrontmost;
  png: Buffer | null;
  warnings: string[];
  contextMarkdown: string;
  /** Desktop Use quality: window | display_fallback | metadata_only | none */
  quality: string;
  error?: string | null;
};

/**
 * Frontmost app + **largest content window** bounds.
 *
 * Do not use `first window` — for many apps (terminals, Electron, browsers) the
 * first AX window is a 0-height title strip or menu chrome (e.g. 1512×33), which
 * makes AppShot fall back to full-display capture.
 */
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
  set bestArea to 0
  try
    repeat with w in windows of p
      try
        set pos to position of w
        set sz to size of w
        set wX to item 1 of pos as integer
        set wY to item 2 of pos as integer
        set wW to item 1 of sz as integer
        set wH to item 2 of sz as integer
        if wW ≥ 64 and wH ≥ 64 then
          set area to wW * wH
          if area > bestArea then
            set bestArea to area
            set winX to wX
            set winY to wY
            set winW to wW
            set winH to wH
            set winTitle to ""
            try
              set winTitle to name of w
            end try
          end if
        end if
      end try
    end repeat
  end try
  return appName & linefeed & winTitle & linefeed & (winX as text) & "," & (winY as text) & "," & (winW as text) & "," & (winH as text) & linefeed & (pid as text)
end tell
`.trim();

/** Metadata-only frontmost read (no screenshot). */
export async function desktopUseReadFrontmost(): Promise<DesktopUseFrontmost> {
  if (process.platform !== "darwin") {
    throw new Error("Desktop capture is only supported on macOS");
  }
  const { stdout } = await execFileAsync("osascript", ["-e", FRONTMOST_SCRIPT], {
    timeout: 5_000,
    maxBuffer: 1024 * 1024,
  });
  return parseFrontmostScriptOutput(stdout);
}

/**
 * Electron in-process capture (osascript + screencapture).
 *
 * **Not** the AppShot production hot path when the control engine is installed.
 * Production dual-shift goes through `host-capture.ts` /
 * `captureFrontmostViaHostEngine` under Atmos Desktop Use.app TCC.
 * This helper is only the pre-ensure fallback (see `appshot/frontmost.ts`).
 */
export async function desktopUseCaptureInProcess(
  options: { selfAppNames?: Set<string> } = {},
): Promise<DesktopUseCaptureResult> {
  const warnings: string[] = [];
  const selfNames =
    options.selfAppNames ??
    new Set(["Atmos", "Atmos Electron", "Atmos Desktop", "Electron"]);

  let frontmost: DesktopUseFrontmost;
  try {
    frontmost = await desktopUseReadFrontmost();
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

  // Capturing Atmos itself is a valid AppShot target — no self-frontmost warning.

  const png = await captureScreenshotPng(frontmost, warnings);
  const contextMarkdown = buildAppshotContextMarkdown(frontmost, warnings);
  const quality =
    png && png.length > 0
      ? warnings.some((w) => w.includes("fell_back") || w.includes("full_display"))
        ? "display_fallback"
        : "window"
      : "metadata_only";

  return {
    ok: true,
    frontmost,
    png,
    warnings,
    contextMarkdown,
    quality,
    error: null,
  };
}

async function captureScreenshotPng(
  frontmost: DesktopUseFrontmost,
  warnings: string[],
): Promise<Buffer | null> {
  const out = join(tmpdir(), `atmos-desktop-use-${randomUUID()}.png`);
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

export function buildAppshotContextMarkdown(
  frontmost: DesktopUseFrontmost,
  warnings: string[],
): string {
  const lines = ["# Appshot Context", "", `- App: ${frontmost.appName}`];
  if (frontmost.windowTitle) lines.push(`- Window: ${frontmost.windowTitle}`);
  if (frontmost.bundleId) lines.push(`- Bundle ID: ${frontmost.bundleId}`);
  if (frontmost.processId != null) lines.push(`- Process ID: ${frontmost.processId}`);
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

export function parseFrontmostScriptOutput(stdout: string): DesktopUseFrontmost {
  const lines = stdout.replace(/\r/g, "").split("\n");
  const appName = (lines[0] ?? "Unknown App").trim() || "Unknown App";
  const windowTitle = (lines[1] ?? "").trim() || null;
  const bounds = (lines[2] ?? "").split(",").map((s) => parseInt(s.trim(), 10));
  const processId = parseInt((lines[3] ?? "").trim(), 10);
  const [x, y, width, height] = bounds;
  // Treat AppleScript sentinels (-1) and thin chrome strips as "no bounds".
  const validSize =
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= 64 &&
    height >= 64;
  return {
    appName,
    windowTitle,
    bundleId: null,
    processId: Number.isFinite(processId) ? processId : null,
    windowId: null,
    x: validSize && Number.isFinite(x) ? x : null,
    y: validSize && Number.isFinite(y) ? y : null,
    width: validSize ? width : null,
    height: validSize ? height : null,
  };
}
