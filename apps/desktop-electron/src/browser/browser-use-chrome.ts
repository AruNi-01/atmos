/**
 * Embedded Browser Use chrome helpers (Desktop Use highlight + cursor).
 * Kept out of the HTTP control plane so guest automation routing stays navigable.
 */

import { spawn } from "node:child_process";
import {
  DESKTOP_USE_MANIFEST_ENV,
  isAtmosCliInstalled,
  resolveAtmosCliPath,
  resolveDesktopUseManifestPath,
} from "../desktop-use/client.js";

/** Session id shared with Rust browser-use chrome (Desktop Use cursor palette). */
const BROWSER_USE_CHROME_SESSION = "atmos-browser-use";

/**
 * Map guest-local element rect → approximate screen (logical) coords using the
 * host BrowserWindow content origin. Best-effort: webview offset inside the
 * page is not measured (may be slightly off; click path stays CDP/DOM).
 */
export function mapGuestRectToScreen(
  hostContent: { x: number; y: number; width: number; height: number },
  rect: { x: number; y: number; width: number; height: number },
): {
  cursor: { x: number; y: number };
  bounds: { x: number; y: number; width: number; height: number };
} {
  const x = hostContent.x + rect.x;
  const y = hostContent.y + rect.y;
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  return {
    cursor: { x: x + width / 2, y: y + height / 2 },
    bounds: { x, y, width, height },
  };
}

/**
 * Spawn detached without risking Electron main uncaughtException on ENOENT
 * (missing ~/.atmos/bin/atmos). Mirrors control-plane listen hardening.
 */
function spawnDetachedQuiet(command: string, args: string[]): void {
  try {
    const env = { ...process.env };
    const manifest = resolveDesktopUseManifestPath();
    if (manifest) env[DESKTOP_USE_MANIFEST_ENV] = manifest;
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      env,
    });
    child.on("error", (err) => {
      // Missing binary, EACCES, etc. — never crash the main process.
      console.warn(
        `[browser-use] chrome spawn failed cmd=${command}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    child.unref();
  } catch (err) {
    console.warn(
      `[browser-use] chrome spawn threw cmd=${command}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Fire-and-forget Desktop Use chrome (operation border + agent cursor).
 * Reuses `atmos desktop-use drive highlight|move` — same overlay stack as Desktop Use.
 * Never throws; missing canonical CLI only logs a warning (does not crash main).
 */
export function showEmbeddedBrowserChrome(opts: {
  status: string;
  cursor: { x: number; y: number };
  bounds: { x: number; y: number; width: number; height: number };
  session?: string;
}): void {
  // Sole runner: ~/.atmos/bin/atmos (ADR-005). Never App-bundled or PATH.
  if (!isAtmosCliInstalled()) {
    // Log only — never surface install paths in product UI.
    console.warn("[browser-use] chrome skipped: Atmos CLI not installed");
    return;
  }
  const atmos = resolveAtmosCliPath();
  const session = opts.session?.trim() || BROWSER_USE_CHROME_SESSION;
  const b = opts.bounds;
  const c = opts.cursor;
  // Border around the element (or host content when bounds are large).
  spawnDetachedQuiet(atmos, [
    "desktop-use",
    "--json",
    "drive",
    "highlight",
    "--mode",
    "window",
    "--x",
    String(Math.round(b.x)),
    "--y",
    String(Math.round(b.y)),
    "--width",
    String(Math.round(b.width)),
    "--height",
    String(Math.round(b.height)),
    "--status",
    opts.status,
  ]);
  // Agent cursor overlay (not OS pointer steal).
  spawnDetachedQuiet(atmos, [
    "desktop-use",
    "--json",
    "drive",
    "move",
    "--x",
    String(Math.round(c.x)),
    "--y",
    String(Math.round(c.y)),
    "--coord-space",
    "points",
    "--session",
    session,
  ]);
}
