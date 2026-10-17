import { formatWorkDuration, workDurationParts } from "@atmos/agent-transcript";

/** Web ticks the live turn once a second. */
export const ACTIVITY_CLOCK_TICK_MS = 1000;

/** Web status swap: spring stiffness 300, damping 30, travel 12px. */
export const ACTIVITY_STATUS_SPRING = {
  damping: 30,
  mass: 1,
  stiffness: 300,
} as const;

export const ACTIVITY_STATUS_SHIFT_PX = 12;

const anchors = new Map<string, number>();

/**
 * First observation wins, matching the web session clock.
 * A later `worked_ms` does not move an anchor that is already ticking.
 */
export function activityClockAnchor(
  messageId: string,
  workedMs: number | null | undefined,
  now = Date.now(),
): number {
  const existing = anchors.get(messageId);
  if (existing != null) return existing;
  const elapsed = workedMs != null && workedMs >= 0 ? workedMs : 0;
  const anchor = now - elapsed;
  anchors.set(messageId, anchor);
  return anchor;
}

export function activityElapsedMs(anchor: number, now = Date.now()): number {
  return Math.max(0, now - anchor);
}

export function activityClockUnits(elapsedMs: number): Array<{
  unit: "h" | "m" | "s";
  value: number;
}> {
  const { hours, minutes, seconds } = workDurationParts(elapsedMs);
  const units: Array<{ unit: "h" | "m" | "s"; value: number }> = [];
  if (hours > 0) units.push({ unit: "h", value: hours });
  if (hours > 0 || minutes > 0) units.push({ unit: "m", value: minutes });
  units.push({ unit: "s", value: seconds });
  return units;
}

export function activityClockLabel(elapsedMs: number): string {
  return formatWorkDuration(elapsedMs);
}

export function clearActivityClockAnchors(): void {
  anchors.clear();
}
