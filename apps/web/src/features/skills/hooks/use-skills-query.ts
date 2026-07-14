"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useComputerQueryScope, getComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { skillsListQueryOptions } from "@/features/skills/lib/skills-query-options";
import { queryKeys } from "@/api/query/query-keys";
import { skillsApi } from "@/api/ws/skills-api";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";

export function useSkillsListQuery() {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(skillsListQueryOptions(scope, connectionState));
}

/** Imperatively invalidate skills list after mutations (install, enable, delete, sync). */
export function useInvalidateSkillsList() {
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();

  return () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.computer.skillsList(scope),
      refetchType: "active",
    });
  };
}

/**
 * Force a backend re-scan (skills_list force_refresh=true) and write into the
 * shared Query cache. Plain invalidateQueries only reuses the non-force path.
 */
export async function forceRefreshSkillsList(): Promise<void> {
  const client = getAtmosWebQueryClient();
  const scope = getComputerQueryScope();
  const data = await skillsApi.list({ forceRefresh: true });
  client.setQueryData(queryKeys.computer.skillsList(scope), data);
}
