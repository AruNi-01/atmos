"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import {
  getComputerQueryScope,
  useComputerQueryScope,
  type ComputerQueryScope,
} from "@/api/query/query-scope";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  fetchProjectBootstrapSnapshot,
  projectBootstrapQueryOptions,
  type ProjectBootstrapSnapshot,
} from "@/features/project/lib/project-query-options";
import type { Project, WorkspaceLabel } from "@/shared/types/domain";

export function projectBootstrapKey(scope = getComputerQueryScope()) {
  return queryKeys.computer.projectBootstrap(scope);
}

/** Patch only an existing snapshot at a captured scope (no-op if absent). */
export function patchProjectBootstrapSnapshotAt(
  scope: ComputerQueryScope,
  updater: (current: ProjectBootstrapSnapshot) => ProjectBootstrapSnapshot,
): void {
  try {
    const client = getAtmosWebQueryClient();
    const key = queryKeys.computer.projectBootstrap(scope);
    const current = client.getQueryData<ProjectBootstrapSnapshot>(key);
    if (!current) return;
    client.setQueryData(key, updater(current));
  } catch {
    // ignore outside browser
  }
}

export function setProjectBootstrapSnapshotAt(
  scope: ComputerQueryScope,
  snapshot: ProjectBootstrapSnapshot,
): void {
  try {
    const client = getAtmosWebQueryClient();
    client.setQueryData(queryKeys.computer.projectBootstrap(scope), snapshot);
  } catch {
    // ignore outside browser
  }
}

/** Cancel in-flight bootstrap for scope before applying a mutation patch. */
export async function cancelProjectBootstrapQuery(
  scope?: ComputerQueryScope,
): Promise<void> {
  const client = getAtmosWebQueryClient();
  await client.cancelQueries({
    queryKey: queryKeys.computer.projectBootstrap(scope ?? getComputerQueryScope()),
  });
}

export function useProjectBootstrapQuery(options?: { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  return useQuery(
    projectBootstrapQueryOptions(scope, connectionState, {
      enabled: options?.enabled,
    }),
  );
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
  // isLoading = isPending && isFetching — true only with no data yet, not background refetch
  return query.isLoading;
}

export function getProjectBootstrapSnapshot(): ProjectBootstrapSnapshot | undefined {
  try {
    const client = getAtmosWebQueryClient();
    return client.getQueryData<ProjectBootstrapSnapshot>(projectBootstrapKey());
  } catch {
    return undefined;
  }
}

export function setProjectBootstrapSnapshot(snapshot: ProjectBootstrapSnapshot): void {
  setProjectBootstrapSnapshotAt(getComputerQueryScope(), snapshot);
}

export function patchProjectBootstrapSnapshot(
  updater: (current: ProjectBootstrapSnapshot) => ProjectBootstrapSnapshot,
): void {
  // Never seed an empty snapshot into a fresh Computer scope (e.g. late mutation
  // after target change). Only patch when Query already owns a bootstrap entry.
  patchProjectBootstrapSnapshotAt(getComputerQueryScope(), updater);
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
      const current = queryClient.getQueryData<ProjectBootstrapSnapshot>(key);
      if (!current) return;
      queryClient.setQueryData(key, updater(current));
    },
  };
}

export type { ProjectBootstrapSnapshot };
