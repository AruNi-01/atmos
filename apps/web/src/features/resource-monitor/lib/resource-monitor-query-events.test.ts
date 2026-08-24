import { describe, expect, test } from "bun:test";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import type { ResourceMonitorSnapshot } from "@atmos/api-types/ws/dto/resource-monitor";
import { applyResourceMonitorUpdated } from "@/features/resource-monitor/lib/resource-monitor-query-events";
import { createAtmosWebQueryClient } from "@/providers/app/query-client";

const scope: ComputerQueryScope = {
  activeInstanceId: "local",
  connectionEpoch: 1,
  relaySessionRevision: 0,
};

function makeSnapshot(collectedAtMs = 1_700_000_000): ResourceMonitorSnapshot {
  const usage = { cpu_percent: 1.5, memory_rss_bytes: 1024, process_count: 1 };
  return {
    collected_at_ms: collectedAtMs,
    host: {
      cpu_percent: 12,
      memory_used_bytes: 8_000_000_000,
      memory_total_bytes: 16_000_000_000,
      logical_cpu_count: 8,
    },
    server: usage,
    shared_runtime: usage,
    projects: [],
    unattributed: { cpu_percent: 0, memory_rss_bytes: 0, process_count: 0 },
    attribution_status: "complete",
  };
}

describe("applyResourceMonitorUpdated", () => {
  test("replaces the scoped snapshot without invalidating or refetching", () => {
    const client = createAtmosWebQueryClient();
    const key = queryKeys.computer.resourceMonitorSnapshot(scope);
    const snapshot = makeSnapshot(42);

    const applied = applyResourceMonitorUpdated(client, scope, snapshot);

    expect(applied).toBe(true);
    expect(client.getQueryData(key)).toEqual(snapshot);
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    expect(client.getQueryState(key)?.fetchStatus).toBe("idle");
    expect(client.getQueryState(key)?.dataUpdatedAt).toBeGreaterThan(0);
  });

  test("does not reuse data under a different instance, epoch, or revision", () => {
    const client = createAtmosWebQueryClient();
    const snapshot = makeSnapshot(99);
    applyResourceMonitorUpdated(client, scope, snapshot);

    expect(
      client.getQueryData(
        queryKeys.computer.resourceMonitorSnapshot({
          ...scope,
          activeInstanceId: "relay:other",
        }),
      ),
    ).toBeUndefined();
    expect(
      client.getQueryData(
        queryKeys.computer.resourceMonitorSnapshot({
          ...scope,
          connectionEpoch: 9,
        }),
      ),
    ).toBeUndefined();
    expect(
      client.getQueryData(
        queryKeys.computer.resourceMonitorSnapshot({
          ...scope,
          relaySessionRevision: 4,
        }),
      ),
    ).toBeUndefined();
    expect(client.getQueryData(queryKeys.computer.resourceMonitorSnapshot(scope))).toEqual(
      snapshot,
    );
  });

  test("rejects partial payloads and leaves the cache unchanged", () => {
    const client = createAtmosWebQueryClient();
    const key = queryKeys.computer.resourceMonitorSnapshot(scope);
    const seed = makeSnapshot(1);
    client.setQueryData(key, seed);

    expect(
      applyResourceMonitorUpdated(client, scope, {
        collected_at_ms: 2,
        host: { cpu_percent: 1 },
      }),
    ).toBe(false);
    expect(client.getQueryData(key)).toEqual(seed);
  });
});
