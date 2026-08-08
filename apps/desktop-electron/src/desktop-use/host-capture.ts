/**
 * Host-engine capture path — runs under Atmos Desktop Use.app TCC identity.
 *
 * When the control engine is installed, AppShot MUST use this path so Screen
 * Recording / Accessibility grants target the same host as control (not Electron).
 */

import {
  buildAppshotContextMarkdown,
  desktopUseReadFrontmost,
  type DesktopUseFrontmost,
} from "./capture.js";
import {
  desktopUseDriveScreenshot,
  desktopUseDriveVerify,
  desktopUseStatus,
  type DesktopUseStatusJson,
} from "./client.js";
import {
  computeWindowCropPixels,
  cropPngBytesToRect,
  displayMetricsFromElectronScreen,
  type LogicalBounds,
} from "./window-crop.js";

export type HostWindowRow = {
  app_name?: string;
  title?: string;
  pid?: number;
  window_id?: number;
  is_on_screen?: boolean;
  z_index?: number | null;
  bounds?: { x?: number; y?: number; width?: number; height?: number };
};

/** Overlay / helper processes that are never the user's AppShot target. */
const SKIP_APP_NAMES = new Set(
  [
    "CursorUIViewService",
    "Window Server",
    "WindowManager",
    "WindowManager Server",
    "NotificationCenter",
    "Control Center",
    "ControlCentre",
    "Dock",
    "SystemUIServer",
    "TextInputMenuAgent",
    "TextInputSwitcher",
    "Spotlight",
    "SpotlightUIServer",
    "Universal Control",
    "AirPlayUIAgent",
    "UserNotificationCenter",
    "coreautha",
    "loginwindow",
    "Wallpaper",
    "WidgetKit Simulator",
    "JavaApplicationStub", // rarely useful as "frontmost" alone
  ].map((s) => s.toLowerCase()),
);

/** Minimum window area (logical points²) to count as a real content window. */
const MIN_WINDOW_AREA = 120 * 120;
/** Reject menu/title chrome strips even when width is full-screen. */
const MIN_WINDOW_EDGE = 64;

/** Pure: use host engine capture iff control engine is installed. */
export function shouldUseHostEngineCapture(
  status: Pick<DesktopUseStatusJson, "driver"> | null | undefined,
): boolean {
  return Boolean(status?.driver?.installed);
}

function windowArea(w: HostWindowRow): number {
  const b = w.bounds;
  if (!b) return 0;
  const width = typeof b.width === "number" ? b.width : 0;
  const height = typeof b.height === "number" ? b.height : 0;
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

function isSkippedApp(name: string | undefined | null): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return true;
  if (SKIP_APP_NAMES.has(n)) return true;
  // Generic agent / UI helper suffixes
  if (n.endsWith("uiviewservice") || n.endsWith("uiagent")) return true;
  return false;
}

/**
 * Loose app-name equality for host list vs System Events.
 * Primary match is always **pid**; this only helps when names differ by
 * localization/spacing (generic contains / strip-space), not app-specific lists.
 */
export function appNamesLooselyEqual(a: string, b: string): boolean {
  const na = a.trim().toLowerCase().replace(/\s+/g, "");
  const nb = b.trim().toLowerCase().replace(/\s+/g, "");
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Generic substring (handles many EN/localized process name pairs).
  if (na.length >= 2 && nb.length >= 2 && (na.includes(nb) || nb.includes(na))) {
    return true;
  }
  return false;
}

function scoreWindow(
  w: HostWindowRow,
  opts: {
    preferPid?: number | null;
    preferApp?: string | null;
    selfNames: Set<string>;
    anyOnScreen: boolean;
  },
): number {
  const app = (w.app_name ?? "").trim();
  if (!app || isSkippedApp(app)) return -Infinity;

  const b = w.bounds;
  const wW = typeof b?.width === "number" ? b.width : 0;
  const wH = typeof b?.height === "number" ? b.height : 0;
  // Always drop title-bar / menu chrome (e.g. 1512×33) even for preferred pid.
  if (wW > 0 && wH > 0 && (wW < MIN_WINDOW_EDGE || wH < MIN_WINDOW_EDGE)) {
    return -Infinity;
  }

  const preferredByPid =
    opts.preferPid != null && typeof w.pid === "number" && w.pid === opts.preferPid;
  const preferredByApp =
    Boolean(opts.preferApp) && appNamesLooselyEqual(app, opts.preferApp!);
  const preferred = preferredByPid || preferredByApp;

  // Skip Atmos/self chrome unless this row is the explicitly focused app
  // (AppShot of Atmos itself is allowed and needs real window bounds).
  if (opts.selfNames.has(app) && !preferred) return -Infinity;

  const area = windowArea(w);
  if (area > 0 && area < MIN_WINDOW_AREA) return -Infinity;

  let score = 0;
  const z = typeof w.z_index === "number" ? w.z_index : 0;
  // Among same-pid windows, area dominates z (chrome strips often have higher z).
  score += Math.min(area, 8_000_000) / 100;
  score += z;

  if (opts.anyOnScreen) {
    if (w.is_on_screen) score += 1_000_000;
    else score -= 100_000; // don't fully discard; host often marks false
  }

  if (preferredByPid) score += 5_000_000;
  if (preferredByApp) score += 2_000_000;

  const title = (w.title ?? "").trim();
  if (title) score += 50_000;

  return score;
}

/**
 * Pick the best window for AppShot context.
 * Prefer focused app (pid/name), real on-screen content windows, non-empty
 * titles, and higher z — never bare utility overlays.
 */
export function pickFrontmostWindow(
  windows: HostWindowRow[],
  options: {
    preferPid?: number | null;
    preferApp?: string | null;
    selfAppNames?: Set<string>;
  } = {},
): HostWindowRow | null {
  if (!windows.length) return null;
  const selfNames =
    options.selfAppNames ??
    new Set(["Atmos", "Atmos Electron", "Atmos Desktop", "Electron"]);
  const anyOnScreen = windows.some((w) => w.is_on_screen);

  let best: HostWindowRow | null = null;
  let bestScore = -Infinity;
  for (const w of windows) {
    const s = scoreWindow(w, {
      preferPid: options.preferPid,
      preferApp: options.preferApp,
      selfNames,
      anyOnScreen,
    });
    if (s > bestScore) {
      bestScore = s;
      best = w;
    }
  }
  return bestScore > -Infinity ? best : null;
}

/**
 * Match host list_windows rows to a System Events frontmost identity.
 */
export function matchWindowForFrontmost(
  windows: HostWindowRow[],
  frontmost: Pick<DesktopUseFrontmost, "appName" | "processId">,
  selfAppNames?: Set<string>,
): HostWindowRow | null {
  return pickFrontmostWindow(windows, {
    preferPid: frontmost.processId,
    preferApp: frontmost.appName,
    selfAppNames,
  });
}

export function hostWindowToFrontmost(w: HostWindowRow | null): DesktopUseFrontmost {
  const b = w?.bounds;
  const appName = (w?.app_name ?? "Unknown App").trim() || "Unknown App";
  const title = w?.title?.trim() || null;
  return {
    appName,
    // Empty titles stay null — UI should not invent "Untitled window" when the
    // app name already identifies the capture.
    windowTitle: title && title !== appName ? title : title || null,
    bundleId: null,
    processId: typeof w?.pid === "number" ? w.pid : null,
    windowId: typeof w?.window_id === "number" ? String(w.window_id) : null,
    x: typeof b?.x === "number" ? b.x : null,
    y: typeof b?.y === "number" ? b.y : null,
    width: typeof b?.width === "number" && b.width > 0 ? b.width : null,
    height: typeof b?.height === "number" && b.height > 0 ? b.height : null,
  };
}

/**
 * Merge System Events frontmost (authoritative app focus) with optional host
 * window row (bounds / window id / better title).
 */
export function mergeFrontmostIdentity(
  systemEvents: DesktopUseFrontmost | null,
  hostRow: HostWindowRow | null,
): DesktopUseFrontmost {
  const fromHost = hostWindowToFrontmost(hostRow);
  if (!systemEvents) return fromHost;

  const seApp = systemEvents.appName.trim() || "Unknown App";
  const hostApp = fromHost.appName.trim();
  const sameApp =
    hostRow != null &&
    hostApp.toLowerCase() === seApp.toLowerCase() &&
    (systemEvents.processId == null ||
      fromHost.processId == null ||
      systemEvents.processId === fromHost.processId);

  // App identity always from System Events when available (true focus).
  // Window title/bounds prefer host row when it matches the same app.
  const windowTitle =
    (sameApp && fromHost.windowTitle) ||
    systemEvents.windowTitle?.trim() ||
    null;

  return {
    appName: seApp,
    windowTitle:
      windowTitle && windowTitle !== seApp ? windowTitle : windowTitle || null,
    bundleId: systemEvents.bundleId ?? fromHost.bundleId,
    processId: systemEvents.processId ?? fromHost.processId,
    windowId: sameApp ? fromHost.windowId : systemEvents.windowId,
    x: sameApp && fromHost.x != null ? fromHost.x : systemEvents.x,
    y: sameApp && fromHost.y != null ? fromHost.y : systemEvents.y,
    width:
      sameApp && fromHost.width != null ? fromHost.width : systemEvents.width,
    height:
      sameApp && fromHost.height != null
        ? fromHost.height
        : systemEvents.height,
  };
}

/**
 * Read Atmos-normalized PNG from `drive screenshot` JSON.
 * Rust extracts engine shapes (MCP image / screenshot_file_path / --screenshot-out-file)
 * and injects `png_base64` / `capture.png_base64` — do not re-invent phantom engine keys.
 */
function extractPngBase64(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;

  // DriveResult.capture (Atmos CaptureResult)
  const capture = o.capture;
  if (capture && typeof capture === "object") {
    const c = capture as Record<string, unknown>;
    if (typeof c.png_base64 === "string" && c.png_base64.length > 32) {
      return c.png_base64;
    }
  }

  // DriveResult.result with Atmos-normalized png_base64
  const result = o.result;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.png_base64 === "string" && r.png_base64.length > 32) {
      return r.png_base64;
    }
  }

  if (typeof o.png_base64 === "string" && o.png_base64.length > 32) {
    return o.png_base64;
  }
  return null;
}

function extractWindows(payload: unknown): HostWindowRow[] {
  if (!payload || typeof payload !== "object") return [];
  const o = payload as Record<string, unknown>;
  const result = o.result;
  if (result && typeof result === "object") {
    const windows = (result as Record<string, unknown>).windows;
    if (Array.isArray(windows)) return windows as HostWindowRow[];
  }
  if (Array.isArray(o.windows)) return o.windows as HostWindowRow[];
  return [];
}

export type HostCaptureResult = {
  frontmost: DesktopUseFrontmost;
  png: Buffer | null;
  warnings: string[];
  contextMarkdown: string;
  quality: string;
  via: "host_engine";
};

/**
 * Capture through Atmos Desktop Use host engine (same TCC identity as control).
 *
 * Screenshot: host engine returns a **full-display** PNG (`get_desktop_state`).
 * AppShot then **crops to the focused window** when System Events bounds are
 * known (product: window-only snapshot, not the whole desktop).
 *
 * Identity: System Events frontmost (true focus). Optional host list_windows
 * enrich is **off by default** on the dual-shift hot path.
 */
export async function captureFrontmostViaHostEngine(options: {
  selfAppNames?: Set<string>;
  /** Reuse a frontmost identity already read for animation preflight. */
  systemFrontmost?: DesktopUseFrontmost | null;
  /**
   * When true, also call `drive verify` to enrich title/bounds.
   * Default false for dual-shift latency (System Events is enough for identity).
   */
  enrichFromWindowList?: boolean;
} = {}): Promise<HostCaptureResult> {
  const warnings: string[] = [];
  const selfNames =
    options.selfAppNames ??
    new Set(["Atmos", "Atmos Electron", "Atmos Desktop", "Electron"]);

  // 1) True focused app — System Events (or caller-provided, avoid double SE).
  let systemFrontmost: DesktopUseFrontmost | null =
    options.systemFrontmost ?? null;
  if (!systemFrontmost) {
    try {
      systemFrontmost = await desktopUseReadFrontmost();
    } catch (e) {
      warnings.push(
        `frontmost_identity_failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  // Capturing Atmos itself is allowed (e.g. product UI for agents) — no warning.

  // 2) Host screenshot (single CLI — dominant cost after animation).
  let shot: unknown;
  try {
    shot = await desktopUseDriveScreenshot();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`host engine screenshot failed: ${msg}`);
  }
  const shotOk = Boolean((shot as { ok?: boolean })?.ok);
  if (!shotOk) {
    const err =
      typeof (shot as { error?: string }).error === "string"
        ? (shot as { error: string }).error
        : "host engine screenshot failed";
    throw new Error(err);
  }

  let png: Buffer | null = null;
  const b64 = extractPngBase64(shot);
  if (b64) {
    try {
      png = Buffer.from(b64, "base64");
      if (png.length === 0) png = null;
    } catch {
      warnings.push("host_engine_png_decode_failed");
      png = null;
    }
  }
  if (!png) {
    throw new Error(
      typeof (shot as { error?: string }).error === "string"
        ? (shot as { error: string }).error
        : "host engine returned ok without screenshot image bytes",
    );
  }

  // 3) Resolve window bounds for crop + animation (all apps).
  // System Events AX is empty for many custom-UI apps; host list_windows still
  // has CG bounds — match by pid, then largest content window.
  let frontmost = await resolveFrontmostWithHostBounds(
    systemFrontmost,
    selfNames,
    warnings,
    options.enrichFromWindowList === true,
  );

  // 4) Window-only image: crop the host full-desktop PNG (Screen Recording is
  // on Atmos Desktop Use, not Electron). Do **not** prefer `screencapture -l`
  // here — that runs as Electron and often fails with
  // "could not create image from window" while still leaving a scary warning.
  if (png && png.length > 0) {
    const cropped = await cropHostPngToFrontmostWindow(
      png,
      frontmost,
      warnings,
    );
    if (cropped) {
      png = cropped;
    } else if (hasUsableWindowBounds(frontmost)) {
      // Soft region attempt only if crop failed; ignore failures silently when
      // we still have the full host PNG.
      const region = await tryRegionScreencapture(frontmost, /* quiet */ true);
      if (region) png = region;
    }
  }

  const hasPng = Boolean(png && png.length > 0);
  const keptFull =
    hasPng &&
    warnings.some(
      (w) =>
        w.includes("full-display") ||
        w.includes("full_display") ||
        w.includes("crop_skipped") ||
        w.includes("Unable to determine focused window bounds"),
    );
  const quality = hasPng
    ? keptFull
      ? "screenshot_only"
      : "window"
    : "metadata_only";
  const contextMarkdown = buildAppshotContextMarkdown(frontmost, warnings);

  return {
    frontmost,
    png,
    warnings,
    contextMarkdown,
    quality,
    via: "host_engine",
  };
}

/**
 * Universal bounds resolve for AppShot crop/animation:
 *
 * 1. Prefer System Events when it already has a large content window.
 * 2. Otherwise (empty AX tree, chrome-only windows, etc.) use host
 *    `drive verify` and pick by **pid** → largest content window ≥64px.
 *
 * Applies to every app, not a single product special-case.
 */
export async function resolveFrontmostWithHostBounds(
  systemFrontmost: DesktopUseFrontmost | null,
  selfNames: Set<string>,
  warnings: string[],
  forceList = false,
): Promise<DesktopUseFrontmost> {
  // Always consult host list when SE lacks a usable content rect.
  const needList = forceList || !hasUsableWindowBounds(systemFrontmost);

  if (!needList) {
    return systemFrontmost ?? hostWindowToFrontmost(null);
  }

  let windows: HostWindowRow[] = [];
  try {
    const listed = await desktopUseDriveVerify();
    windows = extractWindows(listed);
  } catch (e) {
    warnings.push(
      `host_list_windows_failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return systemFrontmost ?? hostWindowToFrontmost(null);
  }

  let hostRow: HostWindowRow | null = null;
  if (systemFrontmost) {
    hostRow = matchWindowForFrontmost(windows, systemFrontmost, selfNames);
  }
  if (!hostRow) {
    hostRow = pickFrontmostWindow(windows, { selfAppNames: selfNames });
  }
  return mergeFrontmostIdentity(systemFrontmost, hostRow);
}

function hasUsableWindowBounds(
  fm: DesktopUseFrontmost | null | undefined,
): boolean {
  return (
    fm != null &&
    fm.x != null &&
    fm.y != null &&
    fm.width != null &&
    fm.height != null &&
    fm.width >= 64 &&
    fm.height >= 64
  );
}

/** Optional window-region capture when host crop cannot map bounds. */
async function tryRegionScreencapture(
  frontmost: DesktopUseFrontmost,
  quiet = false,
): Promise<Buffer | null> {
  if (!hasUsableWindowBounds(frontmost)) return null;
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { readFileSync, unlinkSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { randomUUID } = await import("node:crypto");
    const execFileAsync = promisify(execFile);
    const out = join(tmpdir(), `atmos-appshot-region-${randomUUID()}.png`);
    const rect = `${frontmost.x},${frontmost.y},${frontmost.width},${frontmost.height}`;
    try {
      await execFileAsync("screencapture", ["-x", "-R", rect, out], {
        timeout: 8_000,
      });
      if (!existsSync(out)) return null;
      const buf = readFileSync(out);
      return buf.length > 0 ? buf : null;
    } finally {
      try {
        if (existsSync(out)) unlinkSync(out);
      } catch {
        /* ignore */
      }
    }
  } catch {
    // Electron often lacks Screen Recording; host PNG + crop is the real path.
    void quiet;
    return null;
  }
}

/**
 * Crop full-desktop host PNG to the frontmost window when bounds are known.
 * Returns cropped bytes, or null when crop is impossible (caller keeps full PNG).
 */
export async function cropHostPngToFrontmostWindow(
  png: Buffer,
  frontmost: DesktopUseFrontmost,
  warnings: string[],
): Promise<Buffer | null> {
  if (!hasUsableWindowBounds(frontmost)) {
    warnings.push(
      "Unable to determine focused window bounds; kept full-display capture.",
    );
    return null;
  }

  const bounds: LogicalBounds = {
    x: frontmost.x!,
    y: frontmost.y!,
    width: frontmost.width!,
    height: frontmost.height!,
  };

  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  let pngW = 0;
  let pngH = 0;
  let dir: string | null = null;
  try {
    dir = mkdtempSync(join(tmpdir(), "atmos-appshot-geom-"));
    const probe = join(dir, "probe.png");
    writeFileSync(probe, png);
    const { stdout } = await execFileAsync(
      "sips",
      ["-g", "pixelWidth", "-g", "pixelHeight", probe],
      { timeout: 3_000 },
    );
    const wMatch = /pixelWidth:\s*(\d+)/.exec(stdout);
    const hMatch = /pixelHeight:\s*(\d+)/.exec(stdout);
    pngW = wMatch ? Number(wMatch[1]) : 0;
    pngH = hMatch ? Number(hMatch[1]) : 0;
  } catch {
    warnings.push("window_crop_probe_failed; kept full-display capture.");
    return null;
  } finally {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  if (pngW < 32 || pngH < 32) {
    warnings.push("window_crop_invalid_png_size; kept full-display capture.");
    return null;
  }

  let display = null as ReturnType<typeof displayMetricsFromElectronScreen>;
  try {
    const { screen } = await import("electron");
    display = displayMetricsFromElectronScreen(
      { x: bounds.x, y: bounds.y },
      screen,
    );
  } catch {
    // Non-electron (tests): infer 1× or 2× from PNG aspect vs common logical sizes.
    const scale =
      pngW >= 2000 && pngH >= 1200 ? 2 : 1;
    display = {
      x: 0,
      y: 0,
      width: Math.round(pngW / scale),
      height: Math.round(pngH / scale),
      scaleFactor: scale,
    };
  }
  if (!display) {
    warnings.push("window_crop_no_display; kept full-display capture.");
    return null;
  }

  const rect = computeWindowCropPixels(bounds, pngW, pngH, display);
  if (!rect) {
    warnings.push(
      "window_crop_skipped: window bounds not mappable to display screenshot.",
    );
    return null;
  }

  const cropped = await cropPngBytesToRect(png, rect);
  if (!cropped || cropped.length === 0) {
    warnings.push("window_crop_failed; kept full-display capture.");
    return null;
  }
  return cropped;
}

/** Cache host-vs-electron route — dual-shift must not spawn `status` every chord. */
let routeCache: { at: number; route: "host_engine" | "electron_fallback" } | null =
  null;
const ROUTE_CACHE_MS = 30_000;

export function invalidateAppShotCaptureRouteCache(): void {
  routeCache = null;
}

/**
 * Resolve whether AppShot should use host engine for this capture.
 * Cached for {@link ROUTE_CACHE_MS}; fail-open to electron_fallback.
 */
export async function resolveAppShotCaptureRoute(): Promise<
  "host_engine" | "electron_fallback"
> {
  const now = Date.now();
  if (routeCache && now - routeCache.at < ROUTE_CACHE_MS) {
    return routeCache.route;
  }
  try {
    const st = await desktopUseStatus();
    const route = shouldUseHostEngineCapture(st)
      ? "host_engine"
      : "electron_fallback";
    routeCache = { at: now, route };
    return route;
  } catch {
    routeCache = { at: now, route: "electron_fallback" };
    return "electron_fallback";
  }
}
