"use client";

import { useQuery } from "@tanstack/react-query";
import { wsComputerQueryEnabled } from "@/api/query/computer-query-options";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { githubUserCardQueryOptions } from "@/features/github/lib/github-query-options";
import {
  normalizeGithubLogin,
  publicGithubUserCardQueryOptions,
  resolveGithubUserCardSources,
  type GithubUserCardSource,
} from "@/features/github/lib/public-github-user-card";

export type { GithubUserCardSource };

export function useGithubUserCardQuery(params: {
  login?: string | null;
  enabled?: boolean;
  source?: GithubUserCardSource;
}) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const login = normalizeGithubLogin(params.login) ?? "";
  const enabled = (params.enabled ?? true) && Boolean(login);
  const source = params.source ?? "auto";
  const wsAvailable = wsComputerQueryEnabled(scope, connectionState);
  const useWs = source !== "public" && wsAvailable;

  const wsQuery = useQuery(
    githubUserCardQueryOptions(
      scope,
      connectionState,
      { login },
      { enabled: enabled && useWs },
    ),
  );

  const { usePublic } = resolveGithubUserCardSources(
    source,
    wsAvailable,
    wsQuery.isError,
  );

  const publicQuery = useQuery(
    publicGithubUserCardQueryOptions(
      { login },
      { enabled: enabled && usePublic },
    ),
  );

  const card = wsQuery.data ?? publicQuery.data;
  const isFetching =
    (enabled && useWs && wsQuery.isFetching) ||
    (enabled && usePublic && publicQuery.isFetching && !card);
  const isError = Boolean(
    enabled &&
      !card &&
      ((useWs && wsQuery.isError && !usePublic) ||
        (usePublic && publicQuery.isError)),
  );

  return { data: card, isFetching, isError };
}
