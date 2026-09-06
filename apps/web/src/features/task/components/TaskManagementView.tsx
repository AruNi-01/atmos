"use client";

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryState, useQueryStates } from "nuqs";
import { useShallow } from "zustand/react/shallow";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/motion/tabs";
import LogoSvg from "@workspace/ui/components/logo-svg";

import { LinearIcon } from "@workspace/ui/components/icons/linear-icon";
import { cn } from "@workspace/ui";
import { Github } from "@workspace/ui/components/icons/lucide-brand-icons";
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
import { TaskLinearPanel } from "@/features/task/components/TaskLinearPanel";
import {
  taskParams,
  type TaskSourceTab,
} from "@/shared/lib/nuqs/searchParams";
import {
  readStoredTaskSource,
  writeStoredTaskSource,
} from "@/features/task/lib/task-source-preference";
import type {
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";

function isTaskSourceTab(value: unknown): value is TaskSourceTab {
  return value === "atmos" || value === "github" || value === "linear";
}

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

/** Atmos mark sized for beui TabsTrigger icon slots. */
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

  // Seed from localStorage synchronously so first paint matches last tab when URL omits taskSource.
  // URL still wins for deep links (`?taskSource=linear`).
  const restoredSourceRef = useRef(false);
  useLayoutEffect(() => {
    if (restoredSourceRef.current) return;
    restoredSourceRef.current = true;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has("taskSource")) {
        if (isTaskSourceTab(sourceTab)) writeStoredTaskSource(sourceTab);
        return;
      }
      const stored = readStoredTaskSource();
      if (stored && stored !== sourceTab) {
        void setSourceTab(stored);
      }
    } catch {
      /* ignore storage / URL errors */
    }
    // One-shot restore only — do not re-run on tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot restore
  }, []);

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
      if (!isTaskSourceTab(value)) return;
      // Ignore no-op / mount echoes so a default "atmos" cannot clobber stored "linear".
      if (value === sourceTab) return;
      writeStoredTaskSource(value);
      void setSourceTab(value);
    },
    [setSourceTab, sourceTab],
  );

  /**
   * Host for Atmos toolbar (search / settings / filter) or GitHub/Linear actions.
   * Kept in this stable header so TabsList never unmounts when switching source —
   * otherwise the layoutId spring indicator has nothing to animate between.
   */
  const [headerTrailingHost, setHeaderTrailingHost] = useState<HTMLDivElement | null>(null);

  /**
   * Keep source panels mounted after first visit so TanStack Query observers stay
   * active and remount does not re-cold-load GitHub/Linear lists.
   */
  const [visitedSources, setVisitedSources] = useState<Record<TaskSourceTab, boolean>>(() => ({
    atmos: sourceTab === "atmos",
    github: sourceTab === "github",
    linear: sourceTab === "linear",
  }));
  useLayoutEffect(() => {
    setVisitedSources((prev) =>
      prev[sourceTab] ? prev : { ...prev, [sourceTab]: true },
    );
  }, [sourceTab]);

  // Native beui pill tabs (layoutId spring indicator).
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
      <Tabs
        value={sourceTab}
        onValueChange={handleSourceChange}
        variant="pill"
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex h-12 shrink-0 items-center gap-2 px-6 pt-3">
          {/*
            Tabs + trailing actions share h-7 so the header row stays level.
            (icon-xs defaults to sm:size-6 — trailing buttons force size-7.)
          */}
          <TabsList className="h-8 gap-0.5 p-0.5">
            <TabsTrigger value="atmos" className="h-7 gap-1.5 px-3 text-xs">
              <AtmosTabIcon className="size-3.5 shrink-0" />
              {t("source.atmos")}
            </TabsTrigger>
            <TabsTrigger value="github" className="h-7 gap-1.5 px-3 text-xs">
              <Github className="size-3.5 shrink-0" />
              {t("source.github")}
            </TabsTrigger>
            <TabsTrigger value="linear" className="h-7 gap-1.5 px-3 text-xs">
              <LinearIcon className="size-3.5 shrink-0" size={14} />
              {t("source.linear")}
            </TabsTrigger>
          </TabsList>
          <div
            ref={setHeaderTrailingHost}
            className="ml-auto flex h-7 min-w-0 items-center justify-end gap-1.5"
          />
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {visitedSources.atmos ? (
            <div
              className={cn(
                "absolute inset-0 min-h-0 min-w-0",
                sourceTab === "atmos" ? "flex flex-col" : "hidden",
              )}
              aria-hidden={sourceTab !== "atmos"}
            >
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
                headerTrailingHost={sourceTab === "atmos" ? headerTrailingHost : null}
                showToolbarActions
              />
            </div>
          ) : null}

          {visitedSources.github ? (
            <div
              className={cn(
                "absolute inset-0 min-h-0 min-w-0",
                sourceTab === "github" ? "flex flex-col" : "hidden",
              )}
              aria-hidden={sourceTab !== "github"}
            >
              <TaskGithubPanel
                projects={projects}
                headerTrailingHost={sourceTab === "github" ? headerTrailingHost : null}
              />
            </div>
          ) : null}

          {visitedSources.linear ? (
            <div
              className={cn(
                "absolute inset-0 min-h-0 min-w-0",
                sourceTab === "linear" ? "flex flex-col" : "hidden",
              )}
              aria-hidden={sourceTab !== "linear"}
            >
              <TaskLinearPanel
                headerTrailingHost={sourceTab === "linear" ? headerTrailingHost : null}
              />
            </div>
          ) : null}
        </div>
      </Tabs>
    </div>
  );
}
