/**
 * macOS TCC grants for the Atmos.app identity (not Desktop Use).
 *
 * Never pass prompt=true to the Accessibility trust check — that shows the
 * lock dialog at an arbitrary time. Open System Settings and the drag-to-list
 * overlay instead, and only when a feature needs the grant (first ⌘⇧3–6,
 * Settings → Privacy Grant).
 */

import { existsSync } from "node:fs";
import type { BrowserWindow } from "electron";
import { APP_PRODUCT_NAME } from "./branding-paths.js";
import {
  GRANT_PANEL_WIDTH,
  grantPanelHeight,
  showAccessibilityGrantOverlay,
  type GrantOverlayPurpose,
  type GrantOverlayReason,
} from "./desktop-use/grant-overlay.js";
import { mainLog } from "./main-log.js";
import {
  grantOverlaySourceOriginFromAnchor,
  leftSidebarGrantOrigin,
  resolveAtmosAppBundlePath as resolveAtmosAppBundlePathFromExec,
  type ViewportAnchor,
} from "./macos-app-permission-geometry.js";

export type { ViewportAnchor } from "./macos-app-permission-geometry.js";
export {
  grantOverlaySourceOriginFromAnchor,
  leftSidebarGrantOrigin,
  parseViewportAnchor,
} from "./macos-app-permission-geometry.js";

export type MacosAppPermissionName = "accessibility" | "screen_recording";

export type MacosAppPermissionsStatus = {
  supported: boolean;
  platform: NodeJS.Platform;
  app_name: string;
  app_path: string | null;
  accessibility: boolean;
  screen_recording: boolean;
};

const PRIVACY_URLS: Record<GrantOverlayPurpose, string> = {
  accessibility:
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  screen_recording:
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
};

export function resolveAtmosAppBundlePath(
  execPath: string = process.execPath,
  platform: NodeJS.Platform = process.platform,
): string | null {
  return resolveAtmosAppBundlePathFromExec(execPath, platform);
}

export async function queryAtmosAppPermissions(): Promise<MacosAppPermissionsStatus> {
  const app_path = resolveAtmosAppBundlePath();
  if (process.platform !== "darwin") {
    return {
      supported: false,
      platform: process.platform,
      app_name: APP_PRODUCT_NAME,
      app_path,
      accessibility: false,
      screen_recording: false,
    };
  }
  try {
    const { systemPreferences } = await import("electron");
    const accessibility = Boolean(
      systemPreferences.isTrustedAccessibilityClient(false),
    );
    const screenStatus = systemPreferences.getMediaAccessStatus("screen");
    return {
      supported: true,
      platform: "darwin",
      app_name: APP_PRODUCT_NAME,
      app_path,
      accessibility,
      screen_recording: screenStatus === "granted",
    };
  } catch {
    return {
      supported: true,
      platform: "darwin",
      app_name: APP_PRODUCT_NAME,
      app_path,
      accessibility: false,
      screen_recording: false,
    };
  }
}

export async function openMacosPrivacyPane(
  purpose: GrantOverlayPurpose,
): Promise<void> {
  const { shell } = await import("electron");
  await shell.openExternal(PRIVACY_URLS[purpose]);
}

export async function grantAtmosAppPermission(opts: {
  target: MacosAppPermissionName;
  locale?: string;
  anchor?: ViewportAnchor;
  hostWindow?: BrowserWindow | null;
  reason?: GrantOverlayReason;
  /** Screen origin for the fly. Overrides anchor when set. */
  sourceOrigin?: { x: number; y: number };
  /**
   * `after` = show the card first (left sidebar), then open Settings and fly.
   * Default `before` matches Settings → Privacy Grant.
   */
  openSettings?: "before" | "after";
  holdAtOriginMs?: number;
}): Promise<{
  ok: boolean;
  app_path: string | null;
  app_name: string;
  purpose: GrantOverlayPurpose;
  drag_overlay?: { ok: boolean; error?: string };
  error?: string;
}> {
  const purpose: GrantOverlayPurpose =
    opts.target === "screen_recording" ? "screen_recording" : "accessibility";
  const appPath = resolveAtmosAppBundlePath();
  const appName = APP_PRODUCT_NAME;

  if (process.platform !== "darwin") {
    return {
      ok: false,
      app_path: appPath,
      app_name: appName,
      purpose,
      error: "macOS only",
    };
  }

  const openSettings = opts.openSettings === "after" ? "after" : "before";
  if (openSettings === "before") {
    try {
      await openMacosPrivacyPane(purpose);
    } catch (error) {
      mainLog(
        `[macos-app-permissions] open pane failed: ${error instanceof Error ? error.message : String(error)}`,
        "warn",
      );
    }
  }

  if (!appPath || !existsSync(appPath)) {
    mainLog(
      `[macos-app-permissions] Atmos.app path missing exec=${process.execPath}`,
      "warn",
    );
    return {
      ok: false,
      app_path: appPath,
      app_name: appName,
      purpose,
      error: "Atmos.app path missing",
    };
  }

  const hasReason = Boolean(opts.reason);
  const panelW = GRANT_PANEL_WIDTH;
  const panelH = grantPanelHeight(hasReason);
  let sourceOrigin: { x: number; y: number } | undefined =
    opts.sourceOrigin &&
    Number.isFinite(opts.sourceOrigin.x) &&
    Number.isFinite(opts.sourceOrigin.y)
      ? {
          x: Math.round(opts.sourceOrigin.x),
          y: Math.round(opts.sourceOrigin.y),
        }
      : undefined;
  if (
    !sourceOrigin &&
    opts.anchor &&
    opts.hostWindow &&
    !opts.hostWindow.isDestroyed()
  ) {
    try {
      const cb = opts.hostWindow.getContentBounds();
      sourceOrigin = grantOverlaySourceOriginFromAnchor(
        cb,
        opts.anchor,
        panelW,
        panelH,
      );
    } catch {
      /* overlay falls back to Atmos window center */
    }
  }
  if (!sourceOrigin && opts.reason === "host_shortcuts") {
    const host =
      opts.hostWindow && !opts.hostWindow.isDestroyed() ? opts.hostWindow : null;
    if (host) {
      try {
        sourceOrigin = leftSidebarGrantOrigin(host.getContentBounds(), panelH);
      } catch {
        /* fly origin falls back */
      }
    }
  }

  const overlay = showAccessibilityGrantOverlay({
    hostAppPath: appPath,
    hostAppName: appName,
    locale: opts.locale,
    purpose,
    sourceOrigin,
    reason: opts.reason,
    holdAtOriginMs: opts.holdAtOriginMs,
    afterHold:
      openSettings === "after"
        ? () => openMacosPrivacyPane(purpose)
        : undefined,
  });
  return {
    ok: overlay.ok,
    app_path: appPath,
    app_name: appName,
    purpose,
    drag_overlay: overlay,
    error: overlay.error,
  };
}
