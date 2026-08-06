/**
 * Accessibility grant overlay (desktop shell).
 *
 * Opens after System Settings → Accessibility. Primary action is enable the
 * host toggle when the app is already listed; optional drag adds the host
 * `.app` when it is missing from the list.
 *
 * Drag uses Electron `webContents.startDrag` from a **dragstart** handler
 * (mousedown + async IPC does not start a macOS file drag).
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, ipcMain, nativeImage, screen, shell } from "electron";
import { getResolvedAppIcons } from "../branding.js";

export type GrantOverlayOptions = {
  hostAppPath: string;
  hostAppName?: string;
  /** BCP-47-ish language tag; used for in-panel copy. */
  locale?: string;
};

type GrantState = {
  hostAppPath: string;
  hostAppName: string;
  title: string;
  secondary: string;
  chipLabel: string;
  /** data:image/... URL for the chip icon, or empty for CSS fallback. */
  iconDataUrl: string;
};

let grantWindow: BrowserWindow | null = null;
let grantState: GrantState | null = null;
let ipcWired = false;
let positionPoll: ReturnType<typeof setInterval> | null = null;

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

function buildCopy(
  hostAppName: string,
  locale?: string,
): Pick<GrantState, "title" | "secondary" | "chipLabel"> {
  if (isZh(locale)) {
    return {
      title: `在列表中找到「${hostAppName}」并打开右侧开关`,
      secondary: "列表里没有？将下方应用拖入列表添加；或点右侧在 Finder 中显示",
      chipLabel: hostAppName,
    };
  }
  return {
    title: `Find “${hostAppName}” in the list and turn the toggle on`,
    secondary:
      "Not listed? Drag the app below into the list, or reveal it in Finder",
    chipLabel: hostAppName,
  };
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
  // Small → large so chip / drag cursor stay sharp without huge data URLs.
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

function resolveDragIcon(hostAppPath: string): Electron.NativeImage {
  const brandPng = resolveBrandPngPath();
  if (brandPng) {
    const img = loadNativeIcon(brandPng, 64);
    if (img) return img;
  }

  const candidates = [
    join(hostAppPath, "Contents", "Resources", "AppIcon.icns"),
    join(hostAppPath, "Contents", "Resources", "icon.icns"),
  ];
  for (const p of candidates) {
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

/** Chip UI icon as data URL (CSP allows img-src data:). */
function resolveChipIconDataUrl(hostAppPath: string): string {
  const brandPng = resolveBrandPngPath();
  if (brandPng) {
    try {
      // Prefer raw PNG bytes so we keep alpha / crisp art.
      const buf = readFileSync(brandPng);
      const b64 = buf.toString("base64");
      return `data:image/png;base64,${b64}`;
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
  const title = escapeHtml(state.title);
  const secondary = escapeHtml(state.secondary);
  const chip = escapeHtml(state.chipLabel);
  const closeLabel = isZh(locale) ? "关闭" : "Close";
  const revealLabel = isZh(locale) ? "在 Finder 中显示" : "Show in Finder";
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
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      user-select: none; -webkit-user-select: none;
    }
    .shell {
      box-sizing: border-box;
      margin: 8px;
      height: calc(100% - 16px);
      padding: 14px 14px 12px 16px;
      border-radius: 16px;
      background: rgba(22, 22, 24, 0.96);
      border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 12px 40px rgba(0,0,0,0.45);
      color: #f2f2f2;
      display: flex;
      flex-direction: column;
      gap: 10px;
      /* Do NOT set -webkit-app-region: drag on the whole shell — it steals
         mouse gestures and breaks HTML5 / Electron file drag on the chip. */
      -webkit-app-region: no-drag;
    }
    .row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      -webkit-app-region: drag;
    }
    .title {
      flex: 1;
      font-size: 13px;
      line-height: 1.4;
      font-weight: 500;
      color: rgba(255,255,255,0.92);
    }
    .secondary {
      font-size: 11.5px;
      line-height: 1.35;
      color: rgba(255,255,255,0.52);
      -webkit-app-region: no-drag;
    }
    .close {
      -webkit-app-region: no-drag;
      border: 0; background: transparent;
      color: rgba(255,255,255,0.55);
      font-size: 14px; cursor: pointer;
      width: 24px; height: 24px; border-radius: 6px; line-height: 1;
      flex-shrink: 0;
    }
    .close:hover { background: rgba(255,255,255,0.08); color: #fff; }
    .chip-row {
      display: flex;
      align-items: stretch;
      gap: 8px;
      -webkit-app-region: no-drag;
    }
    .chip {
      -webkit-app-region: no-drag;
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      height: 48px;
      padding: 0 14px;
      border-radius: 12px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.14);
      cursor: grab;
    }
    .chip:active { cursor: grabbing; background: rgba(255,255,255,0.12); }
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
    }
    .reveal {
      -webkit-app-region: no-drag;
      flex-shrink: 0;
      border: 0;
      border-radius: 12px;
      padding: 0 12px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      color: rgba(255,255,255,0.85);
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.12);
      white-space: nowrap;
    }
    .reveal:hover { background: rgba(255,255,255,0.16); }
  </style>
</head>
<body>
  <div class="shell">
    <div class="row">
      <div class="title">${title}</div>
      <button class="close" type="button" title="${closeLabel}" id="close">✕</button>
    </div>
    <div class="secondary">${secondary}</div>
    <div class="chip-row">
      <div class="chip" id="chip" draggable="true" title="${chip}">
        ${iconHtml}
        <div class="name">${chip}</div>
      </div>
      <button class="reveal" type="button" id="reveal">${revealLabel}</button>
    </div>
  </div>
  <script>
    const chip = document.getElementById('chip');
    const close = document.getElementById('close');
    const reveal = document.getElementById('reveal');
    // Electron file drag: must use dragstart (not mousedown) and call startDrag
    // before the handler returns — preload uses sendSync.
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
    // Prevent the browser from treating the chip as a non-file drag source.
    chip.addEventListener('drag', (e) => { e.preventDefault(); });
    close.addEventListener('click', () => window.atmosGrant?.close());
    reveal.addEventListener('click', () => window.atmosGrant?.reveal());
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

/**
 * Best-effort bounds of the front System Settings window.
 * Uses System Events (no third-party deps). Falls back to null when
 * Automation/AX is denied or Settings is not open — caller uses work-area fallback.
 */
function getSystemSettingsWindowBounds(): Rect | null {
  if (process.platform !== "darwin") return null;
  const scripts = [
    // Ventura+ process name (also on zh-CN systems).
    'tell application "System Events" to tell process "System Settings" to get {position, size} of window 1',
    // Older macOS
    'tell application "System Events" to tell process "System Preferences" to get {position, size} of window 1',
  ];
  for (const source of scripts) {
    try {
      const out = execFileSync("osascript", ["-e", source], {
        encoding: "utf8",
        timeout: 1500,
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      const nums = out.match(/-?\d+/g)?.map((n) => Number(n));
      if (!nums || nums.length < 4) continue;
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
        continue;
      }
      return { x, y, width, height };
    } catch {
      /* try next / fall through */
    }
  }
  return null;
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
  const clampedX = Math.min(Math.max(Math.round(x), wx + 8), wx + sw - ww - 8);
  const clampedY = Math.min(Math.max(Math.round(y), wy + 8), wy + sh - wh - 8);
  return { x: clampedX, y: clampedY };
}

/** Prefer just below System Settings; otherwise bottom-center of its display. */
function positionNearAccessibilityPane(win: BrowserWindow): void {
  const size = win.getSize();
  const ww = size[0] ?? 440;
  const wh = size[1] ?? 168;
  const gap = 12;

  const settings = getSystemSettingsWindowBounds();
  if (settings) {
    // Center under the Settings window, sitting just below it.
    let x = settings.x + (settings.width - ww) / 2;
    let y = settings.y + settings.height + gap;

    // If it would fall off the bottom of the work area, place above instead.
    const mid = {
      x: Math.round(settings.x + settings.width / 2),
      y: Math.round(settings.y + settings.height / 2),
    };
    const { y: wy, height: sh } = screen.getDisplayNearestPoint(mid).workArea;
    if (y + wh > wy + sh - 8) {
      y = settings.y - wh - gap;
    }

    const pos = clampToWorkArea(x, y, ww, wh);
    win.setPosition(pos.x, pos.y);
    return;
  }

  // Fallback: bottom-center of primary work area (legacy behavior).
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh, x: sx, y: sy } = display.workArea;
  const x = Math.round(sx + (sw - ww) / 2);
  const y = Math.round(sy + sh - wh - 36);
  win.setPosition(x, y);
}

function stopPositionPoll(): void {
  if (positionPoll) {
    clearInterval(positionPoll);
    positionPoll = null;
  }
}

function startPositionPoll(win: BrowserWindow): void {
  stopPositionPoll();
  // Re-snap while open so moving System Settings keeps the panel adjacent.
  positionPoll = setInterval(() => {
    if (!win || win.isDestroyed()) {
      stopPositionPoll();
      return;
    }
    positionNearAccessibilityPane(win);
  }, 800);
}

function wireIpcOnce(): void {
  if (ipcWired) return;
  ipcWired = true;

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
      const icon = resolveDragIcon(path);
      if (icon.isEmpty()) {
        event.returnValue = { ok: false, error: "empty_drag_icon" };
        return;
      }
      // Prefer `file` (single path). Absolute path required; .app bundles are OK.
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

  ipcMain.on("desktop-use-grant-reveal", () => {
    const path = grantState?.hostAppPath;
    if (path && existsSync(path)) {
      shell.showItemInFolder(path);
    }
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
  const copy = buildCopy(hostAppName, opts.locale);
  grantState = {
    hostAppPath,
    hostAppName,
    ...copy,
    iconDataUrl: resolveChipIconDataUrl(hostAppPath),
  };

  if (grantWindow && !grantWindow.isDestroyed()) {
    void grantWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(panelHtml(grantState, opts.locale))}`,
    );
    positionNearAccessibilityPane(grantWindow);
    startPositionPoll(grantWindow);
    grantWindow.show();
    return { ok: true };
  }

  const preload = grantPreloadPath();
  // Prefer a normal always-on-top window over type:"panel" — panel windows
  // often break HTML5/Electron file drag on macOS.
  // Avoid fully transparent hit-testing quirks: keep transparent chrome but
  // a solid shell background (see panel CSS).
  const win = new BrowserWindow({
    width: 440,
    height: 168,
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
    stopPositionPoll();
    if (grantWindow === win) grantWindow = null;
  });

  void win
    .loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(panelHtml(grantState, opts.locale))}`,
    )
    .then(() => {
      // Settings pane may still be animating open — retry position a few times.
      positionNearAccessibilityPane(win);
      win.show();
      let attempts = 0;
      const retry = setInterval(() => {
        attempts += 1;
        if (win.isDestroyed()) {
          clearInterval(retry);
          return;
        }
        positionNearAccessibilityPane(win);
        if (attempts >= 6) clearInterval(retry);
      }, 400);
      startPositionPoll(win);
    });

  return { ok: true };
}

export function closeAccessibilityGrantOverlay(): void {
  stopPositionPoll();
  if (grantWindow && !grantWindow.isDestroyed()) {
    grantWindow.close();
  }
  grantWindow = null;
}
