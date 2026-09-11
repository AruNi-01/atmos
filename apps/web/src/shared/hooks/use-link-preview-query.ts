"use client";

import { useQuery } from "@tanstack/react-query";
import { wsComputerQueryEnabled } from "@/api/query/computer-query-options";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  linkPreviewQueryOptions,
} from "@/shared/lib/link-preview-query";
import {
  localLinkPreviewFallback,
  normalizeHttpUrl,
} from "@/shared/lib/link-preview";

export function useLinkPreviewQuery(params: {
  url?: string | null;
  enabled?: boolean;
}) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const url = normalizeHttpUrl(params.url) ?? "";
  const enabled = (params.enabled ?? true) && Boolean(url);
  const wsAvailable = wsComputerQueryEnabled(scope, connectionState);

  const query = useQuery(
    linkPreviewQueryOptions(
      scope,
      connectionState,
      { url },
      { enabled: enabled && wsAvailable },
    ),
  );

  const fallback = url ? localLinkPreviewFallback(url) : null;
  return {
    data: query.data ?? fallback,
    isFetching: enabled && wsAvailable && query.isFetching && !query.data,
    isError: enabled && wsAvailable && query.isError && !query.data,
  };
}
