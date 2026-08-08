/**
 * AppShot fly-in: after flash + capture, a thumbnail arcs from the source
 * app window center into the Atmos main window top-right (Appshots chrome).
 *
 * Perfect visual loop: capture → fly into Atmos → land where history/preview lives.
 */

import { mainLog } from "../main-log.js";
import {
  ensureMacDockVisible,
  setOverlayVisibleOnAllWorkspaces,
} from "../windows/mac-dock.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBrowserWindow = any;

export type Point = { x: number; y: number };

export type CaptureFlyOpts = {
  /** Global screen rect of the captured app window (logical points). */
  sourceBounds: { x: number; y: number; width: number; height: number };
  /** Global screen rect of Atmos main window (or content area). */
  destWindowBounds: { x: number; y: number; width: number; height: number };
  /** PNG as data URL or raw base64 (data: prefix optional). */
  imageDataUrl: string;
  durationMs?: number;
};

/** Keep snappy — long arcs feel laggy after dual-shift. */
export const FLY_DURATION_MS = 380;
export const FLY_CARD_WIDTH = 132;
export const FLY_CARD_HEIGHT = 86;

/** Pure: center of a rect. */
export function rectCenter(r: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Point {
  return {
    x: r.x + r.width / 2,
    y: r.y + r.height / 2,
  };
}

/**
 * Pure: destination near Atmos top-right chrome (Appshots header button).
 * Inset from the trailing edge / title bar so the card lands in the button zone.
 */
export function atmosTopRightLanding(
  mainBounds: { x: number; y: number; width: number; height: number },
  cardW = FLY_CARD_WIDTH,
  cardH = FLY_CARD_HEIGHT,
): Point {
  // Header chip sits ~right of traffic lights / trailing toolbar.
  const padRight = 52;
  const padTop = 10;
  return {
    x: mainBounds.x + mainBounds.width - padRight - cardW / 2,
    y: mainBounds.y + padTop + cardH / 2,
  };
}

/**
 * Pure: quadratic Bezier control point for a graceful arc from `from` → `to`.
 * Lifts the path upward and slightly off the straight line (always a “toss”).
 */
export function arcControlPoint(from: Point, to: Point): Point {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  // Perpendicular unit (rotate 90°) — pick the side that arcs “up” on screen
  // (smaller y in macOS global coords is higher on screen).
  let nx = -dy / dist;
  let ny = dx / dist;
  // Prefer control point above the chord (lower y).
  if (my + ny * 80 > my - ny * 80) {
    nx = -nx;
    ny = -ny;
  }
  const lift = Math.min(220, Math.max(90, dist * 0.28));
  return {
    x: mx + nx * lift * 0.35,
    y: my + ny * lift - lift * 0.55,
  };
}

/** Pure: sample quadratic Bezier at t ∈ [0,1]. */
export function quadBezier(t: number, p0: Point, p1: Point, p2: Point): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeDataUrl(image: string): string {
  const t = image.trim();
  if (t.startsWith("data:")) return t;
  return `data:image/png;base64,${t}`;
}

function flyHtml(imageDataUrl: string): string {
  const src = normalizeDataUrl(imageDataUrl).replace(/'/g, "%27");
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
  html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;pointer-events:none}
  #card{
    position:fixed; left:0; top:0;
    width:${FLY_CARD_WIDTH}px; height:${FLY_CARD_HEIGHT}px;
    margin-left:-${FLY_CARD_WIDTH / 2}px; margin-top:-${FLY_CARD_HEIGHT / 2}px;
    border-radius:12px; overflow:hidden;
    box-shadow:0 12px 40px rgba(0,0,0,0.35), 0 0 0 2px rgba(56,189,255,0.95);
    background:#0b1220;
    opacity:0;
    will-change:transform,opacity;
    transform:translate3d(-9999px,-9999px,0) scale(1);
  }
  #card img{width:100%;height:100%;object-fit:cover;display:block}
</style></head>
<body>
<div id="card"><img alt="" src="${src}"/></div>
<script>
window.__atmosFly = function(from, to, control, durationMs) {
  var card = document.getElementById('card');
  if (!card) { window.__atmosFlyDone = true; return; }
  window.__atmosFlyDone = false;
  var start = performance.now();
  function ease(t) {
    return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
  }
  function bez(t, a, b, c) {
    var u = 1 - t;
    return u*u*a + 2*u*t*b + t*t*c;
  }
  function frame(now) {
    var raw = Math.min(1, (now - start) / durationMs);
    var t = ease(raw);
    var x = bez(t, from.x, control.x, to.x);
    var y = bez(t, from.y, control.y, to.y);
    // Start larger (peek at capture), shrink into the chrome chip.
    var scale = 1.08 - 0.52 * t;
    var opacity = raw < 0.06 ? raw / 0.06 : raw > 0.9 ? (1 - raw) / 0.1 : 1;
    card.style.opacity = String(Math.max(0, Math.min(1, opacity)));
    card.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + scale + ')';
    if (raw < 1) {
      requestAnimationFrame(frame);
    } else {
      window.__atmosFlyDone = true;
    }
  }
  requestAnimationFrame(frame);
};
</script>
</body></html>`;
}

/**
 * Play the arc fly-in. Never throws — capture UX must not fail if animation does.
 */
export async function playCaptureFlyToAtmos(
  opts: CaptureFlyOpts,
): Promise<void> {
  if (process.platform !== "darwin") return;
  if (!opts.imageDataUrl || opts.imageDataUrl.length < 32) return;

  const from = rectCenter(opts.sourceBounds);
  const to = atmosTopRightLanding(opts.destWindowBounds);
  const control = arcControlPoint(from, to);
  const duration = opts.durationMs ?? FLY_DURATION_MS;

  // Cover the union of source + dest + arc control with padding.
  const pad = 200;
  const minX = Math.min(from.x, to.x, control.x) - pad;
  const minY = Math.min(from.y, to.y, control.y) - pad;
  const maxX = Math.max(from.x, to.x, control.x) + pad;
  const maxY = Math.max(from.y, to.y, control.y) + pad;
  const overlayBounds = {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.max(320, Math.round(maxX - minX)),
    height: Math.max(240, Math.round(maxY - minY)),
  };

  // Convert global points → overlay-local for the CSS animation.
  const localFrom = { x: from.x - overlayBounds.x, y: from.y - overlayBounds.y };
  const localTo = { x: to.x - overlayBounds.x, y: to.y - overlayBounds.y };
  const localControl = {
    x: control.x - overlayBounds.x,
    y: control.y - overlayBounds.y,
  };

  let win: AnyBrowserWindow | null = null;
  let allWorkspacesOn = false;
  try {
    const { BrowserWindow } = await import("electron");
    win = new BrowserWindow({
      ...overlayBounds,
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

    const html = flyHtml(opts.imageDataUrl);
    await win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
    await sleep(20);

    await setOverlayVisibleOnAllWorkspaces(win, true);
    allWorkspacesOn = true;
    win.showInactive();

    const payload = JSON.stringify({
      from: localFrom,
      to: localTo,
      control: localControl,
      duration,
    });
    await win.webContents.executeJavaScript(
      `(() => { const p = ${payload}; window.__atmosFlyDone = false; window.__atmosFly(p.from, p.to, p.control, p.duration); })()`,
      true,
    );

    // Wait for animation (poll done flag) with hard cap.
    const deadline = Date.now() + duration + 400;
    while (Date.now() < deadline) {
      if (win.isDestroyed()) break;
      try {
        const done = await win.webContents.executeJavaScript(
          `!!window.__atmosFlyDone`,
          true,
        );
        if (done) break;
      } catch {
        break;
      }
      await sleep(16);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    mainLog(`[appshot-fly] failed: ${msg}`, "error");
  } finally {
    if (win && !win.isDestroyed()) {
      try {
        if (allWorkspacesOn) {
          await setOverlayVisibleOnAllWorkspaces(win, false);
        }
      } catch {
        await ensureMacDockVisible();
      }
      try {
        win.destroy();
      } catch {
        /* ignore */
      }
    } else {
      await ensureMacDockVisible();
    }
  }
}
