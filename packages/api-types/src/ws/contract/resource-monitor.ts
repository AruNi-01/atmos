import type { WsEmpty } from "../dto/common";
import type { ResourceMonitorSnapshot } from "../dto/resource-monitor";

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
};
