"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { skillsListQueryOptions } from "@/features/skills/lib/skills-query-options";
import { queryKeys } from "@/api/query/query-keys";

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
