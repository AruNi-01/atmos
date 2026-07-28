/**
 * Target-window capture affordance (Tauri APP-021 parity):
 * transparent always-on-top overlay with blue border pulse + camera flash,
 * closed before the real screenshot so snapshot.png does not include the frame.
 *
 * Performance notes (Electron macOS):
 * - Reuse a single BrowserWindow (creating one per capture hitches the main process).
 * - Avoid animating blurred box-shadow / scale on a near-fullscreen transparent surface.
 * - Restart CSS via executeJavaScript instead of reloading the page each time.
 *
 * Electron is loaded dynamically so pure helpers stay unit-testable under bun.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mainLog } from "../main-log.js";
import { REPO_ROOT } from "../runtime/ensure.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBrowserWindow = any;

export type CaptureAnimationBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const OVERLAY_PADDING = 14;
/** Match the CSS pulse length (+ small settle margin). */
export const OVERLAY_DURATION_MS = 520;
export const MIN_OVERLAY_EDGE = 32;

const SELF_APP_NAMES = new Set([
  "Atmos",
  "Atmos Electron",
  "Electron",
]);

/** Pure: expand target window bounds with padding for the overlay window. */
export function overlayFrameFromBounds(
  bounds: CaptureAnimationBounds,
  padding: number = OVERLAY_PADDING,
): CaptureAnimationBounds | null {
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width < MIN_OVERLAY_EDGE ||
    bounds.height < MIN_OVERLAY_EDGE
  ) {
    return null;
  }
  return {
    x: Math.round(bounds.x - padding),
    y: Math.round(bounds.y - padding),
    width: Math.round(bounds.width + padding * 2),
    height: Math.round(bounds.height + padding * 2),
  };
}

export function shouldPlayCaptureAnimation(opts: {
  appName: string;
  bounds: CaptureAnimationBounds | null | undefined;
  selfAppNames?: Set<string>;
}): boolean {
  if (!opts.bounds) return false;
  if (overlayFrameFromBounds(opts.bounds) == null) return false;
  const self = opts.selfAppNames ?? SELF_APP_NAMES;
  if (self.has(opts.appName)) return false;
  return true;
}

/** Kept in sync with apps/web/public/appshot-capture-overlay.html */
const FALLBACK_OVERLAY_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body {
        width: 100%; height: 100%; margin: 0; overflow: hidden;
        background: transparent; pointer-events: none;
      }
      .frame {
        position: fixed; inset: 12px;
        border: 3px solid rgba(66, 153, 255, 0.98);
        border-radius: 14px;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.4);
        opacity: 0;
        transform: translateZ(0);
        will-change: opacity;
      }
      .flash {
        position: fixed; inset: 0;
        background: rgba(255, 255, 255, 0.55);
        opacity: 0;
        transform: translateZ(0);
        will-change: opacity;
      }
      body.run .frame {
        animation: appshot-border-pulse 480ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }
      body.run .flash {
        animation: appshot-camera-flash 360ms cubic-bezier(0.2, 0.8, 0.2, 1) 80ms both;
      }
      @keyframes appshot-border-pulse {
        0% { opacity: 0; }
        22% { opacity: 1; }
        100% { opacity: 0; }
      }
      @keyframes appshot-camera-flash {
        0% { opacity: 0; }
        18% { opacity: 0.55; }
        100% { opacity: 0; }
      }
    </style>
  </head>
  <body>
    <div class="frame"></div>
    <div class="flash"></div>
    <script>
      window.__atmosAppshotPlay = function () {
        document.body.classList.remove("run");
        void document.body.offsetWidth;
        document.body.classList.add("run");
      };
    </script>
  </body>
</html>`;

function resolveOverlayHtmlPath(): string | null {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(REPO_ROOT, "apps/web/public/appshot-capture-overlay.html"),
    join(REPO_ROOT, "apps/web/out/appshot-capture-overlay.html"),
    join(
      REPO_ROOT,
      "apps/desktop-electron/resources/runtime/current/web/appshot-capture-overlay.html",
    ),
    join(process.resourcesPath ?? "", "runtime/current/web/appshot-capture-overlay.html"),
    join(__dirname, "../../resources/runtime/current/web/appshot-capture-overlay.html"),
  ];
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

function overlayLoadUrl(): string {
  const filePath = resolveOverlayHtmlPath();
  if (filePath) {
    return pathToFileURL(filePath).href;
  }
  return `data:text/html;charset=utf-8,${encodeURIComponent(FALLBACK_OVERLAY_HTML)}`;
}

let sharedOverlay: AnyBrowserWindow | null = null;
let sharedOverlayReady: Promise<AnyBrowserWindow> | null = null;
let playGeneration = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function destroySharedOverlay(): void {
  if (sharedOverlay && !sharedOverlay.isDestroyed()) {
    try {
      sharedOverlay.destroy();
    } catch {
      /* ignore */
    }
  }
  sharedOverlay = null;
  sharedOverlayReady = null;
}

async function ensureSharedOverlay(): Promise<AnyBrowserWindow> {
  if (sharedOverlay && !sharedOverlay.isDestroyed()) {
    return sharedOverlay;
  }
  if (sharedOverlayReady) {
    return sharedOverlayReady;
  }

  sharedOverlayReady = (async () => {
    const { BrowserWindow } = await import("electron");
    const win = new BrowserWindow({
      // Off-screen placeholder; real bounds applied on each play.
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      // panel avoids activating Atmos / stealing frontmost from the target app
      type: "panel",
      backgroundColor: "#00000000",
      paintWhenInitiallyHidden: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });

    win.setIgnoreMouseEvents(true, { forward: true });
    win.setAlwaysOnTop(true, "screen-saver");
    try {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch {
      /* older Electron */
    }

    win.on("closed", () => {
      if (sharedOverlay === win) {
        sharedOverlay = null;
        sharedOverlayReady = null;
      }
    });

    const url = overlayLoadUrl();
    await win.loadURL(url);
    // Wait one tick so first-paint styles settle before we show.
    await sleep(16);

    if (win.isDestroyed()) {
      throw new Error("capture overlay destroyed during load");
    }

    sharedOverlay = win;
    return win;
  })().catch((error) => {
    sharedOverlayReady = null;
    throw error;
  });

  return sharedOverlayReady;
}

/**
 * Pre-create the overlay renderer so the first capture does not hitch on window spawn.
 * Safe to call during app ready / first Appshot status poll.
 */
export function warmCaptureAnimationOverlay(): void {
  if (process.platform !== "darwin") return;
  void ensureSharedOverlay().catch((error) => {
    const msg = error instanceof Error ? error.message : String(error);
    mainLog(`[appshot-capture] overlay warm failed: ${msg}`, "error");
  });
}

/**
 * Show the blue border + flash over the target window, wait, then hide.
 * Never throws — capture must proceed even if the affordance fails.
 */
export async function playCaptureAnimation(
  bounds: CaptureAnimationBounds,
): Promise<void> {
  if (process.platform !== "darwin") return;

  const frame = overlayFrameFromBounds(bounds);
  if (!frame) return;

  const gen = ++playGeneration;

  try {
    const win = await ensureSharedOverlay();
    if (gen !== playGeneration || win.isDestroyed()) return;

    // Hide first so setBounds does not animate a visible jump across monitors.
    if (win.isVisible()) {
      win.hide();
    }

    win.setBounds({
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    });

    // Restart CSS animations without reloading (reload re-spawns the renderer).
    try {
      await win.webContents.executeJavaScript(
        `typeof window.__atmosAppshotPlay === "function" && window.__atmosAppshotPlay()`,
        true,
      );
    } catch {
      /* page may still be loading once; ignore */
    }

    if (gen !== playGeneration || win.isDestroyed()) return;

    win.showInactive();

    mainLog(
      `[appshot-capture] animation overlay ${frame.width}x${frame.height} @ ${frame.x},${frame.y}`,
    );

    await sleep(OVERLAY_DURATION_MS);

    if (gen !== playGeneration || win.isDestroyed()) return;
    win.hide();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    mainLog(`[appshot-capture] animation overlay failed: ${msg}`, "error");
    destroySharedOverlay();
  }
}
