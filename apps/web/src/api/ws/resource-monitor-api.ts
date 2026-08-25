"use client";

import type { ComputerQueryScope } from "@/api/query/query-scope";
import { wsRequestForComputerScope } from "@/api/ws/request";
import type { ResourceMonitorSnapshot } from "@atmos/api-types/ws/dto/resource-monitor";

export type {
  ResourceAttributionStatus,
  ResourceHostMetrics,
  ResourceMonitorSnapshot,
  ResourceProjectMetrics,
  ResourceSessionMetrics,
  ResourceUsage,
  ResourceWorkspaceMetrics,
} from "@atmos/api-types/ws/dto/resource-monitor";

export const resourceMonitorApi = {
  get: (scope: ComputerQueryScope): Promise<ResourceMonitorSnapshot> => {
    return wsRequestForComputerScope(scope, "resource_monitor_get", {});
  },
  subscribe: (scope: ComputerQueryScope): Promise<ResourceMonitorSnapshot> => {
    return wsRequestForComputerScope(scope, "resource_monitor_subscribe", {});
  },
  unsubscribe: (scope: ComputerQueryScope): Promise<Record<string, never>> => {
    return wsRequestForComputerScope(scope, "resource_monitor_unsubscribe", {});
  },
  killLeaked: (
    scope: ComputerQueryScope,
    input: {
      name: string;
      project_id: string;
      workspace_id: string | null;
    },
  ) => {
    return wsRequestForComputerScope(scope, "resource_monitor_kill_leaked", input);
  },
};
