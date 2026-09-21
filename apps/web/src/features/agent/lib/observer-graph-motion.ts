export const OBSERVER_MOTION_MS = 240;
export const OBSERVER_REDUCED_MOTION_MS = 180;
export const OBSERVER_STAGGER_MS = 40;
export const OBSERVER_STAGGER_CAP_MS = 160;
export const OBSERVER_ENTER_SCALE = 0.96;
export const OBSERVER_EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
export const OBSERVER_EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

export type TimedExit<T extends { id: string }> = {
  item: T;
  until: number;
};

export function observerStaggerMs(depth: number): number {
  if (depth <= 0) return 0;
  return Math.min(depth * OBSERVER_STAGGER_MS, OBSERVER_STAGGER_CAP_MS);
}

export function nextTimedExits<T extends { id: string }>({
  previousLive,
  nextLive,
  exiting,
  now,
  durationMs,
}: {
  previousLive: T[];
  nextLive: T[];
  exiting: TimedExit<T>[];
  now: number;
  durationMs: number;
}): TimedExit<T>[] {
  const nextIds = new Set(nextLive.map((item) => item.id));
  const kept: TimedExit<T>[] = [];
  const keptIds = new Set<string>();
  for (const record of exiting) {
    if (record.until <= now || nextIds.has(record.item.id)) continue;
    kept.push(record);
    keptIds.add(record.item.id);
  }
  for (const item of previousLive) {
    if (nextIds.has(item.id) || keptIds.has(item.id)) continue;
    kept.push({ item, until: now + durationMs });
    keptIds.add(item.id);
  }
  return kept;
}
