import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import { queryKeys } from "@/api/query/query-keys";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import { RESOURCE_MONITOR_IDLE_MS } from "@/features/resource-monitor/lib/resource-monitor-constants";

const scope: ComputerQueryScope = {
  activeInstanceId: "local",
  connectionEpoch: 1,
  relaySessionRevision: 0,
};

const optionsSrc = readFileSync(
  join(import.meta.dir, "resource-monitor-query-options.ts"),
  "utf8",
);

describe("resourceMonitorSnapshotQueryOptions", () => {
  test("wires the Computer-scoped snapshot key through wsQueryOptions", () => {
    const idle = wsQueryOptions({
      scope,
      connectionState: "connected",
      queryKey: queryKeys.computer.resourceMonitorSnapshot(scope),
      queryFn: async () => 1,
      refetchInterval: RESOURCE_MONITOR_IDLE_MS,
    });
    expect(idle.queryKey).toEqual(queryKeys.computer.resourceMonitorSnapshot(scope));
    expect(idle.enabled).toBe(true);
    expect(idle.refetchInterval).toBe(RESOURCE_MONITOR_IDLE_MS);

    const interactive = wsQueryOptions({
      scope,
      connectionState: "connected",
      queryKey: queryKeys.computer.resourceMonitorSnapshot(scope),
      queryFn: async () => 1,
      refetchInterval: false,
    });
    expect(interactive.refetchInterval).toBe(false);

    const disconnected = wsQueryOptions({
      scope,
      connectionState: "disconnected",
      queryKey: queryKeys.computer.resourceMonitorSnapshot(scope),
      queryFn: async () => 1,
      enabled: true,
      refetchInterval: RESOURCE_MONITOR_IDLE_MS,
    });
    expect(disconnected.enabled).toBe(false);
  });

  test("feature options call get(scope) and pass through refetchInterval", () => {
    expect(optionsSrc).toContain("queryKeys.computer.resourceMonitorSnapshot(scope)");
    expect(optionsSrc).toContain("resourceMonitorApi.get(scope)");
    expect(optionsSrc).toContain("refetchInterval: options?.refetchInterval ?? false");
  });
});
