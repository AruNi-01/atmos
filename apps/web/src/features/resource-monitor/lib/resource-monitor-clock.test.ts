import { describe, expect, test } from "bun:test";
import { createResourceMonitorClock } from "@/features/resource-monitor/lib/resource-monitor-clock";
import { RESOURCE_MONITOR_CLOCK_MS } from "@/features/resource-monitor/lib/resource-monitor-constants";

describe("createResourceMonitorClock", () => {
  test("uses a 5–10s interval and never ticks during attach", () => {
    expect(RESOURCE_MONITOR_CLOCK_MS).toBeGreaterThanOrEqual(5_000);
    expect(RESOURCE_MONITOR_CLOCK_MS).toBeLessThanOrEqual(10_000);

    const ticks: number[] = [];
    let now = 1_000;
    let scheduledMs = 0;
    let intervalFn: (() => void) | null = null;
    let cleared = 0;

    const clock = createResourceMonitorClock({
      now: () => now,
      setInterval: (handler, ms) => {
        intervalFn = handler;
        scheduledMs = ms;
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: () => {
        cleared += 1;
        intervalFn = null;
      },
    });

    const stop = clock.attach((value) => {
      ticks.push(value);
    });

    expect(ticks).toEqual([]);
    expect(scheduledMs).toBe(RESOURCE_MONITOR_CLOCK_MS);
    expect(clock.intervalMs).toBe(RESOURCE_MONITOR_CLOCK_MS);

    now = 9_000;
    intervalFn?.();
    expect(ticks).toEqual([9_000]);

    now = 17_000;
    intervalFn?.();
    expect(ticks).toEqual([9_000, 17_000]);

    stop();
    expect(cleared).toBe(1);
    intervalFn?.();
    expect(ticks).toEqual([9_000, 17_000]);
  });

  test("reattach replaces the previous timer without leaking the old callback", () => {
    const ticks: number[] = [];
    let intervalFn: (() => void) | null = null;
    let cleared = 0;
    let nextId = 0;

    const clock = createResourceMonitorClock({
      now: () => 42,
      setInterval: (handler) => {
        intervalFn = handler;
        nextId += 1;
        return nextId as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: () => {
        cleared += 1;
        intervalFn = null;
      },
    });

    const first = clock.attach((value) => ticks.push(value));
    const second = clock.attach((value) => ticks.push(value + 1));
    expect(cleared).toBe(1);

    first();
    expect(cleared).toBe(1);
    intervalFn?.();
    expect(ticks).toEqual([43]);

    second();
    expect(cleared).toBe(2);
    intervalFn?.();
    expect(ticks).toEqual([43]);
  });
});
