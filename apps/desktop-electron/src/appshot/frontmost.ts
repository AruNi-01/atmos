/**
 * AppShot frontmost capture adapter (APP-052).
 *
 * When the control engine is installed, capture runs under **Atmos Desktop Use**
 * host identity (same TCC as control). Only if the engine is not installed do we
 * fall back to Electron in-process capture.
 */

import {
  buildAppshotContextMarkdown,
  desktopUseCaptureInProcess,
  desktopUseReadFrontmost,
  parseFrontmostScriptOutput as parseDu,
  type DesktopUseFrontmost,
} from "../desktop-use/capture.js";
import {
  captureFrontmostViaHostEngine,
  resolveAppShotCaptureRoute,
} from "../desktop-use/host-capture.js";

export type FrontmostWindow = DesktopUseFrontmost;

export type FrontmostCaptureResult = {
  frontmost: FrontmostWindow;
  png: Buffer | null;
  warnings: string[];
  contextMarkdown: string;
  quality: string;
  /** Which capture identity was used (for diagnostics / tests). */
  via?: "host_engine" | "electron_fallback";
};

const SELF_APP_NAMES = new Set([
  "Atmos",
  "Atmos Electron",
  "Atmos Desktop",
  "Electron",
]);

/**
 * Metadata-only frontmost read.
 * When host engine is installed, prefer list_windows (host TCC); else Electron.
 */
export async function readFrontmostWindow(): Promise<FrontmostWindow> {
  const route = await resolveAppShotCaptureRoute();
  if (route === "host_engine") {
    try {
      const cap = await captureFrontmostViaHostEngine({
        selfAppNames: SELF_APP_NAMES,
      });
      return cap.frontmost;
    } catch {
      /* fall through */
    }
  }
  return desktopUseReadFrontmost();
}

/**
 * Full AppShot capture — host engine when installed (unified TCC), else Electron.
 */
export async function captureFrontmostWindow(
  options: { selfAppNames?: Set<string> } = {},
): Promise<FrontmostCaptureResult> {
  const selfNames = options.selfAppNames ?? SELF_APP_NAMES;
  const route = await resolveAppShotCaptureRoute();

  if (route === "host_engine") {
    try {
      const host = await captureFrontmostViaHostEngine({ selfAppNames: selfNames });
      return {
        frontmost: host.frontmost,
        png: host.png,
        warnings: host.warnings,
        contextMarkdown: host.contextMarkdown,
        quality: host.quality,
        via: "host_engine",
      };
    } catch (e) {
      // Hard failure on host path is still preferred over silent Electron TCC split —
      // surface the error as warnings with empty png rather than dual-identity capture.
      const msg = e instanceof Error ? e.message : String(e);
      const frontmost: FrontmostWindow = {
        appName: "Unknown App",
        windowTitle: null,
        bundleId: null,
        processId: null,
        windowId: null,
        x: null,
        y: null,
        width: null,
        height: null,
      };
      return {
        frontmost,
        png: null,
        warnings: [
          `host_engine_capture_failed: ${msg}`,
          "Grant Accessibility and Screen Recording for Atmos Desktop Use, then retry.",
        ],
        contextMarkdown: buildAppshotContextMarkdown(frontmost, [
          `host_engine_capture_failed: ${msg}`,
        ]),
        quality: "metadata_only",
        via: "host_engine",
      };
    }
  }

  // Engine not installed: Electron in-process (pre-ensure installs only).
  const result = await desktopUseCaptureInProcess({ selfAppNames: selfNames });
  const quality =
    result.png && result.png.length > 0 ? "screenshot_only" : "metadata_only";
  return {
    frontmost: result.frontmost,
    png: result.png,
    warnings: result.warnings,
    contextMarkdown: result.contextMarkdown,
    quality,
    via: "electron_fallback",
  };
}

export function buildContextMarkdown(
  frontmost: FrontmostWindow,
  warnings: string[],
): string {
  return buildAppshotContextMarkdown(frontmost, warnings);
}

/** Pure helper for tests — build FrontmostWindow from script stdout. */
export function parseFrontmostScriptOutput(stdout: string): FrontmostWindow {
  return parseDu(stdout);
}
