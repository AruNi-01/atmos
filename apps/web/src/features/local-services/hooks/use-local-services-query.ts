"use client";

import { useQuery } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import type { LocalServicesScanRequest } from "@/api/ws/local-services-api";
import { localServicesScanQueryOptions } from "@/features/local-services/lib/local-services-query-options";

export function useLocalServicesScanQuery(
  request: LocalServicesScanRequest,
  options?: { enabled?: boolean },
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(localServicesScanQueryOptions(scope, connectionState, request, options));
}
