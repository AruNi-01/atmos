/**
 * Web `Reasoning` (`packages/ui/src/components/ai-elements/reasoning.tsx`).
 * Streaming forces the body open. After streaming ends, it closes once,
 * 1000ms later. A settled part starts closed. A manual open after that stays open.
 * The rail is `bg-border`: black or white at 10%.
 */
export const THINKING_AUTO_CLOSE_MS = 1000;

export const THINKING_RAIL_LIGHT = "rgba(0, 0, 0, 0.1)";
export const THINKING_RAIL_DARK = "rgba(255, 255, 255, 0.1)";

export function thinkingRailColor(isDark: boolean): string {
  return isDark ? THINKING_RAIL_DARK : THINKING_RAIL_LIGHT;
}

export function thinkingStreamAction(input: {
  streaming: boolean;
  open: boolean;
  storedOpen: boolean | undefined;
  everStreamed: boolean;
  autoClosed: boolean;
}): "force-open" | "schedule-close" | "hold" {
  if (input.streaming) return input.storedOpen === true ? "hold" : "force-open";
  if (input.everStreamed && input.open && !input.autoClosed) return "schedule-close";
  return "hold";
}
