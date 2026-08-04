/**
 * macOS traffic light geometry shared by main + secondary windows.
 *
 * Product header is `h-12` (48px). Lights are ~12–14px tall; y is the TOP of
 * the control cluster (Electron/Tauri logical coords). y≈16 centers in h-12.
 * Keep x aligned with Tauri main (`tauri.conf.json` trafficLightPosition.x = 14).
 *
 * Standalone browser tab strip is `h-8` (32px) with `h-7` tabs — use `browser`
 * so lights sit higher and align with the tab row (do not reuse for main shell).
 */
export const MAC_TRAFFIC_LIGHTS = {
  /** Main app shell + agent-chat chrome (h-12 headers) */
  primary: { x: 14, y: 16 },
  /** Compact title strips (permissions, short bars) */
  compact: { x: 14, y: 14 },
  /** Standalone browser window — BrowserTabBar h-8 / tabs h-7 */
  browser: { x: 14, y: 10 },
} as const;

export function macWindowChromeOptions(
  variant: keyof typeof MAC_TRAFFIC_LIGHTS = "primary",
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
