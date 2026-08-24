"use client";

import { wsQueryOptions } from "@/api/query/computer-query-options";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import { resourceMonitorApi } from "@/api/ws/resource-monitor-api";
import { RESOURCE_MONITOR_IDLE_MS } from "@/features/resource-monitor/lib/resource-monitor-constants";

export {
  RESOURCE_MONITOR_IDLE_MS,
  RESOURCE_MONITOR_INTERACTIVE_MS,
  RESOURCE_MONITOR_STALE_MS,
} from "@/features/resource-monitor/lib/resource-monitor-constants";

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

export function resourceMonitorSnapshotQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  options?: { enabled?: boolean; refetchInterval?: number | false },
) {
  return wsQueryOptions({
    scope,
    connectionState,
    enabled: options?.enabled,
    queryKey: queryKeys.computer.resourceMonitorSnapshot(scope),
    queryFn: () => resourceMonitorApi.get(scope),
    staleTime: RESOURCE_MONITOR_IDLE_MS,
    refetchInterval: options?.refetchInterval ?? false,
  });
}
