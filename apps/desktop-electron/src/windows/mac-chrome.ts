import type { BrowserWindow } from "electron";

/**
 * macOS traffic light geometry shared by main + secondary windows.
 *
 * Product header is `h-12` (48px). Lights are ~12–14px tall; y is the TOP of
 * the control cluster (Electron/Tauri logical coords). y≈16 centers in h-12.
 * Keep x aligned with Tauri main (`tauri.conf.json` trafficLightPosition.x = 14).
 *
 * Dense browser chrome (standalone window + main-window maximized browser) uses
 * a short morphing tab rail (RAIL_HEIGHT 30 / tabs 28) — `browser` raises lights
 * so they sit in that rail. Main shell stays on `primary` until the renderer
 * switches via `window_set_mac_chrome_variant` at runtime.
 */
export const MAC_TRAFFIC_LIGHTS = {
  /** Main app shell + agent-chat chrome (h-12 headers) */
  primary: { x: 14, y: 16 },
  /** Compact title strips (permissions, short bars) */
  compact: { x: 14, y: 14 },
  /**
   * Dense browser chrome — standalone browser window, or main window while
   * browser preview is maximized over the shell.
   */
  browser: { x: 14, y: 8 },
} as const;

export type MacChromeVariant = keyof typeof MAC_TRAFFIC_LIGHTS;

export function isMacChromeVariant(value: string): value is MacChromeVariant {
  return Object.prototype.hasOwnProperty.call(MAC_TRAFFIC_LIGHTS, value);
}

export function macWindowChromeOptions(
  variant: MacChromeVariant = "primary",
): {
  titleBarStyle: "hiddenInset";
  trafficLightPosition: { x: number; y: number };
} | Record<string, never> {
  if (process.platform !== "darwin") return {};
  const pos = MAC_TRAFFIC_LIGHTS[variant];
  return {
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: pos.x, y: pos.y },
  };
}

/**
 * Runtime traffic-light move (macOS only). Used when main-window browser
 * maximize toggles dense vs shell chrome without recreating the window.
 */
export function applyMacChromeVariant(
  win: BrowserWindow,
  variant: MacChromeVariant,
): void {
  if (process.platform !== "darwin") return;
  if (win.isDestroyed()) return;
  const pos = MAC_TRAFFIC_LIGHTS[variant];
  win.setWindowButtonPosition({ x: pos.x, y: pos.y });
}
