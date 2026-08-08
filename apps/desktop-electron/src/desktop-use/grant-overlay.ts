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
 *
 * Panel HTML/icons: grant-overlay-panel.ts; pure geometry: grant-overlay-position.ts.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { BrowserWindow, ipcMain, nativeImage, screen } from "electron";
import {
  buildInstruction,
  nativeImageFromDataUrl,
  panelHtml,
  resolveAppIconOnly,
  resolveChipIconDataUrl,
  type GrantOverlayOptions,
  type GrantOverlayPurpose,
  type GrantState,
} from "./grant-overlay-panel.js";
import {
  PANEL_HEIGHT,
  PANEL_WIDTH,
  computePanelPosition,
  parseAppleBoundsList,
  parseBoundsOutput,
  type Rect,
} from "./grant-overlay-position.js";

// Re-export public option types for callers.
export type { GrantOverlayOptions, GrantOverlayPurpose } from "./grant-overlay-panel.js";

const execFileAsync = promisify(execFile);

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
