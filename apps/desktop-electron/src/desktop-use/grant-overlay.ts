/**
 * Permission grant overlay (desktop shell).
 *
 * Opens after System Settings → Accessibility / Screen Recording. UI mirrors
 * the common “drag host app into the list above” pattern: floating card
 * **inside** the System Settings window, blue up-arrow instruction, and a
 * draggable app row (icon + name).
 *
 * Drag uses Electron `webContents.startDrag` from a **dragstart** handler
 * (mousedown + async IPC does not start a macOS file drag). The drag ghost
 * is a pre-rendered PNG of the full chip (icon + label container).
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { BrowserWindow, ipcMain, nativeImage, screen } from "electron";
import { getResolvedAppIcons } from "../branding.js";

const execFileAsync = promisify(execFile);

export type GrantOverlayPurpose = "accessibility" | "screen_recording";

export type GrantOverlayOptions = {
  hostAppPath: string;
  hostAppName?: string;
  /** BCP-47-ish language tag; used for in-panel copy. */
  locale?: string;
  /** Which Settings pane was opened (affects instruction copy). */
  purpose?: GrantOverlayPurpose;
  /**
   * Screen-point origin for the fly animation (typically the Grant button
   * center, converted from the host BrowserWindow content bounds).
   */
  sourceOrigin?: { x: number; y: number };
};

type GrantState = {
  hostAppPath: string;
  hostAppName: string;
  instruction: string;
  chipLabel: string;
  /** data:image/... URL for the chip icon, or empty for CSS fallback. */
  iconDataUrl: string;
  /**
   * Pre-rendered full-chip PNG for startDrag ghost (set from renderer after paint).
   * Falls back to app icon only when missing.
   */
  dragPreviewDataUrl: string | null;
};

let grantWindow: BrowserWindow | null = null;
let grantState: GrantState | null = null;
let ipcWired = false;
/** Soft follow of System Settings — async only, never blocks the main process. */
let positionPoll: ReturnType<typeof setInterval> | null = null;
let positionInFlight = false;
let lastPlaced: { x: number; y: number } | null = null;
/** Cached Settings bounds so we do not thrash osascript. */
let cachedSettingsBounds: { rect: Rect; at: number } | null = null;
/** In-flight fly animation frame handle. */
let flyAnimTimer: ReturnType<typeof setTimeout> | null = null;
let flyAnimActive = false;
/** Monotonic token so a reopened overlay cancels the previous fly IIFE. */
let flyGeneration = 0;
/** Optional fly start (Grant button screen coords) for the next open. */
let pendingSourceOrigin: { x: number; y: number } | null = null;

/** Panel outer size (matches reference card proportions). */
const PANEL_WIDTH = 460;
const PANEL_HEIGHT = 128;
/** How long to reuse the last System Settings bounds (ms). */
const SETTINGS_BOUNDS_TTL_MS = 400;
/** Only move the overlay when it drifts by more than this many points. */
const POSITION_MOVE_EPSILON = 4;
/**
 * Fly duration from Atmos Settings → System Settings target.
 * Runs after we have (or timed out on) Settings bounds.
 */
const FLY_DURATION_MS = 560;
const FLY_FRAME_MS = 16;
/** Wait for System Settings window bounds before choosing the fly target. */
const BOUNDS_WAIT_MS = 1400;
const BOUNDS_POLL_MS = 120;
/** After landing, keep re-snapping until we get real bounds (or give up). */
const LANDING_RESNAP_MS = 2800;
const LANDING_RESNAP_EVERY_MS = 280;

function grantPreloadPath(): string {
  const besideMain = join(
    dirname(fileURLToPath(import.meta.url)),
    "grant-preload.cjs",
  );
  if (existsSync(besideMain)) return besideMain;
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "dist",
    "grant-preload.cjs",
  );
}

function isZh(locale: string | undefined): boolean {
  return (locale ?? "").toLowerCase().startsWith("zh");
}

function buildInstruction(
  hostAppName: string,
  purpose: GrantOverlayPurpose,
  locale?: string,
): string {
  if (isZh(locale)) {
    // Match macOS System Settings Chinese labels: 无障碍 / 屏幕录制.
    const goal =
      purpose === "screen_recording" ? "允许屏幕录制" : "允许无障碍";
    return `将「${hostAppName}」拖到上方列表以${goal}`;
  }
  const goal =
    purpose === "screen_recording"
      ? "to allow Screen Recording"
      : "to allow Accessibility";
  return `Drag ${hostAppName} to the list above ${goal}`;
}

function iconRoots(): string[] {
  const roots: string[] = [];
  const resourcesPath =
    typeof process.resourcesPath === "string" ? process.resourcesPath : "";
  const here = dirname(fileURLToPath(import.meta.url));
  if (resourcesPath) {
    roots.push(join(resourcesPath, "icons"));
  }
  roots.push(join(here, "..", "resources", "icons"));
  roots.push(join(here, "..", "..", "resources", "icons"));
  return roots;
}

function firstExistingIcon(names: string[]): string | null {
  for (const root of iconRoots()) {
    for (const name of names) {
      const p = join(root, name);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Prefer PNG for nativeImage — .icns via createFromPath is flaky on some
 * Electron builds (empty / wrong size), which makes startDrag fail on macOS
 * (icon must be non-empty).
 */
function resolveBrandPngPath(): string | null {
  const icons = getResolvedAppIcons();
  return (
    firstExistingIcon(["128x128.png", "32x32.png", "icon.png"]) ??
    icons.pngPath ??
    null
  );
}

function loadNativeIcon(path: string, size: number): Electron.NativeImage | null {
  try {
    const img = nativeImage.createFromPath(path);
    if (img.isEmpty()) return null;
    const resized = img.resize({ width: size, height: size });
    return resized.isEmpty() ? null : resized;
  } catch {
    return null;
  }
}

function resolveAppIconOnly(hostAppPath: string): Electron.NativeImage {
  const brandPng = resolveBrandPngPath();
  if (brandPng) {
    const img = loadNativeIcon(brandPng, 64);
    if (img) return img;
  }

  for (const p of [
    join(hostAppPath, "Contents", "Resources", "AppIcon.icns"),
    join(hostAppPath, "Contents", "Resources", "icon.icns"),
  ]) {
    if (!existsSync(p)) continue;
    const img = loadNativeIcon(p, 64);
    if (img) return img;
  }

  // Minimal non-empty 32×32 blue PNG (required on macOS startDrag).
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAaElEQVRYR+2WMQ4AIAgD7f8f" +
      "zcbBxMHB2kBJuAZSWigAZgYz8z0zO+8dERExM7M+gPkA5gOYD2A+gPkA5gOYD2A+gPkA5gOY" +
      "D2A+gPkA5gOYD2A+gPkA5gOYD2A+gPkA5gOYD2A+gPkA5gOYD2A+gPkA5gOYD/gA1dYBvQ1vS5QAAAAASUVO" +
      "RK5CYII=",
    "base64",
  );
  const fallback = nativeImage.createFromBuffer(png);
  return fallback.isEmpty() ? nativeImage.createEmpty() : fallback;
}

function nativeImageFromDataUrl(dataUrl: string): Electron.NativeImage | null {
  try {
    const img = nativeImage.createFromDataURL(dataUrl);
    return img.isEmpty() ? null : img;
  } catch {
    return null;
  }
}

/** Chip UI icon as data URL (CSP allows img-src data:). */
function resolveChipIconDataUrl(hostAppPath: string): string {
  const brandPng = resolveBrandPngPath();
  if (brandPng) {
    try {
      const buf = readFileSync(brandPng);
      return `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      /* fall through */
    }
    const img = loadNativeIcon(brandPng, 56);
    if (img) {
      try {
        return img.toDataURL();
      } catch {
        /* fall through */
      }
    }
  }

  for (const p of [
    join(hostAppPath, "Contents", "Resources", "AppIcon.icns"),
    join(hostAppPath, "Contents", "Resources", "icon.icns"),
  ]) {
    if (!existsSync(p)) continue;
    const img = loadNativeIcon(p, 56);
    if (!img) continue;
    try {
      return img.toDataURL();
    } catch {
      /* continue */
    }
  }
  return "";
}

function panelHtml(state: GrantState, locale?: string): string {
  const instruction = escapeHtml(state.instruction);
  const chip = escapeHtml(state.chipLabel);
  const closeLabel = isZh(locale) ? "关闭" : "Close";
  const iconHtml = state.iconDataUrl
    ? `<img class="icon" src="${state.iconDataUrl}" width="28" height="28" alt="" draggable="false" />`
    : `<div class="icon icon-fallback" aria-hidden="true"></div>`;
  return `<!DOCTYPE html>
<html lang="${isZh(locale) ? "zh" : "en"}">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:" />
  <title>Desktop Use permissions</title>
  <style>
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      overflow: hidden; background: transparent;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
      user-select: none; -webkit-user-select: none;
    }
    .shell {
      box-sizing: border-box;
      margin: 6px;
      height: calc(100% - 12px);
      padding: 14px 16px 14px 16px;
      border-radius: 14px;
      background: rgba(40, 40, 42, 0.94);
      border: 1px solid rgba(255,255,255,0.10);
      box-shadow: 0 10px 36px rgba(0,0,0,0.42);
      color: #f2f2f2;
      display: flex;
      flex-direction: column;
      gap: 12px;
      justify-content: center;
      /* Whole-shell window drag breaks file drag — only non-chip chrome may drag. */
      -webkit-app-region: no-drag;
      /* Local entrance while the BrowserWindow flies across the desktop. */
      animation: grant-enter 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes grant-enter {
      from {
        opacity: 0;
        transform: scale(0.9) translateY(10px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 24px;
      -webkit-app-region: drag;
    }
    .arrow {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      color: #2f7cff;
      -webkit-app-region: no-drag;
    }
    .instruction {
      flex: 1;
      font-size: 13px;
      line-height: 1.35;
      font-weight: 500;
      color: rgba(255,255,255,0.92);
      letter-spacing: -0.01em;
    }
    .close {
      -webkit-app-region: no-drag;
      border: 0; background: transparent;
      color: rgba(255,255,255,0.4);
      font-size: 13px; cursor: pointer;
      width: 22px; height: 22px; border-radius: 6px; line-height: 1;
      flex-shrink: 0;
      padding: 0;
    }
    .close:hover { background: rgba(255,255,255,0.08); color: #fff; }
    .chip {
      -webkit-app-region: no-drag;
      display: flex;
      align-items: center;
      gap: 10px;
      height: 46px;
      padding: 0 14px;
      border-radius: 11px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      cursor: grab;
    }
    .chip:active { cursor: grabbing; background: rgba(255,255,255,0.10); }
    .icon {
      width: 28px; height: 28px; border-radius: 7px;
      flex-shrink: 0;
      object-fit: cover;
      pointer-events: none;
    }
    .icon-fallback {
      background: linear-gradient(145deg, #3b82f6, #1d4ed8);
    }
    .name {
      font-size: 14px; font-weight: 500;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      pointer-events: none;
      color: rgba(255,255,255,0.95);
    }
  </style>
</head>
<body>
  <div class="shell" id="shell">
    <div class="header">
      <svg class="arrow" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 3.2 5.6 9.6a1.1 1.1 0 0 0 1.55 1.56L11 7.3V19.5a1.1 1.1 0 0 0 2.2 0V7.3l3.85 3.86a1.1 1.1 0 1 0 1.55-1.56L12 3.2Z"/>
      </svg>
      <div class="instruction">${instruction}</div>
      <button class="close" type="button" title="${closeLabel}" id="close" aria-label="${closeLabel}">✕</button>
    </div>
    <div class="chip" id="chip" draggable="true" title="${chip}">
      ${iconHtml}
      <div class="name">${chip}</div>
    </div>
  </div>
  <script>
    const chip = document.getElementById('chip');
    const close = document.getElementById('close');

    function roundedRect(ctx, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    /**
     * Paint icon+label chip into a PNG for startDrag ghost.
     * IMPORTANT: Electron startDrag on macOS draws the bitmap at 1 device
     * pixel ≈ 1 screen point. Do NOT multiply by devicePixelRatio or the
     * ghost is 2× (or larger) than the on-screen chip.
     */
    function buildDragPreview() {
      try {
        const rect = chip.getBoundingClientRect();
        // Logical CSS size only — matches the chip the user is grabbing.
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Match .chip styles so the ghost looks like the row itself.
        ctx.fillStyle = 'rgba(55, 55, 58, 0.96)';
        roundedRect(ctx, 0.5, 0.5, w - 1, h - 1, 11);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1;
        roundedRect(ctx, 0.5, 0.5, w - 1, h - 1, 11);
        ctx.stroke();

        const padX = 14;
        const iconSize = 28;
        const gap = 10;
        const iconY = (h - iconSize) / 2;
        const img = chip.querySelector('img.icon');
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.save();
          roundedRect(ctx, padX, iconY, iconSize, iconSize, 7);
          ctx.clip();
          ctx.drawImage(img, padX, iconY, iconSize, iconSize);
          ctx.restore();
        } else {
          ctx.fillStyle = '#2563eb';
          roundedRect(ctx, padX, iconY, iconSize, iconSize, 7);
          ctx.fill();
        }

        const nameEl = chip.querySelector('.name');
        const label = (nameEl && nameEl.textContent) || '';
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = '500 14px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
        ctx.textBaseline = 'middle';
        const textX = padX + iconSize + gap;
        const maxTextW = w - textX - 14;
        let draw = label;
        if (ctx.measureText(draw).width > maxTextW) {
          while (draw.length > 1 && ctx.measureText(draw + '…').width > maxTextW) {
            draw = draw.slice(0, -1);
          }
          draw = draw + '…';
        }
        ctx.fillText(draw, textX, h / 2);

        const dataUrl = canvas.toDataURL('image/png');
        window.atmosGrant?.setDragPreview(dataUrl);
      } catch (err) {
        console.warn('[grant] buildDragPreview failed', err);
      }
    }

    // Build after layout + icon decode so the ghost includes the real mark.
    const icon = chip.querySelector('img.icon');
    if (icon && !icon.complete) {
      icon.addEventListener('load', () => buildDragPreview(), { once: true });
      icon.addEventListener('error', () => buildDragPreview(), { once: true });
    }
    requestAnimationFrame(() => requestAnimationFrame(buildDragPreview));

    // Electron file drag: must use dragstart and call startDrag before return.
    chip.addEventListener('dragstart', (e) => {
      e.preventDefault();
      try {
        const result = window.atmosGrant?.startDrag();
        if (result && result.ok === false) {
          console.warn('[grant] startDrag failed', result.error);
        }
      } catch (err) {
        console.warn('[grant] startDrag threw', err);
      }
    });
    chip.addEventListener('drag', (e) => { e.preventDefault(); });
    close.addEventListener('click', () => window.atmosGrant?.close());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.atmosGrant?.close();
    });
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Rect = { x: number; y: number; width: number; height: number };

function parseBoundsOutput(out: string): Rect | null {
  const nums = out.match(/-?\d+/g)?.map((n) => Number(n));
  if (!nums || nums.length < 4) return null;
  const [x, y, width, height] = nums;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    width < 120 ||
    height < 120
  ) {
    return null;
  }
  return { x, y, width, height };
}

/**
 * Parse AppleScript `bounds` list `{x1, y1, x2, y2}` → Rect.
 */
function parseAppleBoundsList(out: string): Rect | null {
  const nums = out.match(/-?\d+/g)?.map((n) => Number(n));
  if (!nums || nums.length < 4) return null;
  const [x1, y1, x2, y2] = nums;
  if (
    typeof x1 !== "number" ||
    typeof y1 !== "number" ||
    typeof x2 !== "number" ||
    typeof y2 !== "number" ||
    !Number.isFinite(x1) ||
    !Number.isFinite(y1) ||
    x2 - x1 < 120 ||
    y2 - y1 < 120
  ) {
    return null;
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/**
 * Best-effort bounds of the front System Settings window (logical points).
 *
 * MUST stay async — sync osascript on the main process freezes Electron
 * (beach-ball cursor) especially when macOS shows an Automation prompt.
 */
async function getSystemSettingsWindowBounds(
  opts?: { bypassCache?: boolean },
): Promise<Rect | null> {
  if (process.platform !== "darwin") return null;

  const now = Date.now();
  if (
    !opts?.bypassCache &&
    cachedSettingsBounds &&
    now - cachedSettingsBounds.at < SETTINGS_BOUNDS_TTL_MS
  ) {
    return cachedSettingsBounds.rect;
  }

  // Multiple strategies — System Settings is flaky right after open, and
  // System Events needs Automation permission on some machines.
  const probes: { script: string; parse: (s: string) => Rect | null }[] = [
    {
      script:
        'tell application "System Events" to tell process "System Settings" to get {position, size} of window 1',
      parse: parseBoundsOutput,
    },
    {
      // bounds → {left, top, right, bottom}
      script:
        'tell application "System Settings" to get the bounds of the front window',
      parse: parseAppleBoundsList,
    },
    {
      script:
        'tell application "System Events" to tell process "System Preferences" to get {position, size} of window 1',
      parse: parseBoundsOutput,
    },
  ];

  for (const { script, parse } of probes) {
    try {
      const { stdout } = await execFileAsync("osascript", ["-e", script], {
        encoding: "utf8",
        timeout: 700,
        maxBuffer: 16 * 1024,
      });
      const rect = parse(String(stdout).trim());
      if (rect) {
        cachedSettingsBounds = { rect, at: Date.now() };
        return rect;
      }
    } catch {
      /* try next / Automation denied / window not ready */
    }
  }
  return null;
}

/**
 * Poll until System Settings reports a window, or time out.
 * Call this **before** committing the fly target so we do not land on the
 * screen-bottom fallback while Settings is still animating open.
 */
async function waitForSystemSettingsBounds(
  budgetMs = BOUNDS_WAIT_MS,
): Promise<Rect | null> {
  const deadline = Date.now() + budgetMs;
  let first = true;
  while (Date.now() < deadline) {
    const rect = await getSystemSettingsWindowBounds({
      bypassCache: !first,
    });
    first = false;
    if (rect) return rect;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((r) =>
      setTimeout(r, Math.min(BOUNDS_POLL_MS, remaining)),
    );
  }
  return getSystemSettingsWindowBounds({ bypassCache: true });
}

function clampToWorkArea(x: number, y: number, ww: number, wh: number): {
  x: number;
  y: number;
} {
  const display = screen.getDisplayNearestPoint({
    x: Math.round(x + ww / 2),
    y: Math.round(y + wh / 2),
  });
  const { x: wx, y: wy, width: sw, height: sh } = display.workArea;
  const clampedX = Math.min(Math.max(Math.round(x), wx + 4), wx + sw - ww - 4);
  const clampedY = Math.min(Math.max(Math.round(y), wy + 4), wy + sh - wh - 4);
  return { x: clampedX, y: clampedY };
}

/**
 * Place the card **strictly inside** the Settings window (lower detail pane).
 * Falls back near `nearPoint` (button / Atmos) — never the global screen bottom,
 * which is what made the card look "randomly outside".
 */
function computePanelPosition(
  settings: Rect | null,
  ww: number,
  wh: number,
  nearPoint?: { x: number; y: number } | null,
): { x: number; y: number } {
  if (settings) {
    // Detail pane ≈ right of the sidebar on Ventura+ System Settings.
    const sidebar = Math.min(
      300,
      Math.max(240, Math.round(settings.width * 0.34)),
    );
    const padX = 20;
    const padBottom = 36;
    const padTop = 96;

    const contentLeft = settings.x + sidebar;
    const contentRight = settings.x + settings.width - padX;
    const contentWidth = Math.max(contentRight - contentLeft, ww);

    let x = contentLeft + (contentWidth - ww) / 2;
    // Sit just above the bottom edge, overlapping the app list (reference UX).
    let y = settings.y + settings.height - wh - padBottom;

    // Hard clamp: panel must stay fully inside the Settings frame.
    const minX = settings.x + padX;
    const maxX = settings.x + settings.width - ww - padX;
    const minY = settings.y + padTop;
    const maxY = settings.y + settings.height - wh - 12;
    if (maxX >= minX) x = Math.min(Math.max(x, minX), maxX);
    else x = settings.x + Math.max(0, (settings.width - ww) / 2);
    if (maxY >= minY) y = Math.min(Math.max(y, minY), maxY);
    else y = settings.y + Math.max(0, (settings.height - wh) / 2);

    return clampToWorkArea(x, y, ww, wh);
  }

  // No Settings bounds yet: park near the Grant button / Atmos window on the
  // same display — not the primary display's bottom edge.
  const anchor = nearPoint ?? { x: 0, y: 0 };
  const display = screen.getDisplayNearestPoint({
    x: Math.round(anchor.x + ww / 2),
    y: Math.round(anchor.y + wh / 2),
  });
  const { width: sw, height: sh, x: sx, y: sy } = display.workArea;
  return {
    x: Math.round(
      Math.min(
        Math.max(anchor.x, sx + 12),
        sx + sw - ww - 12,
      ),
    ),
    y: Math.round(
      Math.min(
        Math.max(anchor.y - 24, sy + 48),
        sy + sh - wh - 24,
      ),
    ),
  };
}

function applyPanelPosition(
  win: BrowserWindow,
  x: number,
  y: number,
  force = false,
): void {
  if (win.isDestroyed()) return;
  if (
    !force &&
    lastPlaced &&
    Math.abs(lastPlaced.x - x) < POSITION_MOVE_EPSILON &&
    Math.abs(lastPlaced.y - y) < POSITION_MOVE_EPSILON
  ) {
    return;
  }
  // Avoid "Window move completed without beginning" spam from no-op moves.
  try {
    const [cx, cy] = win.getPosition();
    if (
      !force &&
      Math.abs(cx - x) < POSITION_MOVE_EPSILON &&
      Math.abs(cy - y) < POSITION_MOVE_EPSILON
    ) {
      lastPlaced = { x: cx, y: cy };
      return;
    }
  } catch {
    /* continue */
  }
  win.setPosition(x, y);
  lastPlaced = { x, y };
}

/**
 * Place the grant card **inside** the System Settings window, lower content
 * area (same placement as the reference “drag into list above” UI).
 *
 * Async on purpose: never block the main process with osascript.
 * Skipped while the fly animation is driving setPosition.
 */
async function positionInsideSettingsWindow(
  win: BrowserWindow,
  opts?: { force?: boolean },
): Promise<void> {
  if (win.isDestroyed()) return;
  if (flyAnimActive && !opts?.force) return;
  if (positionInFlight) return;
  positionInFlight = true;
  try {
    const size = win.getSize();
    const ww = size[0] ?? PANEL_WIDTH;
    const wh = size[1] ?? PANEL_HEIGHT;
    const settings = await getSystemSettingsWindowBounds({
      bypassCache: opts?.force === true,
    });
    if (win.isDestroyed()) return;
    const near = lastPlaced ?? pendingSourceOrigin;
    const pos = computePanelPosition(settings, ww, wh, near);
    applyPanelPosition(win, pos.x, pos.y, opts?.force === true);
  } finally {
    positionInFlight = false;
  }
}

/**
 * Fly origin: preferred = Grant button (pendingSourceOrigin), else center of
 * the Atmos window that opened the grant flow.
 */
function getFlySourceOrigin(exclude: BrowserWindow): { x: number; y: number } {
  if (pendingSourceOrigin) {
    return pendingSourceOrigin;
  }

  const others = BrowserWindow.getAllWindows().filter(
    (w) => w !== exclude && !w.isDestroyed() && w.isVisible(),
  );
  const focused = BrowserWindow.getFocusedWindow();
  const src =
    focused && focused !== exclude && !focused.isDestroyed()
      ? focused
      : others[0] ?? null;

  if (src) {
    try {
      const [sx, sy] = src.getPosition();
      const [sw, sh] = src.getSize();
      return {
        x: Math.round(sx + (sw - PANEL_WIDTH) / 2),
        y: Math.round(sy + (sh - PANEL_HEIGHT) / 2),
      };
    } catch {
      /* fall through */
    }
  }

  const display = screen.getPrimaryDisplay();
  const { width: dw, height: dh, x: dx, y: dy } = display.workArea;
  return {
    x: Math.round(dx + (dw - PANEL_WIDTH) / 2),
    y: Math.round(dy + (dh - PANEL_HEIGHT) / 2),
  };
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function clearFlyFrameTimer(): void {
  if (flyAnimTimer) {
    clearTimeout(flyAnimTimer);
    flyAnimTimer = null;
  }
}

function stopFlyAnimation(): void {
  clearFlyFrameTimer();
  flyAnimActive = false;
  // Invalidate any in-flight fly IIFE (wait / upgrade / resnap loops).
  flyGeneration += 1;
}

/**
 * Fly the card from the Grant button toward the System Settings content area.
 *
 * Important: we **wait** for Settings bounds (async, bounded) before choosing
 * the fly end-point. Flying first with a screen-bottom fallback is what made
 * the card sometimes land outside the Settings window.
 */
function flyFromAtmosToSettings(win: BrowserWindow): void {
  stopFlyAnimation();
  stopPositionPoll();
  cachedSettingsBounds = null;

  const start = getFlySourceOrigin(win);
  applyPanelPosition(win, start.x, start.y, true);
  if (!win.isVisible()) {
    // Inactive: keep System Settings focused so the user can drop into the list.
    try {
      win.showInactive();
    } catch {
      win.show();
    }
  }

  const size = win.getSize();
  const ww = size[0] ?? PANEL_WIDTH;
  const wh = size[1] ?? PANEL_HEIGHT;
  // Capture generation after stopFlyAnimation bumped it so this run is current.
  const generation = flyGeneration;

  void (async () => {
    const isStale = () => generation !== flyGeneration || win.isDestroyed();
    if (isStale()) return;

    // 1) Hold at the button while Settings finishes opening; resolve target.
    const settings = await waitForSystemSettingsBounds(BOUNDS_WAIT_MS);
    if (isStale()) return;

    let end = computePanelPosition(settings, ww, wh, start);
    let endResolved = Boolean(settings);

    // Mid-flight upgrades if Settings appears after we timed out.
    const upgrade = (async () => {
      if (endResolved) return;
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (isStale() || !flyAnimActive) return;
        const again = await getSystemSettingsWindowBounds({
          bypassCache: true,
        });
        if (again) {
          end = computePanelPosition(again, ww, wh, start);
          endResolved = true;
          return;
        }
      }
    })();

    // 2) Animate button → resolved (or near-button) target.
    const t0 = Date.now();
    flyAnimActive = true;

    await new Promise<void>((resolve) => {
      const tick = () => {
        if (isStale()) {
          clearFlyFrameTimer();
          flyAnimActive = false;
          resolve();
          return;
        }
        const raw = Math.min(1, (Date.now() - t0) / FLY_DURATION_MS);
        const e = easeOutCubic(raw);
        const x = Math.round(start.x + (end.x - start.x) * e);
        const y = Math.round(start.y + (end.y - start.y) * e);
        applyPanelPosition(win, x, y, true);

        if (raw < 1) {
          flyAnimTimer = setTimeout(tick, FLY_FRAME_MS);
          return;
        }
        // Natural end of this generation — do not bump flyGeneration.
        clearFlyFrameTimer();
        flyAnimActive = false;
        resolve();
      };
      flyAnimTimer = setTimeout(tick, FLY_FRAME_MS);
    });

    void upgrade;
    if (isStale()) return;

    // 3) Burst re-snap: Settings often finishes layout after the fly ends.
    const landDeadline = Date.now() + LANDING_RESNAP_MS;
    while (!isStale() && Date.now() < landDeadline) {
      const rect = await getSystemSettingsWindowBounds({ bypassCache: true });
      if (isStale()) return;
      if (rect) {
        const pos = computePanelPosition(rect, ww, wh, start);
        applyPanelPosition(win, pos.x, pos.y, true);
        endResolved = true;
        // One good snap is enough if Settings is stable; keep a couple more
        // in case the pane is still resizing.
        await new Promise((r) => setTimeout(r, LANDING_RESNAP_EVERY_MS));
        if (isStale()) return;
        const rect2 = await getSystemSettingsWindowBounds({
          bypassCache: true,
        });
        if (rect2 && !isStale()) {
          const pos2 = computePanelPosition(rect2, ww, wh, start);
          applyPanelPosition(win, pos2.x, pos2.y, true);
        }
        break;
      }
      await new Promise((r) => setTimeout(r, LANDING_RESNAP_EVERY_MS));
    }

    if (!isStale()) startPositionPoll(win);
  })();
}

function stopPositionPoll(): void {
  if (positionPoll) {
    clearInterval(positionPoll);
    positionPoll = null;
  }
  positionInFlight = false;
}

function startPositionPoll(win: BrowserWindow): void {
  if (positionPoll) {
    clearInterval(positionPoll);
    positionPoll = null;
  }
  // Slow soft-follow only after the fly has landed.
  positionPoll = setInterval(() => {
    if (!win || win.isDestroyed()) {
      stopPositionPoll();
      return;
    }
    if (flyAnimActive) return;
    void positionInsideSettingsWindow(win);
  }, 2000);
}

function resolveDragGhost(hostAppPath: string): Electron.NativeImage {
  const preview = grantState?.dragPreviewDataUrl;
  if (preview) {
    const fromPreview = nativeImageFromDataUrl(preview);
    if (fromPreview && !fromPreview.isEmpty()) {
      // Defensive: if a high-DPI buffer slipped through, shrink to CSS size.
      // startDrag paints 1 bitmap pixel ≈ 1 pt on macOS.
      try {
        const { width, height } = fromPreview.getSize();
        const maxW = PANEL_WIDTH - 24; // chip sits inside panel padding
        if (width > maxW * 1.25) {
          const scale = maxW / width;
          const resized = fromPreview.resize({
            width: Math.round(width * scale),
            height: Math.round(height * scale),
          });
          if (!resized.isEmpty()) return resized;
        }
      } catch {
        /* use as-is */
      }
      return fromPreview;
    }
  }
  // Fallback icon only — keep small so it is not a giant square.
  return resolveAppIconOnly(hostAppPath);
}

function wireIpcOnce(): void {
  if (ipcWired) return;
  ipcWired = true;

  ipcMain.on("desktop-use-grant-drag-preview", (event, dataUrl) => {
    if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) {
      if (grantState) grantState.dragPreviewDataUrl = dataUrl;
      event.returnValue = { ok: true };
      return;
    }
    event.returnValue = { ok: false, error: "bad_preview" };
  });

  // sendSync so startDrag runs inside the dragstart stack (required on macOS).
  ipcMain.on("desktop-use-grant-drag-start", (event) => {
    const raw = grantState?.hostAppPath;
    if (!raw) {
      event.returnValue = { ok: false, error: "missing_host" };
      return;
    }
    const path = resolve(raw);
    if (!existsSync(path)) {
      event.returnValue = { ok: false, error: "missing_host" };
      return;
    }
    try {
      const icon = resolveDragGhost(path);
      if (icon.isEmpty()) {
        event.returnValue = { ok: false, error: "empty_drag_icon" };
        return;
      }
      event.sender.startDrag({
        file: path,
        icon,
      });
      event.returnValue = { ok: true };
    } catch (err) {
      console.warn("[desktop-use] startDrag failed", err);
      event.returnValue = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.on("desktop-use-grant-close", () => {
    closeAccessibilityGrantOverlay();
  });
}

function loadGrantPanel(
  win: BrowserWindow,
  state: GrantState,
  locale?: string,
): void {
  void win
    .loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(panelHtml(state, locale))}`,
    )
    .then(() => {
      // Start over Atmos Settings and ease into System Settings.
      // Bounds resolve during the flight — no main-thread freeze.
      flyFromAtmosToSettings(win);
    });
}

/** Show (or focus) the Accessibility grant panel for the host app. */
export function showAccessibilityGrantOverlay(
  opts: GrantOverlayOptions,
): { ok: boolean; error?: string } {
  if (process.platform !== "darwin") {
    return { ok: false, error: "Grant overlay is only supported on macOS" };
  }
  if (!opts.hostAppPath || !existsSync(opts.hostAppPath)) {
    return {
      ok: false,
      error: "Host app path missing; install the control engine first",
    };
  }

  wireIpcOnce();

  const hostAppPath = resolve(opts.hostAppPath);
  const hostAppName =
    opts.hostAppName?.trim() ||
    hostAppPath.split("/").pop()?.replace(/\.app$/i, "") ||
    "Atmos Desktop Use";
  const purpose: GrantOverlayPurpose =
    opts.purpose === "screen_recording" ? "screen_recording" : "accessibility";

  pendingSourceOrigin =
    opts.sourceOrigin &&
    Number.isFinite(opts.sourceOrigin.x) &&
    Number.isFinite(opts.sourceOrigin.y)
      ? {
          x: Math.round(opts.sourceOrigin.x),
          y: Math.round(opts.sourceOrigin.y),
        }
      : null;

  grantState = {
    hostAppPath,
    hostAppName,
    instruction: buildInstruction(hostAppName, purpose, opts.locale),
    chipLabel: hostAppName,
    iconDataUrl: resolveChipIconDataUrl(hostAppPath),
    dragPreviewDataUrl: null,
  };

  if (grantWindow && !grantWindow.isDestroyed()) {
    loadGrantPanel(grantWindow, grantState, opts.locale);
    return { ok: true };
  }

  const preload = grantPreloadPath();
  // Prefer a normal always-on-top window over type:"panel" — panel windows
  // often break HTML5/Electron file drag on macOS.
  const win = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    focusable: true,
    webPreferences: {
      preload: existsSync(preload) ? preload : undefined,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  grantWindow = win;
  win.on("closed", () => {
    stopFlyAnimation();
    stopPositionPoll();
    if (grantWindow === win) grantWindow = null;
  });

  loadGrantPanel(win, grantState, opts.locale);
  return { ok: true };
}

export function closeAccessibilityGrantOverlay(): void {
  stopFlyAnimation();
  stopPositionPoll();
  lastPlaced = null;
  cachedSettingsBounds = null;
  pendingSourceOrigin = null;
  if (grantWindow && !grantWindow.isDestroyed()) {
    grantWindow.close();
  }
  grantWindow = null;
  if (grantState) grantState.dragPreviewDataUrl = null;
}
