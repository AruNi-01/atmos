import { describe, expect, test } from "bun:test";
import {
  formatHostHistoryLocalTime,
  hostHistoryAgeSeconds,
  hostHistoryRelative,
} from "@/features/resource-monitor/lib/resource-monitor-chart-time";

describe("host history chart time", () => {
  test("formats a local clock from the receive timestamp", () => {
    const label = formatHostHistoryLocalTime(Date.UTC(2026, 0, 2, 15, 4, 5));
    expect(label.length).toBeGreaterThan(0);
    expect(label).toMatch(/\d/);
    expect(formatHostHistoryLocalTime(0)).toBe("");
  });

  test("relative age is seconds from the local receive time", () => {
    expect(hostHistoryAgeSeconds(1_000, 13_400)).toBe(12);
    expect(hostHistoryAgeSeconds(5_000, 4_000)).toBe(0);
    expect(hostHistoryAgeSeconds(0, 9_000)).toBe(0);
  });

  test("relative kind buckets just-now, seconds, and minutes", () => {
    expect(hostHistoryRelative(0)).toEqual({ kind: "now", count: 0 });
    expect(hostHistoryRelative(4)).toEqual({ kind: "now", count: 0 });
    expect(hostHistoryRelative(12)).toEqual({ kind: "seconds", count: 12 });
    expect(hostHistoryRelative(90)).toEqual({ kind: "minutes", count: 2 });
  });
});
