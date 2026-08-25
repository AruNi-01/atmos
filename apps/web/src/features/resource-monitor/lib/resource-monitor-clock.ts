import { RESOURCE_MONITOR_CLOCK_MS } from "@/features/resource-monitor/lib/resource-monitor-constants";

export type ResourceMonitorClockDeps = {
  now?: () => number;
  setInterval?: (handler: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval?: (id: ReturnType<typeof setInterval>) => void;
  intervalMs?: number;
};

/**
 * Interactive-only local clock. Callers must set React state only from `onTick`
 * (the interval callback), never from `attach`.
 */
export function createResourceMonitorClock(deps: ResourceMonitorClockDeps = {}) {
  const now = deps.now ?? Date.now;
  const schedule = deps.setInterval ?? setInterval;
  const unschedule = deps.clearInterval ?? clearInterval;
  const intervalMs = deps.intervalMs ?? RESOURCE_MONITOR_CLOCK_MS;
  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    intervalMs,
    attach(onTick: (nowMs: number) => void): () => void {
      if (timer != null) {
        unschedule(timer);
        timer = null;
      }
      const scheduled = schedule(() => {
        onTick(now());
      }, intervalMs);
      timer = scheduled;
      return () => {
        if (timer !== scheduled) return;
        unschedule(scheduled);
        timer = null;
      };
    },
  };
}
