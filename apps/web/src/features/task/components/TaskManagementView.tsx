"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryState, useQueryStates } from "nuqs";
import { useShallow } from "zustand/react/shallow";
import { Tabs, TabsList, TabsTab } from "@workspace/ui";
import LogoSvg from "@workspace/ui/components/logo-svg";
import { Github } from "lucide-react";
import {
  useGroups,
  useProjects,
  useWorkspaceLabels,
} from "@/features/project/hooks/use-project-bootstrap-query";
import { useProjectStore } from "@/features/project/store/use-project-store";
import {
  createGroup,
  removeGroupMember,
  setGroupMember,
} from "@/features/project/lib/group-actions";
import { functionSettingsApi } from "@/api/ws-api";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { isComputerQueryScopeCurrent } from "@/api/ws/request";
import { WorkspaceKanbanView } from "@/app-shell/sidebar/WorkspaceKanbanView";
import type { WorkspaceKanbanFilters } from "@/app-shell/sidebar/WorkspaceKanbanFilterMenu";
import type { SidebarGroupingMode } from "@/app-shell/sidebar/workspace-status";
import { TaskGithubPanel } from "@/features/task/components/TaskGithubPanel";
import {
  taskParams,
  type TaskSourceTab,
} from "@/shared/lib/nuqs/searchParams";
import type {
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";

const WORKFLOW_STATUSES = new Set<WorkspaceWorkflowStatus>([
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "completed",
  "canceled",
]);

const PRIORITIES = new Set<WorkspacePriority>([
  "no_priority",
  "urgent",
  "high",
  "medium",
  "low",
]);

/** Atmos mark sized for coss TabsTab icon slots. */
function AtmosTabIcon({ className }: { className?: string }) {
  return <LogoSvg className={className} width={14} height={14} aria-hidden />;
}

export function TaskManagementView() {
  const t = useTranslations("appShell.task");
  const projects = useProjects();
  const availableLabels = useWorkspaceLabels();
  const groups = useGroups();
  const {
    pinWorkspace,
    unpinWorkspace,
    archiveWorkspace,
    deleteWorkspace,
    createWorkspaceLabel,
    updateWorkspaceLabel,
    updateWorkspaceLabels,
    updateWorkspaceWorkflowStatus,
    updateWorkspacePriority,
  } = useProjectStore(
    useShallow((s) => ({
      pinWorkspace: s.pinWorkspace,
      unpinWorkspace: s.unpinWorkspace,
      archiveWorkspace: s.archiveWorkspace,
      deleteWorkspace: s.deleteWorkspace,
      createWorkspaceLabel: s.createWorkspaceLabel,
      updateWorkspaceLabel: s.updateWorkspaceLabel,
      updateWorkspaceLabels: s.updateWorkspaceLabels,
      updateWorkspaceWorkflowStatus: s.updateWorkspaceWorkflowStatus,
      updateWorkspacePriority: s.updateWorkspacePriority,
    })),
  );

  const { activeInstanceId, connectionEpoch, relaySessionRevision } =
    useComputerQueryScope();

  const [sourceTab, setSourceTab] = useQueryState("taskSource", taskParams.taskSource);
  const [groupingMode, setGroupingMode] = useQueryState("taskGroupBy", taskParams.taskGroupBy);
  const [atmosFilterParams, setAtmosFilterParams] = useQueryStates({
    taskStatuses: taskParams.taskStatuses,
    taskPriorities: taskParams.taskPriorities,
    taskLabels: taskParams.taskLabels,
    taskProjects: taskParams.taskProjects,
    taskGroups: taskParams.taskGroups,
    taskAutoWs: taskParams.taskAutoWs,
  });

  const filters = useMemo<WorkspaceKanbanFilters>(
    () => ({
      statuses: atmosFilterParams.taskStatuses.filter(
        (item): item is WorkspaceWorkflowStatus =>
          WORKFLOW_STATUSES.has(item as WorkspaceWorkflowStatus),
      ),
      priorities: atmosFilterParams.taskPriorities.filter(
        (item): item is WorkspacePriority => PRIORITIES.has(item as WorkspacePriority),
      ),
      labelIds: atmosFilterParams.taskLabels,
      projectIds: atmosFilterParams.taskProjects,
      groupIds: atmosFilterParams.taskGroups,
      showAutomationWorkspaces: atmosFilterParams.taskAutoWs,
    }),
    [atmosFilterParams],
  );

  const handleFiltersChange = useCallback(
    (next: WorkspaceKanbanFilters) => {
      void setAtmosFilterParams({
        taskStatuses: next.statuses,
        taskPriorities: next.priorities,
        taskLabels: next.labelIds,
        taskProjects: next.projectIds,
        taskGroups: next.groupIds,
        taskAutoWs: next.showAutomationWorkspaces,
      });
    },
    [setAtmosFilterParams],
  );

  const handleGroupingModeChange = useCallback(
    (mode: SidebarGroupingMode) => {
      void setGroupingMode(mode);
      const expectedScope = {
        activeInstanceId,
        connectionEpoch,
        relaySessionRevision,
      };
      // Keep function-settings in sync so left-sidebar grouping stays aligned.
      void functionSettingsApi
        .update("workspace_sidebar", "grouping_mode", mode, expectedScope)
        .catch((error) => {
          if (!isComputerQueryScopeCurrent(expectedScope)) return;
          console.error('Failed to persist workspace sidebar setting "grouping_mode":', error);
        });
    },
    [activeInstanceId, connectionEpoch, relaySessionRevision, setGroupingMode],
  );

  const handleSetWorkspaceGroup = useCallback(async (workspaceId: string, groupId: string | null) => {
    if (!groupId) {
      await removeGroupMember({ memberType: "workspace", memberId: workspaceId });
      return;
    }
    await setGroupMember({
      groupId,
      memberType: "workspace",
      memberId: workspaceId,
    });
  }, []);

  const handleCreateGroupNamed = useCallback(async (name: string) => {
    return createGroup(name);
  }, []);

  const handleSourceChange = useCallback(
    (value: string) => {
      if (value === "atmos" || value === "github") {
        void setSourceTab(value);
      }
    },
    [setSourceTab],
  );

  /**
   * Host for Atmos toolbar (search / settings / filter) or GitHub actions (+ / refresh).
   * Kept in this stable header so TabsList never unmounts when switching source —
   * otherwise the coss Indicator has nothing to animate between.
   */
  const [headerTrailingHost, setHeaderTrailingHost] = useState<HTMLDivElement | null>(null);

  // Same coss Tabs primitive as right-sidebar (`Tabs` + `TabsList` + Indicator).
  // TabsList must stay mounted across Atmos ↔ GitHub for the sliding pill animation.
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
      <Tabs
        value={sourceTab}
        onValueChange={handleSourceChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b px-6">
          <TabsList className="h-8 shrink-0">
            <TabsTab value="atmos" className="gap-1.5 px-2.5 sm:h-7 sm:text-xs">
              <AtmosTabIcon className="size-3.5 shrink-0" />
              {t("source.atmos")}
            </TabsTab>
            <TabsTab value="github" className="gap-1.5 px-2.5 sm:h-7 sm:text-xs">
              <Github className="size-3.5 shrink-0" />
              {t("source.github")}
            </TabsTab>
          </TabsList>
          <div
            ref={setHeaderTrailingHost}
            className="ml-auto flex min-w-0 items-center justify-end gap-1.5"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {sourceTab === "github" ? (
            <TaskGithubPanel projects={projects} headerTrailingHost={headerTrailingHost} />
          ) : (
            <WorkspaceKanbanView
              projects={projects}
              availableLabels={availableLabels}
              groups={groups}
              groupingMode={groupingMode}
              onGroupingModeChange={handleGroupingModeChange}
              onUpdateWorkflowStatus={updateWorkspaceWorkflowStatus}
              onUpdatePriority={updateWorkspacePriority}
              onSetWorkspaceGroup={handleSetWorkspaceGroup}
              onCreateGroup={handleCreateGroupNamed}
              onCreateLabel={createWorkspaceLabel}
              onUpdateLabel={updateWorkspaceLabel}
              onUpdateLabels={updateWorkspaceLabels}
              onPinWorkspace={pinWorkspace}
              onUnpinWorkspace={unpinWorkspace}
              onArchiveWorkspace={archiveWorkspace}
              onDeleteWorkspace={async (projectId, workspaceId) => {
                await deleteWorkspace(projectId, workspaceId);
              }}
              filters={filters}
              onFiltersChange={handleFiltersChange}
              /** Parent owns filters via nuqs — do not overwrite from function settings. */
              hydrateFiltersFromSettings={false}
              showTopChrome={false}
              headerTrailingHost={headerTrailingHost}
              showToolbarActions
            />
          )}
        </div>
      </Tabs>
    </div>
  );
}
