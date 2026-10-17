import {
  USER_MESSAGE_COLLAPSE_FADE_LINES,
  USER_MESSAGE_COLLAPSE_LINES,
} from "@atmos/agent-transcript";

/** Web shows the solid lines plus the fading line (`3lh` + `1lh`). */
export function userMessageCollapsedLineLimit(): number {
  return USER_MESSAGE_COLLAPSE_LINES + USER_MESSAGE_COLLAPSE_FADE_LINES;
}

/** Web `rounded-2xl`: `--radius` (10px) plus 8px. */
export const USER_BUBBLE_RADIUS = 18;

/**
 * Web user bubble is `bg-secondary`, the same solid as `bg-muted`
 * (`oklch(0.9 0.004 286)` / `oklch(0.274 0.006 286.033)`).
 */
export function userBubbleFill(isDark: boolean): string {
  return isDark ? "#27272a" : "#dedee0";
}

/**
 * Wash the fading line into the bubble. `transparent` is rgba(0,0,0,0) and
 * turns a light bubble gray, so the start keeps the bubble's RGB at alpha 0.
 */
function hexChannels(bubble: string): [string, string, string] | null {
  const match = /^#([\da-f]{6})$/i.exec(bubble.trim());
  const hex = match?.[1];
  if (!hex) return null;
  return [
    String(Number.parseInt(hex.slice(0, 2), 16)),
    String(Number.parseInt(hex.slice(2, 4), 16)),
    String(Number.parseInt(hex.slice(4, 6), 16)),
  ];
}

export function userMessageWashColors(bubble: string): [string, string] {
  const hex = hexChannels(bubble);
  if (hex) {
    const [red, green, blue] = hex;
    return [`rgba(${red}, ${green}, ${blue}, 0)`, `rgba(${red}, ${green}, ${blue}, 1)`];
  }
  const match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(
    bubble.trim(),
  );
  if (!match) return [bubble, bubble];
  const red = match[1] ?? "0";
  const green = match[2] ?? "0";
  const blue = match[3] ?? "0";
  const alpha = match[4] ?? "1";
  return [`rgba(${red}, ${green}, ${blue}, 0)`, `rgba(${red}, ${green}, ${blue}, ${alpha})`];
}
