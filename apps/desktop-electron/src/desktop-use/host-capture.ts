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
  if (opts.selfNames.has(app)) return -Infinity;

  const area = windowArea(w);
  if (area > 0 && area < MIN_WINDOW_AREA) return -Infinity;

  let score = 0;
  const z = typeof w.z_index === "number" ? w.z_index : 0;
  score += z;

  if (opts.anyOnScreen) {
    if (w.is_on_screen) score += 1_000_000;
    else score -= 500_000;
  }

  if (opts.preferPid != null && w.pid === opts.preferPid) score += 5_000_000;
  if (
    opts.preferApp &&
    app.toLowerCase() === opts.preferApp.trim().toLowerCase()
  ) {
    score += 2_000_000;
  }

  const title = (w.title ?? "").trim();
  if (title) score += 50_000;
  // Prefer larger real windows when z-order is noisy.
  score += Math.min(area, 5_000_000) / 1000;

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
 * Screenshot: host engine (full display PNG).
 * Identity: System Events frontmost (true focus), enriched by host window list.
 */
export async function captureFrontmostViaHostEngine(options: {
  selfAppNames?: Set<string>;
} = {}): Promise<HostCaptureResult> {
  const warnings: string[] = [];
  const selfNames =
    options.selfAppNames ??
    new Set(["Atmos", "Atmos Electron", "Atmos Desktop", "Electron"]);

  // 1) True focused app — System Events via Electron (pre-screenshot).
  // Host list_windows z-order is noisy (utility overlays, is_on_screen false).
  let systemFrontmost: DesktopUseFrontmost | null = null;
  try {
    systemFrontmost = await desktopUseReadFrontmost();
    if (selfNames.has(systemFrontmost.appName.trim())) {
      warnings.push(
        `${systemFrontmost.appName} is frontmost; focus another app and trigger Appshots again.`,
      );
    }
  } catch (e) {
    warnings.push(
      `frontmost_identity_failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // 2) Host screenshot
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

  // 3) Host window list — enrich bounds / title for the focused app.
  let windows: HostWindowRow[] = [];
  try {
    const listed = await desktopUseDriveVerify();
    windows = extractWindows(listed);
  } catch (e) {
    warnings.push(
      `host_list_windows_failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let hostRow: HostWindowRow | null = null;
  if (systemFrontmost) {
    hostRow = matchWindowForFrontmost(windows, systemFrontmost, selfNames);
  }
  if (!hostRow) {
    hostRow = pickFrontmostWindow(windows, { selfAppNames: selfNames });
  }

  const frontmost = mergeFrontmostIdentity(systemFrontmost, hostRow);
  const hasPng = Boolean(png && png.length > 0);
  const quality = hasPng ? "screenshot_only" : "metadata_only";
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
 * Resolve whether AppShot should use host engine for this capture.
 */
export async function resolveAppShotCaptureRoute(): Promise<
  "host_engine" | "electron_fallback"
> {
  try {
    const st = await desktopUseStatus();
    return shouldUseHostEngineCapture(st) ? "host_engine" : "electron_fallback";
  } catch {
    return "electron_fallback";
  }
}
