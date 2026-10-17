import {
  USER_MESSAGE_COLLAPSE_FADE_LINES,
  USER_MESSAGE_COLLAPSE_LINES,
} from "@atmos/agent-transcript";

/** Web shows the solid lines plus the fading line (`3lh` + `1lh`). */
export function userMessageCollapsedLineLimit(): number {
  return USER_MESSAGE_COLLAPSE_LINES + USER_MESSAGE_COLLAPSE_FADE_LINES;
}

/**
 * Wash the fading line into the bubble. `transparent` is rgba(0,0,0,0) and
 * turns a light bubble gray, so the start keeps the bubble's RGB at alpha 0.
 */
export function userMessageWashColors(bubble: string): [string, string] {
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
