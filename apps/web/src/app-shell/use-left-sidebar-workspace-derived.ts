import { useMemo } from 'react';

import type { Project, Workspace } from '@/shared/types/domain';
import {
    getPinnedWorkspaceEntries,
    getProjectModeProjects,
    getSelectedProjectPinnedEntries,
    getSelectedProjectUnpinnedWorkspaces,
    getUnpinnedWorkspaceEntries,
} from '@/app-shell/left-sidebar-derived';
import {
    filterWorkspaceKanbanEntries,
    getActiveWorkspaceKanbanFilterCount,
    type WorkspaceKanbanFilters,
} from '@/app-shell/sidebar/WorkspaceKanbanFilterMenu';
import {
    flattenProjectWorkspaces,
    getWorkspaceTimeGroupKey,
    groupWorkspaces,
} from '@/app-shell/sidebar/workspace-grouping';
import type { SidebarGroupingMode } from '@/app-shell/sidebar/workspace-status';

interface UseLeftSidebarWorkspaceDerivedParams {
    currentProjectId: string | null;
    currentSidebarRouteKey: string;
    currentWorkspace: Workspace | undefined;
    groupingMode: SidebarGroupingMode;
    kanbanFilters: WorkspaceKanbanFilters;
    projectSidebarSelectionRouteKey: string | null;
    projects: Project[];
    selectedProjectSidebarId: string | null;
    selectedWorkspaceGroupKey: string | null;
    workspaceGroupSelectionRouteKey: string | null;
    workspaceSidebarStatusTwoColumn: boolean;
    workspaceSidebarTimeTwoColumn: boolean;
    workspaceSidebarTwoColumn: boolean;
}

export function useLeftSidebarWorkspaceDerived({
    currentProjectId,
    currentSidebarRouteKey,
    currentWorkspace,
    groupingMode,
    kanbanFilters,
    projectSidebarSelectionRouteKey,
    projects,
    selectedProjectSidebarId,
    selectedWorkspaceGroupKey,
    workspaceGroupSelectionRouteKey,
    workspaceSidebarStatusTwoColumn,
    workspaceSidebarTimeTwoColumn,
    workspaceSidebarTwoColumn,
}: UseLeftSidebarWorkspaceDerivedParams) {
    const flattenedWorkspaces = useMemo(() => flattenProjectWorkspaces(projects), [projects]);
    const activeKanbanFilterCount = getActiveWorkspaceKanbanFilterCount(kanbanFilters);
    const filteredFlattenedWorkspaces = filterWorkspaceKanbanEntries(
        flattenedWorkspaces,
        kanbanFilters,
    );
    const projectModeProjects = useMemo(
        () => getProjectModeProjects(projects, filteredFlattenedWorkspaces, activeKanbanFilterCount),
        [activeKanbanFilterCount, filteredFlattenedWorkspaces, projects],
    );
    const pinnedWorkspaces = useMemo(
        () => getPinnedWorkspaceEntries(filteredFlattenedWorkspaces),
        [filteredFlattenedWorkspaces],
    );
    const isPinnedSortingDisabled = activeKanbanFilterCount > 0;
    const unpinnedFlattenedWorkspaces = useMemo(
        () => getUnpinnedWorkspaceEntries(filteredFlattenedWorkspaces),
        [filteredFlattenedWorkspaces],
    );
    const groupedWorkspaces = useMemo(() => {
        if (groupingMode === 'project') return [];
        return groupWorkspaces(unpinnedFlattenedWorkspaces, groupingMode);
    }, [unpinnedFlattenedWorkspaces, groupingMode]);
    const isProjectTwoColumn = groupingMode === 'project' && workspaceSidebarTwoColumn;
    const isTimeTwoColumn = groupingMode === 'time' && workspaceSidebarTimeTwoColumn;
    const isStatusTwoColumn = groupingMode === 'status' && workspaceSidebarStatusTwoColumn;
    const isTwoColumnSidebar = isProjectTwoColumn || isTimeTwoColumn || isStatusTwoColumn;
    const shouldShowGlobalPinnedSection = pinnedWorkspaces.length > 0;
    const currentWorkspaceGroupKey = useMemo(() => {
        if (!currentWorkspace || currentWorkspace.isPinned) return null;
        if (groupingMode === 'status') {
            return currentWorkspace.workflowStatus;
        }
        if (groupingMode === 'time') {
            return getWorkspaceTimeGroupKey(currentWorkspace);
        }
        return null;
    }, [currentWorkspace, groupingMode]);
    const effectiveSelectedProjectSidebarId = useMemo(() => {
        if (!isProjectTwoColumn || projectModeProjects.length === 0) return null;
        const visibleIds = new Set(projectModeProjects.map((project) => project.id));
        if (
            selectedProjectSidebarId &&
            projectSidebarSelectionRouteKey === currentSidebarRouteKey &&
            visibleIds.has(selectedProjectSidebarId)
        ) {
            return selectedProjectSidebarId;
        }
        if (currentProjectId && visibleIds.has(currentProjectId)) {
            return currentProjectId;
        }
        return projectModeProjects[0]?.id ?? null;
    }, [
        currentProjectId,
        currentSidebarRouteKey,
        isProjectTwoColumn,
        projectModeProjects,
        projectSidebarSelectionRouteKey,
        selectedProjectSidebarId,
    ]);
    const effectiveSelectedWorkspaceGroupKey = useMemo(() => {
        if (groupingMode === 'project' || !isTwoColumnSidebar || groupedWorkspaces.length === 0) return null;
        const visibleKeys = new Set(groupedWorkspaces.map((group) => group.key));
        if (
            selectedWorkspaceGroupKey &&
            workspaceGroupSelectionRouteKey === currentSidebarRouteKey &&
            visibleKeys.has(selectedWorkspaceGroupKey)
        ) {
            return selectedWorkspaceGroupKey;
        }
        if (currentWorkspaceGroupKey && visibleKeys.has(currentWorkspaceGroupKey)) {
            return currentWorkspaceGroupKey;
        }
        return groupedWorkspaces[0]?.key ?? null;
    }, [
        currentSidebarRouteKey,
        currentWorkspaceGroupKey,
        groupedWorkspaces,
        groupingMode,
        isTwoColumnSidebar,
        selectedWorkspaceGroupKey,
        workspaceGroupSelectionRouteKey,
    ]);
    const selectedProjectForSidebar = useMemo(
        () => projectModeProjects.find((project) => project.id === effectiveSelectedProjectSidebarId) ?? null,
        [effectiveSelectedProjectSidebarId, projectModeProjects],
    );
    const selectedGroupForSidebar = useMemo(
        () => groupedWorkspaces.find((group) => group.key === effectiveSelectedWorkspaceGroupKey) ?? null,
        [effectiveSelectedWorkspaceGroupKey, groupedWorkspaces],
    );
    const selectedProjectPinnedEntries = useMemo(
        () => getSelectedProjectPinnedEntries(selectedProjectForSidebar),
        [selectedProjectForSidebar],
    );
    const selectedProjectUnpinnedWorkspaces = useMemo(
        () => getSelectedProjectUnpinnedWorkspaces(selectedProjectForSidebar),
        [selectedProjectForSidebar],
    );

    return {
        activeKanbanFilterCount,
        effectiveSelectedProjectSidebarId,
        effectiveSelectedWorkspaceGroupKey,
        filteredFlattenedWorkspaces,
        flattenedWorkspaces,
        groupedWorkspaces,
        isPinnedSortingDisabled,
        isProjectTwoColumn,
        isTwoColumnSidebar,
        pinnedWorkspaces,
        projectModeProjects,
        selectedGroupForSidebar,
        selectedProjectForSidebar,
        selectedProjectPinnedEntries,
        selectedProjectUnpinnedWorkspaces,
        shouldShowGlobalPinnedSection,
    };
}
