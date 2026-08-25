import { describe, expect, test } from "bun:test";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import type { ResourceMonitorSnapshot } from "@atmos/api-types/ws/dto/resource-monitor";
import { testHostMetrics, testSnapshot } from "@/features/resource-monitor/lib/resource-monitor-test-host";
import { createResourceMonitorSubscriptionController } from "@/features/resource-monitor/lib/resource-monitor-subscription";

const localScope: ComputerQueryScope = {
  activeInstanceId: "local",
  connectionEpoch: 1,
  relaySessionRevision: 0,
};

const relayScope: ComputerQueryScope = {
  activeInstanceId: "relay:box",
  connectionEpoch: 2,
  relaySessionRevision: 4,
};

function snapshot(id: number): ResourceMonitorSnapshot {
  return testSnapshot({
    collected_at_ms: id,
    host: testHostMetrics({
      cpu_percent: 1,
      memory_used_bytes: 2,
      memory_total_bytes: 3,
      logical_cpu_count: 4,
    }),
    server: { cpu_percent: 0, memory_rss_bytes: 0, process_count: 0 },
    shared_runtime: { cpu_percent: 0, memory_rss_bytes: 0, process_count: 0 },
  });
}

function flushMicrotasks() {
  return Promise.resolve();
}

describe("resource-monitor-subscription", () => {
  test("seeds the attach-time snapshot and unsubscribes the captured scope on close", async () => {
    const calls: string[] = [];
    const controller = createResourceMonitorSubscriptionController({
      subscribe: async (scope) => {
        calls.push(`subscribe:${scope.activeInstanceId}`);
        return snapshot(1);
      },
      unsubscribe: async (scope) => {
        calls.push(`unsubscribe:${scope.activeInstanceId}`);
      },
      isConnected: () => true,
      seedSnapshot: (_scope, data) => {
        calls.push(`seed:${data.collected_at_ms}`);
      },
    });

    const stop = controller.attach(localScope);
    await flushMicrotasks();
    expect(calls).toEqual(["subscribe:local", "seed:1"]);

    stop();
    await flushMicrotasks();
    expect(calls).toEqual(["subscribe:local", "seed:1", "unsubscribe:local"]);
  });

  test("scope change unsubscribes the old captured scope before the new subscribe owns the slot", async () => {
    const calls: string[] = [];
    const controller = createResourceMonitorSubscriptionController({
      subscribe: async (scope) => {
        calls.push(`subscribe:${scope.activeInstanceId}`);
        return snapshot(scope.connectionEpoch);
      },
      unsubscribe: async (scope) => {
        calls.push(`unsubscribe:${scope.activeInstanceId}`);
      },
      isConnected: () => true,
      seedSnapshot: (scope, data) => {
        calls.push(`seed:${scope.activeInstanceId}:${data.collected_at_ms}`);
      },
    });

    const stopLocal = controller.attach(localScope);
    await flushMicrotasks();
    stopLocal();
    const stopRelay = controller.attach(relayScope);
    await flushMicrotasks();
    stopRelay();
    await flushMicrotasks();

    expect(calls[0]).toBe("subscribe:local");
    expect(calls).toContain("unsubscribe:local");
    expect(calls).toContain("subscribe:relay:box");
    expect(calls.filter((call) => call.startsWith("unsubscribe:local"))).toHaveLength(1);
  });

  test("same-scope remount does not unsubscribe the replacement subscription", async () => {
    const calls: string[] = [];
    const controller = createResourceMonitorSubscriptionController({
      subscribe: async () => {
        calls.push("subscribe");
        return snapshot(7);
      },
      unsubscribe: async () => {
        calls.push("unsubscribe");
      },
      isConnected: () => true,
      seedSnapshot: () => {
        calls.push("seed");
      },
    });

    const first = controller.attach(localScope);
    first();
    const second = controller.attach(localScope);
    await flushMicrotasks();
    expect(calls.filter((call) => call === "unsubscribe")).toEqual([]);
    second();
    await flushMicrotasks();
    expect(calls.filter((call) => call === "unsubscribe")).toHaveLength(1);
  });

  test("disconnect cleanup does not send unsubscribe", async () => {
    let connected = true;
    const calls: string[] = [];
    const controller = createResourceMonitorSubscriptionController({
      subscribe: async () => snapshot(1),
      unsubscribe: async () => {
        calls.push("unsubscribe");
      },
      isConnected: () => connected,
      seedSnapshot: () => undefined,
    });

    const stop = controller.attach(localScope);
    await flushMicrotasks();
    connected = false;
    stop();
    await flushMicrotasks();
    expect(calls).toEqual([]);
  });
});
