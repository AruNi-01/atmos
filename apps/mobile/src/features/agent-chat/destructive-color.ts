/**
 * Web `--destructive` in `packages/ui/src/styles/globals.css`.
 * Light is `oklch(0.577 0.245 27.325)` and dark is `oklch(0.704 0.191 22.216)`,
 * the same tokens as Tailwind v4 red-600 and red-400, channel-clipped to sRGB.
 * `bg-destructive/5` and `border-destructive/30` are those fills at 5% and 30%.
 */
export const CHAT_DESTRUCTIVE_LIGHT = "#e7000b";
export const CHAT_DESTRUCTIVE_DARK = "#ff6467";
export const CHAT_DESTRUCTIVE_SURFACE_LIGHT = "rgba(231, 0, 11, 0.05)";
export const CHAT_DESTRUCTIVE_SURFACE_DARK = "rgba(255, 100, 103, 0.05)";
export const CHAT_DESTRUCTIVE_BORDER_LIGHT = "rgba(231, 0, 11, 0.3)";
export const CHAT_DESTRUCTIVE_BORDER_DARK = "rgba(255, 100, 103, 0.3)";

export function chatDestructiveColor(isDark: boolean): string {
  return isDark ? CHAT_DESTRUCTIVE_DARK : CHAT_DESTRUCTIVE_LIGHT;
}

export function chatDestructiveSurface(isDark: boolean): string {
  return isDark ? CHAT_DESTRUCTIVE_SURFACE_DARK : CHAT_DESTRUCTIVE_SURFACE_LIGHT;
}

export function chatDestructiveBorder(isDark: boolean): string {
  return isDark ? CHAT_DESTRUCTIVE_BORDER_DARK : CHAT_DESTRUCTIVE_BORDER_LIGHT;
}
