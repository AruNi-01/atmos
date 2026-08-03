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

function extractPngBase64(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const result = o.result;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    for (const key of [
      "screenshot_base64",
      "png_base64",
      "image_base64",
      "screenshot",
    ]) {
      const v = r[key];
      if (typeof v === "string" && v.length > 32) return v;
    }
    // nested screenshot object
    const shot = r.screenshot;
    if (shot && typeof shot === "object") {
      const s = shot as Record<string, unknown>;
      for (const key of ["base64", "png_base64", "data"]) {
        const v = s[key];
        if (typeof v === "string" && v.length > 32) return v;
      }
    }
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

  const shot = await desktopUseDriveScreenshot();
  if (!(shot as { ok?: boolean })?.ok) {
    const err =
      typeof (shot as { error?: string }).error === "string"
        ? (shot as { error: string }).error
        : "host engine screenshot failed";
    warnings.push(err);
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
  } else {
    warnings.push("host_engine_screenshot_missing");
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
