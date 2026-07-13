"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import {
  getComputerQueryScope,
  useComputerQueryScope,
} from "@/api/query/query-scope";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  fetchProjectBootstrapSnapshot,
  projectBootstrapQueryOptions,
  type ProjectBootstrapSnapshot,
} from "@/features/project/lib/project-query-options";
import type { Project, WorkspaceLabel } from "@/shared/types/domain";

export function useProjectBootstrapQuery(options?: { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  return useQuery({
    ...projectBootstrapQueryOptions(scope, connectionState),
    enabled: options?.enabled ?? true,
  });
}

export function useProjects(options?: { enabled?: boolean }): Project[] {
  const query = useProjectBootstrapQuery(options);
  return query.data?.projects ?? [];
}

export function useWorkspaceLabels(options?: { enabled?: boolean }): WorkspaceLabel[] {
  const query = useProjectBootstrapQuery(options);
  return query.data?.workspaceLabels ?? [];
}

export function useProjectsLoading(): boolean {
  const query = useProjectBootstrapQuery();
  return query.isPending || query.isFetching;
}

export function getProjectBootstrapSnapshot(): ProjectBootstrapSnapshot | undefined {
  try {
    const client = getAtmosWebQueryClient();
    return client.getQueryData<ProjectBootstrapSnapshot>(
      queryKeys.computer.projectBootstrap(getComputerQueryScope()),
    );
  } catch {
    return undefined;
  }
}

export function setProjectBootstrapSnapshot(snapshot: ProjectBootstrapSnapshot): void {
  try {
    const client = getAtmosWebQueryClient();
    client.setQueryData(
      queryKeys.computer.projectBootstrap(getComputerQueryScope()),
      snapshot,
    );
  } catch {
    // ignore outside browser
  }
}

export function patchProjectBootstrapSnapshot(
  updater: (current: ProjectBootstrapSnapshot) => ProjectBootstrapSnapshot,
): void {
  const current = getProjectBootstrapSnapshot() ?? {
    projects: [],
    workspaceLabels: [],
  };
  setProjectBootstrapSnapshot(updater(current));
}

export async function ensureProjectBootstrap(): Promise<ProjectBootstrapSnapshot> {
  const client = getAtmosWebQueryClient();
  const scope = getComputerQueryScope();
  return client.ensureQueryData({
    queryKey: queryKeys.computer.projectBootstrap(scope),
    queryFn: fetchProjectBootstrapSnapshot,
    staleTime: 30_000,
  });
}

export async function invalidateProjectBootstrap(): Promise<void> {
  const client = getAtmosWebQueryClient();
  await client.invalidateQueries({
    queryKey: queryKeys.computer.projectBootstrap(getComputerQueryScope()),
  });
}

/** Hook helper for components that need the query client + key together. */
export function useProjectBootstrapCache() {
  const scope = useComputerQueryScope();
  const queryClient = useQueryClient();
  const key = queryKeys.computer.projectBootstrap(scope);
  return {
    key,
    get: () => queryClient.getQueryData<ProjectBootstrapSnapshot>(key),
    set: (snapshot: ProjectBootstrapSnapshot) => {
      queryClient.setQueryData(key, snapshot);
    },
    patch: (updater: (current: ProjectBootstrapSnapshot) => ProjectBootstrapSnapshot) => {
      const current = queryClient.getQueryData<ProjectBootstrapSnapshot>(key) ?? {
        projects: [],
        workspaceLabels: [],
      };
      queryClient.setQueryData(key, updater(current));
    },
  };
}

export type { ProjectBootstrapSnapshot };
