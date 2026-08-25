"use client";

import { useEffect, useRef } from "react";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";
import { getComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { applyQuotaOverviewUpdated } from "@/features/quota-usage/lib/quota-query-events";
import { invalidateTokenUsageQueries } from "@/features/quota-usage/lib/token-usage-query-options";
import { applyLocalServicesUpdated } from "@/features/local-services/lib/local-services-query-events";
import { invalidateLocalModelQueries } from "@/features/local-services/lib/local-model-query-options";
import { invalidateAutomationDefinitionQueries, invalidateAutomationRunQueries } from "@/features/automations/lib/automations-query-options";
import { applyResourceMonitorUpdated } from "@/features/resource-monitor/lib/resource-monitor-query-events";

let quotaOverviewSubscriberCount = 0;
let tokenUsageSubscriberCount = 0;
let localServicesSubscriberCount = 0;
let localModelSubscriberCount = 0;
let automationDefinitionSubscriberCount = 0;
let automationRunSubscriberCount = 0;
let resourceMonitorSubscriberCount = 0;

/** Test helpers: expose per-domain subscription counts. */
export function getQuotaOverviewBridgeSubscriberCount(): number {
  return quotaOverviewSubscriberCount;
}
export function getTokenUsageBridgeSubscriberCount(): number {
  return tokenUsageSubscriberCount;
}
export function getLocalServicesBridgeSubscriberCount(): number {
  return localServicesSubscriberCount;
}
export function getLocalModelBridgeSubscriberCount(): number {
  return localModelSubscriberCount;
}
export function getAutomationDefinitionBridgeSubscriberCount(): number {
  return automationDefinitionSubscriberCount;
}
export function getAutomationRunBridgeSubscriberCount(): number {
  return automationRunSubscriberCount;
}
export function getResourceMonitorBridgeSubscriberCount(): number {
  return resourceMonitorSubscriberCount;
}

function subscribeOnce(
  store: ReturnType<typeof useWebSocketStore.getState>,
  event: string,
  handler: (data: unknown) => void,
  counterRef: { value: number },
): () => void {
  counterRef.value += 1;
  const unsub = store.onEvent(event, handler);
  return () => {
    counterRef.value = Math.max(0, counterRef.value - 1);
    unsub();
  };
}

/**
 * Single app-level bridge for Query-owned WebSocket snapshot events (APP-035).
 * Mount once beside WebSocketProvider. Feature components must not duplicate these subscriptions.
 */
export function ServerStateEventBridge() {
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (connectionState !== "connected") {
      cleanupRef.current?.();
      cleanupRef.current = null;
      return;
    }

    if (cleanupRef.current) return;

    const store = useWebSocketStore.getState();
    const quotaOverviewCounter = { value: quotaOverviewSubscriberCount };
    const tokenUsageCounter = { value: tokenUsageSubscriberCount };
    const localServicesCounter = { value: localServicesSubscriberCount };
    const localModelCounter = { value: localModelSubscriberCount };
    const automationDefinitionCounter = { value: automationDefinitionSubscriberCount };
    const automationRunCounter = { value: automationRunSubscriberCount };
    const resourceMonitorCounter = { value: resourceMonitorSubscriberCount };

    const unsubQuotaOverview = subscribeOnce(
      store,
      "quota_overview_updated",
      (data: unknown) => {
        const client = getAtmosWebQueryClient();
        applyQuotaOverviewUpdated(client, getComputerQueryScope(), data);
      },
      quotaOverviewCounter,
    );
    quotaOverviewSubscriberCount = quotaOverviewCounter.value;

    const unsubTokenUsage = subscribeOnce(
      store,
      "token_usage_updated",
      () => {
        invalidateTokenUsageQueries(getAtmosWebQueryClient(), getComputerQueryScope());
      },
      tokenUsageCounter,
    );
    tokenUsageSubscriberCount = tokenUsageCounter.value;

    const unsubLocalServices = subscribeOnce(
      store,
      "local_services_updated",
      (data: unknown) => {
        const client = getAtmosWebQueryClient();
        applyLocalServicesUpdated(client, getComputerQueryScope(), data);
      },
      localServicesCounter,
    );
    localServicesSubscriberCount = localServicesCounter.value;

    const unsubLocalModel = subscribeOnce(
      store,
      "local_model_state_changed",
      () => {
        invalidateLocalModelQueries(getAtmosWebQueryClient(), getComputerQueryScope());
      },
      localModelCounter,
    );
    localModelSubscriberCount = localModelCounter.value;

    const unsubAutomationDefinition = subscribeOnce(
      store,
      "automation_definition_updated",
      () => {
        invalidateAutomationDefinitionQueries(getAtmosWebQueryClient(), getComputerQueryScope());
      },
      automationDefinitionCounter,
    );
    automationDefinitionSubscriberCount = automationDefinitionCounter.value;

    const unsubAutomationRun = subscribeOnce(
      store,
      "automation_run_updated",
      () => {
        invalidateAutomationRunQueries(getAtmosWebQueryClient(), getComputerQueryScope());
      },
      automationRunCounter,
    );
    automationRunSubscriberCount = automationRunCounter.value;

    const unsubResourceMonitor = subscribeOnce(
      store,
      "resource_monitor_updated",
      (data: unknown) => {
        const client = getAtmosWebQueryClient();
        applyResourceMonitorUpdated(client, getComputerQueryScope(), data);
      },
      resourceMonitorCounter,
    );
    resourceMonitorSubscriberCount = resourceMonitorCounter.value;

    cleanupRef.current = () => {
      unsubQuotaOverview();
      quotaOverviewSubscriberCount = Math.max(0, quotaOverviewSubscriberCount - 1);
      unsubTokenUsage();
      tokenUsageSubscriberCount = Math.max(0, tokenUsageSubscriberCount - 1);
      unsubLocalServices();
      localServicesSubscriberCount = Math.max(0, localServicesSubscriberCount - 1);
      unsubLocalModel();
      localModelSubscriberCount = Math.max(0, localModelSubscriberCount - 1);
      unsubAutomationDefinition();
      automationDefinitionSubscriberCount = Math.max(0, automationDefinitionSubscriberCount - 1);
      unsubAutomationRun();
      automationRunSubscriberCount = Math.max(0, automationRunSubscriberCount - 1);
      unsubResourceMonitor();
      resourceMonitorSubscriberCount = Math.max(0, resourceMonitorSubscriberCount - 1);
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [connectionState]);

  return null;
}
