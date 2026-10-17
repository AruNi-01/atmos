/**
 * Web `--foreground` and `--muted-foreground` from `packages/ui/src/styles/globals.css`.
 * Light foreground is `oklch(0.141 0.005 285.823)` (`#09090b`).
 * Dark foreground is `oklch(0.985 0 0)` (`#fafafa`).
 * Light muted is `oklch(0.552 0.016 285.938)` (`#71717b`).
 * Dark muted is `oklch(0.705 0.015 286.067)` (`#9f9fa9`).
 * Theme label and secondary label stay on chrome that is not message type.
 */

export const CHAT_FOREGROUND_LIGHT = "#09090b";
export const CHAT_FOREGROUND_DARK = "#fafafa";
export const CHAT_MUTED_LIGHT = "#71717b";
export const CHAT_MUTED_DARK = "#9f9fa9";

export function chatForeground(isDark: boolean): string {
  return isDark ? CHAT_FOREGROUND_DARK : CHAT_FOREGROUND_LIGHT;
}

/** Web `text-foreground/80` on listed paths and the discussion diff header. */
export function chatForeground80(isDark: boolean): string {
  return isDark ? "rgba(250, 250, 250, 0.8)" : "rgba(9, 9, 11, 0.8)";
}

export function chatMutedForeground(isDark: boolean): string {
  return isDark ? CHAT_MUTED_DARK : CHAT_MUTED_LIGHT;
}
