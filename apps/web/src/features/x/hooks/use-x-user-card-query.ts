"use client";

import { useQuery } from "@tanstack/react-query";
import {
  normalizeXUsername,
  publicXUserCardQueryOptions,
} from "@/features/x/lib/public-x-user-card";

export function useXUserCardQuery(params: {
  username?: string | null;
  enabled?: boolean;
}) {
  const username = normalizeXUsername(params.username) ?? "";
  const enabled = (params.enabled ?? true) && Boolean(username);

  const query = useQuery(
    publicXUserCardQueryOptions({ username }, { enabled }),
  );

  return {
    data: query.data,
    isFetching: enabled && query.isFetching,
    isError: enabled && query.isError && !query.data,
  };
}
