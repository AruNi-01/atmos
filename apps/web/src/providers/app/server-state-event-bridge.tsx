"use client";

import { useEffect, useRef } from "react";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";
import { getComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { applyUsageOverviewUpdated } from "@/features/usage/lib/usage-query-events";

let usageOverviewSubscriberCount = 0;

/** Test helper: how many active usage overview bridge subscriptions exist. */
export function getUsageOverviewBridgeSubscriberCount(): number {
  return usageOverviewSubscriberCount;
}

/**
 * Single app-level bridge for Query-owned WebSocket snapshot events (APP-035).
 * Mount once beside WebSocketProvider. Feature components must not duplicate these.
 */
export function ServerStateEventBridge() {
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (connectionState !== "connected") {
      unsubRef.current?.();
      unsubRef.current = null;
      return;
    }

    if (unsubRef.current) return;

    usageOverviewSubscriberCount += 1;
    const unsub = useWebSocketStore
      .getState()
      .onEvent("usage_overview_updated", (data: unknown) => {
        const client = getAtmosWebQueryClient();
        applyUsageOverviewUpdated(client, getComputerQueryScope(), data);
      });

    unsubRef.current = () => {
      usageOverviewSubscriberCount = Math.max(0, usageOverviewSubscriberCount - 1);
      unsub();
    };

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [connectionState]);

  return null;
}
