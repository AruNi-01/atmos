"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import type { ReviewTarget } from "@/api/ws/review-api";
import {
  reviewSessionsQueryOptions,
  reviewSessionsKey,
} from "@/features/code-review/lib/review-query-options";

export function useReviewSessionsQuery(target: ReviewTarget | null) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(reviewSessionsQueryOptions(scope, connectionState, target));
}

/** Invalidate the session list for a given target after a review mutation. */
export function useInvalidateReviewSessions() {
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();

  return (target: ReviewTarget) => {
    void queryClient.invalidateQueries({
      queryKey: reviewSessionsKey(scope, target),
      refetchType: "active",
    });
  };
}
