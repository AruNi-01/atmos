/**
 * Host-engine capture path — runs under Atmos Desktop Use.app TCC identity.
 *
 * When the control engine is installed, AppShot MUST use this path so Screen
 * Recording / Accessibility grants target the same host as control (not Electron).
 */

import {
  buildAppshotContextMarkdown,
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

/** Pure: use host engine capture iff control engine is installed. */
export function shouldUseHostEngineCapture(
  status: Pick<DesktopUseStatusJson, "driver"> | null | undefined,
): boolean {
  return Boolean(status?.driver?.installed);
}

/**
 * Pick a frontmost-like window for AppShot context.
 * Prefer on-screen windows with highest z_index; fall back to any with max z.
 */
export function pickFrontmostWindow(
  windows: HostWindowRow[],
): HostWindowRow | null {
  if (!windows.length) return null;
  const onScreen = windows.filter((w) => w.is_on_screen);
  const pool = onScreen.length ? onScreen : windows;
  let best: HostWindowRow | null = null;
  let bestZ = -Infinity;
  for (const w of pool) {
    const z = typeof w.z_index === "number" ? w.z_index : -1;
    if (z >= bestZ) {
      bestZ = z;
      best = w;
    }
  }
  return best;
}

export function hostWindowToFrontmost(w: HostWindowRow | null): DesktopUseFrontmost {
  const b = w?.bounds;
  return {
    appName: (w?.app_name ?? "Unknown App").trim() || "Unknown App",
    windowTitle: w?.title?.trim() || null,
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
 */
export async function captureFrontmostViaHostEngine(options: {
  selfAppNames?: Set<string>;
} = {}): Promise<HostCaptureResult> {
  const warnings: string[] = [];
  const selfNames =
    options.selfAppNames ??
    new Set(["Atmos", "Atmos Electron", "Atmos Desktop", "Electron"]);

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
    // Structured engine/TCC failure — do not soft-empty the shot as success.
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
    // DriveResult.ok true without PNG should not happen after Rust adapter;
    // surface as hard failure so AppShot does not store empty host captures.
    throw new Error(
      typeof (shot as { error?: string }).error === "string"
        ? (shot as { error: string }).error
        : "host engine returned ok without screenshot image bytes",
    );
  }

  let windows: HostWindowRow[] = [];
  try {
    const listed = await desktopUseDriveVerify();
    windows = extractWindows(listed);
  } catch (e) {
    warnings.push(
      `host_list_windows_failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Prefer non-self frontmost when possible
  let pick = pickFrontmostWindow(windows);
  if (pick && selfNames.has((pick.app_name ?? "").trim())) {
    const others = windows.filter(
      (w) => !selfNames.has((w.app_name ?? "").trim()),
    );
    pick = pickFrontmostWindow(others) ?? pick;
    if (selfNames.has((pick.app_name ?? "").trim())) {
      warnings.push(
        `${pick.app_name} is frontmost; focus another app and trigger Appshots again.`,
      );
    }
  }

  const frontmost = hostWindowToFrontmost(pick);
  const hasPng = Boolean(png && png.length > 0);
  const quality = hasPng ? "screenshot_only" : "metadata_only";
  // Tag context so records show host identity (Atmos Desktop Use).
  const hostWarnings = [
    ...warnings,
    "capture_via: Atmos Desktop Use host engine",
  ];
  const contextMarkdown = buildAppshotContextMarkdown(frontmost, hostWarnings);

  return {
    frontmost,
    png,
    warnings: hostWarnings,
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
