"use client";

import { queryKeys } from "@/api/query/query-keys";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import { skillsApi, type SkillInfo } from "@/api/ws/skills-api";

export interface SkillsListResponse {
  skills: SkillInfo[];
}

export function skillsListQueryOptions(
  scope: ComputerQueryScope,
  connectionState: "connecting" | "connected" | "disconnected" | "reconnecting",
) {
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.skillsList(scope),
    queryFn: (): Promise<SkillsListResponse> => skillsApi.list(),
    staleTime: 30_000,
  });
}
