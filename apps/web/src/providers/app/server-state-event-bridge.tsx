"use client";

import { useEffect, useRef } from "react";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";
import { getComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { applyUsageOverviewUpdated } from "@/features/usage/lib/usage-query-events";
import { invalidateTokenUsageQueries } from "@/features/usage/lib/token-usage-query-options";
import { invalidateLocalModelQueries } from "@/features/local-services/lib/local-model-query-options";
import { invalidateAutomationDefinitionQueries, invalidateAutomationRunQueries } from "@/features/automations/lib/automations-query-options";

let usageOverviewSubscriberCount = 0;
let tokenUsageSubscriberCount = 0;
let localModelSubscriberCount = 0;
let automationDefinitionSubscriberCount = 0;
let automationRunSubscriberCount = 0;

/** Test helpers: expose per-domain subscription counts. */
export function getUsageOverviewBridgeSubscriberCount(): number {
  return usageOverviewSubscriberCount;
}
export function getTokenUsageBridgeSubscriberCount(): number {
  return tokenUsageSubscriberCount;
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
    const usageOverviewCounter = { value: usageOverviewSubscriberCount };
    const tokenUsageCounter = { value: tokenUsageSubscriberCount };
    const localModelCounter = { value: localModelSubscriberCount };
    const automationDefinitionCounter = { value: automationDefinitionSubscriberCount };
    const automationRunCounter = { value: automationRunSubscriberCount };

    const unsubUsageOverview = subscribeOnce(
      store,
      "usage_overview_updated",
      (data: unknown) => {
        const client = getAtmosWebQueryClient();
        applyUsageOverviewUpdated(client, getComputerQueryScope(), data);
      },
      usageOverviewCounter,
    );
    usageOverviewSubscriberCount = usageOverviewCounter.value;

    const unsubTokenUsage = subscribeOnce(
      store,
      "token_usage_updated",
      () => {
        invalidateTokenUsageQueries(getAtmosWebQueryClient(), getComputerQueryScope());
      },
      tokenUsageCounter,
    );
    tokenUsageSubscriberCount = tokenUsageCounter.value;

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

    cleanupRef.current = () => {
      unsubUsageOverview();
      usageOverviewSubscriberCount = Math.max(0, usageOverviewSubscriberCount - 1);
      unsubTokenUsage();
      tokenUsageSubscriberCount = Math.max(0, tokenUsageSubscriberCount - 1);
      unsubLocalModel();
      localModelSubscriberCount = Math.max(0, localModelSubscriberCount - 1);
      unsubAutomationDefinition();
      automationDefinitionSubscriberCount = Math.max(0, automationDefinitionSubscriberCount - 1);
      unsubAutomationRun();
      automationRunSubscriberCount = Math.max(0, automationRunSubscriberCount - 1);
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [connectionState]);

  return null;
}
