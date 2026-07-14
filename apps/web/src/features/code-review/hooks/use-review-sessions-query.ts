"use client";

import { useQuery } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import type { ReviewTarget } from "@/api/ws/review-api";
import { reviewSessionsQueryOptions } from "@/features/code-review/lib/review-query-options";

export function useReviewSessionsQuery(target: ReviewTarget | null) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(reviewSessionsQueryOptions(scope, connectionState, target));
}
