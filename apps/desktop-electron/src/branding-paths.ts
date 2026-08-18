/**
 * Pure icon path resolution (no Electron imports) for unit tests + branding.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * User-visible product name for the production desktop shell.
 * Users should not need to know the framework (Electron).
 */
export const APP_PRODUCT_NAME = "Atmos";

/** Reverse-DNS id for the production desktop shell (primary). */
export const APP_ID = "com.atmos.desktop";

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

/**
 * Default system-notification content icon (left side of macOS banners).
 * Prefer the 256px brand plate so Electron does not fall back to a stale
 * cached app identity icon from an older Atmos install.
 */
export function resolveDefaultNotificationIcon(
  roots: readonly string[],
): string | null {
  return (
    resolveIconFile("128x128@2x.png", roots) ??
    resolveIconFile("notification-icon.png", roots) ??
    resolveIconFile("icon.png", roots)
  );
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

  // Dock: prefer high-res PNG. Electron's nativeImage.createFromPath(.icns)
  // often loads only a low-res representation, which then appears as a tiny
  // glyph centered in the macOS Dock tile. Bundle CFBundleIconFile can still
  // use .icns for Finder / Get Info.
  const dockIconPath =
    platform === "darwin"
      ? pngPath ?? hiResPng ?? icnsPath
      : windowIconPath;

  return {
    windowIconPath,
    dockIconPath,
    pngPath,
    icoPath,
    icnsPath,
  };
}
