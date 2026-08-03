"use client";

import { queryKeys } from "@/api/query/query-keys";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import {
  localServicesApi,
  type LocalServicesScanRequest,
  type LocalServicesScanResponse,
} from "@/api/ws/local-services-api";
import { localServicesScopeKey } from "@/features/local-services/store/local-services-store";

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

export function localServicesScanQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  request: LocalServicesScanRequest,
  options?: { enabled?: boolean },
) {
  const scopeKey = localServicesScopeKey(request);
  return wsQueryOptions({
    scope,
    connectionState,
    enabled: options?.enabled,
    queryKey: queryKeys.computer.localServicesScan(scope, scopeKey),
    queryFn: (): Promise<LocalServicesScanResponse> => localServicesApi.scan(request),
    // Forced scans must bypass the normal stale window so Refresh hits the network.
    // Auto-refresh is server-driven (`local_services_updated`); no client refetchInterval.
    staleTime: request.force ? 0 : 30_000,
  });
}
