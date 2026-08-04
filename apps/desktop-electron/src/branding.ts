/**
 * Product name + icon branding for the Electron shell (APP-045).
 * Reuses the same assets as production Tauri (`apps/desktop/src-tauri/icons`).
 */

import {
  app,
  nativeImage,
  type BrowserWindowConstructorOptions,
  type NativeImage,
} from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "./runtime/ensure.js";
import {
  APP_ID,
  APP_PRODUCT_NAME,
  resolveAppIcons,
  type ResolvedAppIcons,
} from "./branding-paths.js";

export { APP_ID, APP_PRODUCT_NAME, resolveAppIcons, resolveIconFile } from "./branding-paths.js";
export type { ResolvedAppIcons } from "./branding-paths.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Candidate roots for icon assets (first hit wins per file name).
 * - packaged: process.resourcesPath/icons
 * - local package resources (synced at build)
 * - monorepo Tauri icons (shared asset source in monorepo)
 */
export function iconSearchRoots(): string[] {
  const roots: string[] = [];
  const resourcesPath =
    typeof process.resourcesPath === "string" ? process.resourcesPath : "";
  if (resourcesPath) {
    roots.push(join(resourcesPath, "icons"));
    roots.push(join(resourcesPath, "app.asar.unpacked", "resources", "icons"));
  }
  // dist/ → ../resources/icons ; src/ → ../resources/icons
  roots.push(join(__dirname, "..", "resources", "icons"));
  roots.push(join(REPO_ROOT, "apps/desktop-electron/resources/icons"));
  roots.push(join(REPO_ROOT, "apps/desktop/src-tauri/icons"));
  return roots;
}

let cachedWindowIcon: NativeImage | null | undefined;
let cachedIcons: ResolvedAppIcons | null = null;

export function getResolvedAppIcons(): ResolvedAppIcons {
  if (!cachedIcons) cachedIcons = resolveAppIcons(iconSearchRoots());
  return cachedIcons;
}

/** NativeImage for BrowserWindow / dock, or null if assets are missing. */
export function getWindowIconImage(): NativeImage | null {
  if (cachedWindowIcon !== undefined) return cachedWindowIcon;
  const { windowIconPath } = getResolvedAppIcons();
  if (!windowIconPath) {
    cachedWindowIcon = null;
    return null;
  }
  try {
    const image = nativeImage.createFromPath(windowIconPath);
    cachedWindowIcon = image.isEmpty() ? null : image;
  } catch {
    cachedWindowIcon = null;
  }
  return cachedWindowIcon;
}

/**
 * Spread into BrowserWindow options: title + icon when available.
 */
export function appWindowBranding(
  title: string = APP_PRODUCT_NAME,
): Pick<BrowserWindowConstructorOptions, "title" | "icon"> {
  const icon = getWindowIconImage();
  return icon ? { title, icon } : { title };
}

/**
 * Call as early as possible (before app.ready) so the menu / process name
 * show Atmos instead of "Electron".
 */
export function applyEarlyAppBranding(): void {
  try {
    app.setName(APP_PRODUCT_NAME);
  } catch {
    /* ignore */
  }
  if (process.platform === "win32") {
    try {
      app.setAppUserModelId(APP_ID);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Call after app.whenReady(): dock icon, about panel, logging.
 */
export function applyReadyAppBranding(): void {
  const icons = getResolvedAppIcons();
  console.log(
    `[desktop-electron] branding name=${APP_PRODUCT_NAME} id=${APP_ID}` +
      ` windowIcon=${icons.windowIconPath ?? "(missing)"}` +
      ` dockIcon=${icons.dockIconPath ?? "(missing)"}`,
  );

  // Packaged Atmos.app already has CFBundleIconFile (icon.icns). Runtime
  // dock.setIcon has been observed to leave a zero-width Dock tile on
  // Electron 37 / recent macOS — only setIcon for unpackaged / dev shells.
  // Prefer PNG over .icns for sharp Retina tiles when setIcon is used.
  if (process.platform === "darwin" && app.dock && !app.isPackaged) {
    const dockPath =
      icons.pngPath ?? icons.dockIconPath ?? icons.windowIconPath;
    if (dockPath) {
      try {
        let image = nativeImage.createFromPath(dockPath);
        if (!image.isEmpty()) {
          const size = image.getSize();
          if (size.width >= 512 && size.height >= 512) {
            image = image.resize({ width: 512, height: 512, quality: "best" });
          }
          app.dock.setIcon(image);
        }
      } catch (e) {
        console.warn("[desktop-electron] dock.setIcon failed", e);
      }
    }
  }

  try {
    app.setAboutPanelOptions({
      applicationName: APP_PRODUCT_NAME,
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: "Atmos",
    });
  } catch {
    /* ignore */
  }
}
