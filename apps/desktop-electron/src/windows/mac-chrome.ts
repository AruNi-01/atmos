/**
 * macOS traffic light geometry shared by main + secondary windows.
 *
 * Product header is `h-12` (48px). Lights are ~12–14px tall; y is the TOP of
 * the control cluster (Electron/Tauri logical coords). y≈16 centers in h-12.
 * Keep x aligned with Tauri main (`tauri.conf.json` trafficLightPosition.x = 14).
 */
export const MAC_TRAFFIC_LIGHTS = {
  /** Main app shell + agent-chat / preview browser chrome */
  primary: { x: 14, y: 16 },
  /** Compact title strips (permissions, short bars) */
  compact: { x: 14, y: 14 },
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
