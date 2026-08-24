import { describe, expect, test } from "bun:test";
import { RESOURCE_MONITOR_HISTORY_CAP } from "@/features/resource-monitor/lib/resource-monitor-constants";
import {
  appendResourceHostHistoryPoint,
  emptyResourceHostHistoryRing,
  hostMemoryPercent,
  resourceHostHistoryPointFromSnapshot,
  resourceMonitorHistoryScopeKey,
} from "@/features/resource-monitor/lib/resource-monitor-host-history";

const host = {
  cpu_percent: 12.4,
  memory_used_bytes: 8 * 1024 * 1024 * 1024,
  memory_total_bytes: 16 * 1024 * 1024 * 1024,
};

describe("resourceMonitorHistoryScopeKey", () => {
  test("joins activeInstanceId, epoch, and relay revision", () => {
    expect(
      resourceMonitorHistoryScopeKey({
        activeInstanceId: "local",
        connectionEpoch: 3,
        relaySessionRevision: 7,
      }),
    ).toBe("local:3:7");
  });
});

describe("hostMemoryPercent", () => {
  test("returns 0 when total is 0 or non-finite", () => {
    expect(hostMemoryPercent(1024, 0)).toBe(0);
    expect(hostMemoryPercent(1024, -1)).toBe(0);
    expect(hostMemoryPercent(1024, Number.NaN)).toBe(0);
    expect(hostMemoryPercent(Number.POSITIVE_INFINITY, 1024)).toBe(0);
  });

  test("returns used/total as a 0–100 percent", () => {
    expect(hostMemoryPercent(8, 16)).toBe(50);
    expect(hostMemoryPercent(20, 10)).toBe(100);
    expect(hostMemoryPercent(0, 16)).toBe(0);
  });
});

describe("resourceHostHistoryPointFromSnapshot", () => {
  test("uses the local receive timestamp, not a remote clock", () => {
    expect(resourceHostHistoryPointFromSnapshot(1_700_000_042, host)).toEqual({
      received_at_ms: 1_700_000_042,
      cpu_percent: 12.4,
      memory_percent: 50,
    });
    expect(resourceHostHistoryPointFromSnapshot(0, host)).toBeNull();
    expect(resourceHostHistoryPointFromSnapshot(Number.NaN, host)).toBeNull();
  });
});

describe("appendResourceHostHistoryPoint", () => {
  test("caps at 60 and drops the oldest points", () => {
    let ring = emptyResourceHostHistoryRing("a");
    for (let i = 1; i <= RESOURCE_MONITOR_HISTORY_CAP + 1; i += 1) {
      ring = appendResourceHostHistoryPoint(ring, "a", {
        received_at_ms: i,
        cpu_percent: i,
        memory_percent: i,
      });
    }
    expect(ring.points).toHaveLength(RESOURCE_MONITOR_HISTORY_CAP);
    expect(ring.points[0]?.received_at_ms).toBe(2);
    expect(ring.points.at(-1)?.received_at_ms).toBe(RESOURCE_MONITOR_HISTORY_CAP + 1);
  });

  test("dedupes the same local receive timestamp", () => {
    const first = appendResourceHostHistoryPoint(
      emptyResourceHostHistoryRing("a"),
      "a",
      { received_at_ms: 10, cpu_percent: 1, memory_percent: 2 },
    );
    const again = appendResourceHostHistoryPoint(first, "a", {
      received_at_ms: 10,
      cpu_percent: 9,
      memory_percent: 9,
    });
    expect(again).toBe(first);
    expect(again.points).toHaveLength(1);
    expect(again.points[0]?.cpu_percent).toBe(1);
  });

  test("resets when the Computer scope key changes", () => {
    const local = appendResourceHostHistoryPoint(
      emptyResourceHostHistoryRing("local:1:0"),
      "local:1:0",
      { received_at_ms: 1, cpu_percent: 10, memory_percent: 20 },
    );
    const relay = appendResourceHostHistoryPoint(local, "relay:2:1", {
      received_at_ms: 2,
      cpu_percent: 3,
      memory_percent: 4,
    });
    expect(relay.scopeKey).toBe("relay:2:1");
    expect(relay.points).toEqual([
      { received_at_ms: 2, cpu_percent: 3, memory_percent: 4 },
    ]);
  });

  test("ignores a missing snapshot on the same scope", () => {
    const first = appendResourceHostHistoryPoint(
      emptyResourceHostHistoryRing("a"),
      "a",
      { received_at_ms: 1, cpu_percent: 1, memory_percent: 1 },
    );
    expect(appendResourceHostHistoryPoint(first, "a", null)).toBe(first);
  });
});
