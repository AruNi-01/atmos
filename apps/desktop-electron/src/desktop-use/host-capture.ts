/**
 * Host-engine capture path — runs under Atmos Desktop Use.app TCC identity.
 *
 * When the control engine is installed, AppShot MUST use this path so Screen
 * Recording / Accessibility grants target the same host as control (not Electron).
 */

import {
  appNamesLooselyEqual,
  hostWindowToFrontmost,
  matchWindowForFrontmost,
  mergeFrontmostIdentity,
  pickFrontmostWindow,
  shouldUseHostEngineCapture,
  type HostWindowRow,
} from "./host-window-match.js";
export type { HostWindowRow } from "./host-window-match.js";
export {
  appNamesLooselyEqual,
  hostWindowToFrontmost,
  matchWindowForFrontmost,
  mergeFrontmostIdentity,
  pickFrontmostWindow,
  shouldUseHostEngineCapture,
} from "./host-window-match.js";

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

function extractPngBase64(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;

  // Atmos normalizes engine payloads and injects `png_base64` / `capture.png_base64` — do not re-invent phantom engine keys.
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
  // DriveResult.detail is a JSON string mirror of result (agents / older CLI).
  const detail = o.detail;
  if (typeof detail === "string" && detail.includes("windows")) {
    try {
      const inner = JSON.parse(detail) as { windows?: HostWindowRow[] };
      if (Array.isArray(inner.windows)) return inner.windows;
    } catch {
      /* ignore */
    }
  }
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
  // has CG bounds — match by **pid**, then largest content window.
  // Always list when geometry is incomplete (do not rely only on caller flag).
  let frontmost = await resolveFrontmostWithHostBounds(
    systemFrontmost,
    selfNames,
    warnings,
    options.enrichFromWindowList === true ||
      !hasUsableWindowBounds(systemFrontmost),
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
    // import("electron") can succeed outside a real app (null screen APIs).
    if (screen && typeof screen.getDisplayNearestPoint === "function") {
      display = displayMetricsFromElectronScreen(
        { x: bounds.x, y: bounds.y },
        screen,
      );
    }
  } catch {
    /* fall through to PNG-inferred display */
  }
  if (!display) {
    // Infer logical display from PNG (Retina 2× when long edge ≥ 2000).
    const scale = pngW >= 2000 && pngH >= 1200 ? 2 : 1;
    display = {
      x: 0,
      y: 0,
      width: Math.round(pngW / scale),
      height: Math.round(pngH / scale),
      scaleFactor: scale,
    };
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
