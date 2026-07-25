"use client";

import { wsProjectApi } from "@/api/ws-api";
import { queryKeys } from "@/api/query/query-keys";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import type { Group, Project, WorkspaceLabel } from "@/shared/types/domain";
import { mapProjectModel, mapWorkspaceModel, sortWorkspaces } from "@/features/project/store/project-store-mappers";
import { waitForConnection } from "@/features/project/store/project-store-connection";
import type { GroupModel } from "@/api/ws-api-types";

export interface ProjectBootstrapSnapshot {
  projects: Project[];
  workspaceLabels: WorkspaceLabel[];
  groups: Group[];
}

export function mapGroupModel(model: GroupModel): Group {
  return {
    id: model.guid,
    name: model.name,
    sidebarOrder: model.sidebar_order,
    members: (model.members ?? []).map((member) => ({
      id: member.guid,
      memberType: member.member_type === "workspace" ? "workspace" : "project",
      memberId: member.member_guid,
      sortOrder: member.sort_order,
    })),
  };
}

export async function fetchProjectBootstrapSnapshot(): Promise<ProjectBootstrapSnapshot> {
  await waitForConnection();
  const bootstrap = await wsProjectApi.bootstrap();
  const workspaceLabels: WorkspaceLabel[] = bootstrap.workspace_labels.map((label) => ({
    id: label.guid,
    name: label.name,
    color: label.color,
    source: (label.source as "manual" | "gitHub_issue" | "gitHub_pr") || "manual",
    createdAt: label.created_at,
  }));

  const projects = bootstrap.projects.map((p) => {
    const workspaces = bootstrap.workspaces_by_project[p.guid] ?? [];
    const mappedWorkspaces = workspaces.map(mapWorkspaceModel);
    return mapProjectModel(p, sortWorkspaces(mappedWorkspaces));
  });

  projects.sort((a, b) => a.sidebarOrder - b.sidebarOrder);
  const groups = (bootstrap.groups ?? [])
    .map(mapGroupModel)
    .sort((a, b) => a.sidebarOrder - b.sidebarOrder);
  return { projects, workspaceLabels, groups };
}

export function projectBootstrapQueryOptions(
  scope: ComputerQueryScope,
  connectionState: "connecting" | "connected" | "disconnected" | "reconnecting",
  options?: { enabled?: boolean },
) {
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.projectBootstrap(scope),
    queryFn: fetchProjectBootstrapSnapshot,
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}
