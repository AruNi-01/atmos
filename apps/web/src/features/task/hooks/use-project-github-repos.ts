"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { gitApi } from "@/api/ws-api";
import { queryKeys } from "@/api/query/query-keys";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import type { Project } from "@/shared/types/domain";

export type ProjectGithubRepo = {
  projectId: string;
  projectName: string;
  owner: string;
  repo: string;
  /** `owner/repo` */
  fullName: string;
  path: string;
};

const REPOS_STALE_MS = 5 * 60_000;
const REPOS_GC_MS = 30 * 60_000;

/**
 * Resolve GitHub owner/repo for each Atmos project via git status batch.
 * Dedupes by fullName (multiple projects can map to the same remote).
 *
 * Cached with TanStack Query so switching away from the Task GitHub tab and
 * back does not re-cold-load repo resolution every time.
 */
export function useProjectGithubRepos(projects: Project[], enabled = true) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  const pathKey = useMemo(
    () =>
      projects
        .map((p) => p.mainFilePath)
        .filter(Boolean)
        .sort()
        .join("\0"),
    [projects],
  );

  const projectByPath = useMemo(() => {
    const map = new Map<string, Project>();
    for (const project of projects) {
      if (project.mainFilePath) map.set(project.mainFilePath, project);
    }
    return map;
  }, [projects]);

  const paths = useMemo(
    () => (pathKey ? pathKey.split("\0").filter(Boolean) : []),
    [pathKey],
  );

  const query = useQuery(
    wsQueryOptions({
      scope,
      connectionState,
      enabled: enabled && paths.length > 0,
      queryKey: [
        ...queryKeys.computer.root(scope),
        "task",
        "projectGithubRepos",
        pathKey,
      ] as const,
      queryFn: async (): Promise<ProjectGithubRepo[]> => {
        const response = await gitApi.getStatuses(paths);
        const byFullName = new Map<string, ProjectGithubRepo>();
        for (const result of response.results) {
          const owner = result.status?.github_owner ?? null;
          const repo = result.status?.github_repo ?? null;
          if (!owner || !repo) continue;
          const project = projectByPath.get(result.path);
          if (!project) continue;
          const fullName = `${owner}/${repo}`;
          if (byFullName.has(fullName)) continue;
          byFullName.set(fullName, {
            projectId: project.id,
            projectName: project.name,
            owner,
            repo,
            fullName,
            path: result.path,
          });
        }
        return Array.from(byFullName.values()).sort((a, b) =>
          a.fullName.localeCompare(b.fullName),
        );
      },
      staleTime: REPOS_STALE_MS,
      gcTime: REPOS_GC_MS,
    }),
  );

  return {
    repos: query.data ?? [],
    loading: query.isLoading && !query.data,
  };
}
