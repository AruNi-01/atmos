import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ProjectModel, ProjectWorkspaceBootstrapResponse, WorkspaceModel } from "@/api/types";

const RECENT_WORKSPACE_LIMIT = 5;

export type RecentWorkspaceRecord = {
  lastAccessedAt: string;
  projectGuid: string | null;
  projectName: string | null;
  serverId: string | null;
  workspaceId: string;
  workspaceName: string;
};

type RecentWorkspaceInput = {
  project: ProjectModel | null;
  serverId: string | null;
  workspace: WorkspaceModel;
};

type RecentWorkspaceState = {
  recentWorkspaces: RecentWorkspaceRecord[];
  recordWorkspaceVisit: (input: RecentWorkspaceInput) => void;
};

export const useRecentWorkspacesStore = create<RecentWorkspaceState>()(
  persist(
    (set) => ({
      recentWorkspaces: [],
      recordWorkspaceVisit: ({ project, serverId, workspace }) =>
        set((state) => {
          const nextRecord: RecentWorkspaceRecord = {
            lastAccessedAt: new Date().toISOString(),
            projectGuid: project?.guid ?? workspace.project_guid ?? null,
            projectName: project?.name ?? null,
            serverId,
            workspaceId: workspace.guid,
            workspaceName: workspace.display_name ?? workspace.name,
          };

          return {
            recentWorkspaces: [
              nextRecord,
              ...state.recentWorkspaces.filter(
                (record) => record.workspaceId !== workspace.guid || record.serverId !== serverId,
              ),
            ].slice(0, RECENT_WORKSPACE_LIMIT),
          };
        }),
    }),
    {
      name: "atmos.mobile.recent-workspaces",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export function hydrateRecentWorkspaces(
  records: RecentWorkspaceRecord[],
  bootstrap: ProjectWorkspaceBootstrapResponse,
) {
  const projectsByGuid = new Map(bootstrap.projects.map((project) => [project.guid, project]));
  const workspacesByGuid = new Map(
    Object.values(bootstrap.workspaces_by_project)
      .flat()
      .map((workspace) => [workspace.guid, workspace]),
  );

  return records.slice(0, RECENT_WORKSPACE_LIMIT).map((record) => {
    const workspace = workspacesByGuid.get(record.workspaceId);
    if (!workspace) return record;

    const project = projectsByGuid.get(workspace.project_guid) ?? null;
    return {
      ...record,
      projectGuid: project?.guid ?? workspace.project_guid ?? record.projectGuid,
      projectName: project?.name ?? record.projectName,
      workspaceName: workspace.display_name ?? workspace.name,
    };
  });
}
