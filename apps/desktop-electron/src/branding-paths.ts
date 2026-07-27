/**
 * Pure icon path resolution (no Electron imports) for unit tests + branding.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * User-visible product name for the Electron shell.
 * Distinct from production Tauri (`Atmos` / com.atmos.desktop) so dual installs
 * and release artifacts never collide (APP-045 M8).
 */
export const APP_PRODUCT_NAME = "Atmos Electron";

/** Reverse-DNS id for the Electron shell only. */
export const APP_ID = "com.atmos.desktop.electron";

export function resolveIconFile(
  fileName: string,
  roots: readonly string[],
): string | null {
  for (const root of roots) {
    const p = join(root, fileName);
    if (existsSync(p)) return p;
  }
  return null;
}

export type ResolvedAppIcons = {
  /** Best path for BrowserWindow.icon (png/ico preferred). */
  windowIconPath: string | null;
  /** macOS dock / .icns when available. */
  dockIconPath: string | null;
  pngPath: string | null;
  icoPath: string | null;
  icnsPath: string | null;
};

export function resolveAppIcons(
  roots: readonly string[],
  platform: NodeJS.Platform = process.platform,
): ResolvedAppIcons {
  const pngPath = resolveIconFile("icon.png", roots);
  const icoPath = resolveIconFile("icon.ico", roots);
  const icnsPath = resolveIconFile("icon.icns", roots);
  const hiResPng =
    resolveIconFile("128x128@2x.png", roots) ??
    resolveIconFile("128x128.png", roots) ??
    pngPath;

  let windowIconPath: string | null = null;
  if (platform === "win32") {
    windowIconPath = icoPath ?? pngPath ?? hiResPng;
  } else if (platform === "darwin") {
    windowIconPath = pngPath ?? hiResPng ?? icnsPath;
  } else {
    windowIconPath = pngPath ?? hiResPng ?? icoPath;
  }

  const dockIconPath =
    platform === "darwin"
      ? icnsPath ?? pngPath ?? hiResPng
      : windowIconPath;

  return {
    windowIconPath,
    dockIconPath,
    pngPath,
    icoPath,
    icnsPath,
  };
}
