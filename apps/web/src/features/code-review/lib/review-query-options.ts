"use client";

import type { QueryKey } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import { reviewWsApi, type ReviewSessionDto, type ReviewTarget } from "@/api/ws/review-api";

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

function reviewTargetKey(target: ReviewTarget): {
  kind: string;
  targetId: string;
} {
  const targetId = target.kind === "workspace" ? target.workspaceId : target.projectId;
  return { kind: target.kind, targetId };
}

/** Stable key for a review target. Used to construct the TanStack Query key. */
export function reviewSessionsKey(
  scope: ComputerQueryScope,
  target: ReviewTarget,
): QueryKey {
  return queryKeys.computer.reviewSessions(scope, reviewTargetKey(target));
}

export function reviewSessionsQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  target: ReviewTarget | null,
) {
  const key = target
    ? queryKeys.computer.reviewSessions(scope, reviewTargetKey(target))
    : ([...queryKeys.computer.root(scope), "review", "sessions", "__none__"] as const);

  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: key as QueryKey,
    queryFn: (): Promise<ReviewSessionDto[]> =>
      target ? reviewWsApi.listSessions(target, true) : Promise.resolve([]),
    enabled: Boolean(target),
    staleTime: 15_000,
  });
}
