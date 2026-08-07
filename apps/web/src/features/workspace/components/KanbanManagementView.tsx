"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
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
import { EMPTY_WORKSPACE_KANBAN_FILTERS } from "@/app-shell/left-sidebar-settings";
import type { WorkspaceKanbanFilters } from "@/app-shell/sidebar/WorkspaceKanbanFilterMenu";
import type { SidebarGroupingMode } from "@/app-shell/sidebar/workspace-status";

export function KanbanManagementView() {
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

  // Destructure primitives so effect deps stay stable. Do not depend on the
  // scope object itself — even with memoization, prefer value equality here
  // to match LeftSidebar's settings-load pattern.
  const { activeInstanceId, connectionEpoch, relaySessionRevision } =
    useComputerQueryScope();
  const settingsScopeKey = `${activeInstanceId}:${connectionEpoch}:${relaySessionRevision}`;
  const [filters, setFilters] = useState<WorkspaceKanbanFilters>(EMPTY_WORKSPACE_KANBAN_FILTERS);
  const [groupingMode, setGroupingMode] = useState<SidebarGroupingMode>("status");

  // Only hydrate grouping_mode here. Filters are owned by WorkspaceKanbanView's
  // workspace_kanban_view load — setting them from both places races and can
  // clobber the child's hydrate (or user edits) when this request finishes last.
  useEffect(() => {
    let cancelled = false;
    void functionSettingsApi
      .get()
      .then((settings) => {
        if (cancelled) return;
        const mode = settings.workspace_sidebar?.grouping_mode;
        if (
          mode === "project" ||
          mode === "group" ||
          mode === "status" ||
          mode === "time" ||
          mode === "label" ||
          mode === "priority"
        ) {
          setGroupingMode(mode);
        }
      })
      .catch(() => {
        // Keep defaults when settings are unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [settingsScopeKey]);

  const handleGroupingModeChange = useCallback(
    (mode: SidebarGroupingMode) => {
      setGroupingMode(mode);
      const expectedScope = {
        activeInstanceId,
        connectionEpoch,
        relaySessionRevision,
      };
      void functionSettingsApi
        .update("workspace_sidebar", "grouping_mode", mode, expectedScope)
        .catch((error) => {
          if (!isComputerQueryScopeCurrent(expectedScope)) return;
          console.error('Failed to persist workspace sidebar setting "grouping_mode":', error);
        });
    },
    [activeInstanceId, connectionEpoch, relaySessionRevision],
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

  return (
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
      onFiltersChange={setFilters}
    />
  );
}
