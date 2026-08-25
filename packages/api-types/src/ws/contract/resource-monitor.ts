import type { WsEmpty } from "../dto/common";
import type { ResourceMonitorSnapshot } from "../dto/resource-monitor";

export type ResourceMonitorKillLeakedRequest = {
  name: string;
  project_id: string;
  workspace_id: string | null;
};

export type ResourceMonitorKillLeakedResponse = {
  killed_count: number;
};

export type ResourceMonitorContract = {
  resource_monitor_get: {
    input: WsEmpty;
    output: ResourceMonitorSnapshot;
  };
  resource_monitor_subscribe: {
    input: WsEmpty;
    output: ResourceMonitorSnapshot;
  };
  resource_monitor_unsubscribe: {
    input: WsEmpty;
    output: WsEmpty;
  };
  resource_monitor_kill_leaked: {
    input: ResourceMonitorKillLeakedRequest;
    output: ResourceMonitorKillLeakedResponse;
  };
};
