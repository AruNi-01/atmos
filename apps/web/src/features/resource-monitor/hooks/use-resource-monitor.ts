"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { resourceMonitorApi } from "@/api/ws/resource-monitor-api";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  canFetchDesktopShellMetrics,
  desktopShellMetricsQueryKey,
  fetchDesktopShellMetrics,
} from "@/features/resource-monitor/lib/desktop-shell-metrics";
import {
  RESOURCE_MONITOR_IDLE_MS,
  RESOURCE_MONITOR_INTERACTIVE_MS,
} from "@/features/resource-monitor/lib/resource-monitor-constants";
import { resourceMonitorSnapshotQueryOptions } from "@/features/resource-monitor/lib/resource-monitor-query-options";
import { createResourceMonitorSubscriptionController } from "@/features/resource-monitor/lib/resource-monitor-subscription";
import { isElectronShell } from "@/shared/lib/desktop-bridge";

export function useResourceMonitor(options: {
  enabled: boolean;
  interactive: boolean;
}) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const connectionMode = useAtmosComputerStore((s) => s.connectionMode);
  const queryClient = useQueryClient();
  const electron = typeof window !== "undefined" ? isElectronShell() : false;
  const showDesktop = canFetchDesktopShellMetrics(electron, connectionMode);

  const controllerRef = useRef<ReturnType<
    typeof createResourceMonitorSubscriptionController
  > | null>(null);
  if (controllerRef.current == null) {
    controllerRef.current = createResourceMonitorSubscriptionController({
      subscribe: (expectedScope) => resourceMonitorApi.subscribe(expectedScope),
      unsubscribe: (expectedScope) => resourceMonitorApi.unsubscribe(expectedScope),
      isConnected: () => useWebSocketStore.getState().connectionState === "connected",
      seedSnapshot: (expectedScope, snapshot) => {
        queryClient.setQueryData(
          queryKeys.computer.resourceMonitorSnapshot(expectedScope),
          snapshot,
        );
      },
    });
  }

  const serverQuery = useQuery(
    resourceMonitorSnapshotQueryOptions(scope, connectionState, {
      enabled: options.enabled && connectionState === "connected",
      refetchInterval:
        options.enabled && !options.interactive && connectionState === "connected"
          ? RESOURCE_MONITOR_IDLE_MS
          : false,
    }),
  );

  const desktopQuery = useQuery({
    queryKey: desktopShellMetricsQueryKey(connectionMode, electron),
    queryFn: fetchDesktopShellMetrics,
    enabled: options.enabled && showDesktop,
    refetchInterval: options.interactive
      ? RESOURCE_MONITOR_INTERACTIVE_MS
      : RESOURCE_MONITOR_IDLE_MS,
    staleTime: options.interactive
      ? RESOURCE_MONITOR_INTERACTIVE_MS
      : RESOURCE_MONITOR_IDLE_MS,
    retry: false,
  });

  useEffect(() => {
    if (!options.enabled || !options.interactive || connectionState !== "connected") {
      return;
    }
    return controllerRef.current?.attach(scope);
  }, [
    options.enabled,
    options.interactive,
    connectionState,
    scope,
  ]);

  return {
    connectionState,
    showDesktop,
    snapshot: serverQuery.data,
    isLoading: serverQuery.isLoading && serverQuery.data == null,
    isFetching: serverQuery.isFetching,
    lastUpdatedAtMs: serverQuery.dataUpdatedAt,
    desktop: desktopQuery.data,
    desktopLoading: desktopQuery.isLoading && desktopQuery.data == null,
  };
}
