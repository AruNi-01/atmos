/**
 * Pure frontmost-window scoring / identity merge for host engine capture.
 * IO (drive calls, PNG crop) stays in host-capture.ts.
 */

import type {
  DesktopUseFrontmost,
  DesktopUseStatusJson,
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

function hasCompleteBounds(fm: {
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
}): boolean {
  return (
    fm.x != null &&
    fm.y != null &&
    fm.width != null &&
    fm.height != null &&
    fm.width >= 64 &&
    fm.height >= 64
  );
}

/**
 * Merge focus identity (CG / System Events) with host window row geometry.
 *
 * **Critical:** match by **pid** (or loose app name). Do not require exact
 * app_name equality — SE/NSWorkspace often say "QQMusic" while host list says
 * "QQ音乐"; strict name match previously dropped host bounds and killed crop +
 * border/fly animations.
 *
 * Geometry is atomic (x/y/w/h together). Never take host width/height while
 * leaving SE null x/y — that fails hasUsableWindowBounds and both crop + anim.
 */
export function mergeFrontmostIdentity(
  systemEvents: DesktopUseFrontmost | null,
  hostRow: HostWindowRow | null,
): DesktopUseFrontmost {
  const fromHost = hostWindowToFrontmost(hostRow);
  if (!systemEvents) return fromHost;

  const seApp = systemEvents.appName.trim() || "Unknown App";
  const hostApp = fromHost.appName.trim();
  const samePid =
    hostRow != null &&
    systemEvents.processId != null &&
    fromHost.processId != null &&
    systemEvents.processId === fromHost.processId;
  const sameName =
    hostRow != null && appNamesLooselyEqual(hostApp, seApp);
  // Trust host rect when pid matches OR names loosely match.
  const trustHostRow = samePid || sameName;
  const hostHas = hasCompleteBounds(fromHost);
  const seHas = hasCompleteBounds(systemEvents);
  const useHostGeometry = trustHostRow && hostHas;

  const windowTitle =
    (trustHostRow && fromHost.windowTitle) ||
    systemEvents.windowTitle?.trim() ||
    null;

  // Prefer SE/CG app label for product identity; keep host geometry as a unit.
  return {
    appName: seApp,
    windowTitle:
      windowTitle && windowTitle !== seApp ? windowTitle : windowTitle || null,
    bundleId: systemEvents.bundleId ?? fromHost.bundleId,
    processId: systemEvents.processId ?? fromHost.processId,
    windowId: useHostGeometry
      ? fromHost.windowId ?? systemEvents.windowId
      : systemEvents.windowId ?? fromHost.windowId,
    x: useHostGeometry ? fromHost.x : seHas ? systemEvents.x : null,
    y: useHostGeometry ? fromHost.y : seHas ? systemEvents.y : null,
    width: useHostGeometry ? fromHost.width : seHas ? systemEvents.width : null,
    height: useHostGeometry
      ? fromHost.height
      : seHas
        ? systemEvents.height
        : null,
  };
}

/**
 * Read Atmos-normalized PNG from `drive screenshot` JSON.
 * Rust extracts engine shapes (MCP image / screenshot_file_path / --screenshot-out-file)
 * and injects `png_base64` / `capture.png_base64` — do not re-invent phantom engine keys.
 */
