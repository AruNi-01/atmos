import { useMemo } from 'react';

import type { Group, Project, Workspace, WorkspaceLabel } from '@/shared/types/domain';
import {
    getPinnedWorkspaceEntries,
    getProjectModeProjects,
    getSelectedProjectPinnedEntries,
    getSelectedProjectUnpinnedWorkspaces,
    getUnpinnedWorkspaceEntries,
} from '@/app-shell/left-sidebar-derived';
import {
    filterProjectSidebarEntries,
    filterWorkspaceKanbanEntries,
    getActiveWorkspaceKanbanFilterCount,
    shouldApplyWorkspaceKanbanVisibilityFilter,
    type WorkspaceKanbanFilters,
} from '@/app-shell/sidebar/WorkspaceKanbanFilterMenu';
import {
    flattenProjects,
    flattenProjectWorkspaces,
    getProjectSidebarGroupKey,
    getWorkspaceLabelGroupKey,
    getWorkspaceStatusGroupKey,
    getWorkspaceTimeGroupKey,
    groupWorkspaces,
} from '@/app-shell/sidebar/workspace-grouping';
import { parseWorkspacePriority } from '@/app-shell/sidebar/workspace-metadata-controls';
import {
    buildUserGroupViews,
    findGroupIdForMember,
    UNGROUPED_USER_GROUP_KEY,
    type UserGroupView,
} from '@/app-shell/sidebar/user-groups';
import type { SidebarGroupingMode } from '@/app-shell/sidebar/workspace-status';
import {
    parseWorkspaceAgentGroupKey,
    type WorkspaceAgentGroupKey,
} from '@/features/agent/lib/workspace-agent-status';

interface UseLeftSidebarWorkspaceDerivedParams {
    currentProjectId: string | null;
    currentSidebarRouteKey: string;
    currentWorkspace: Workspace | undefined;
    groupingMode: SidebarGroupingMode;
    groups: Group[];
    kanbanFilters: WorkspaceKanbanFilters;
    labelGroupOrder: string[];
    agentGroupKeyByWorkspaceId?: Readonly<Record<string, WorkspaceAgentGroupKey>>;
    projectSidebarSelectionRouteKey: string | null;
    projects: Project[];
    selectedProjectSidebarId: string | null;
    selectedWorkspaceGroupKey: string | null;
    ungroupedLabel: string;
    workspaceGroupSelectionRouteKey: string | null;
    workspaceSidebarStatusTwoColumn: boolean;
    workspaceSidebarTimeTwoColumn: boolean;
    workspaceSidebarPriorityTwoColumn: boolean;
    workspaceSidebarLabelTwoColumn: boolean;
    workspaceSidebarGroupTwoColumn: boolean;
    workspaceSidebarAgentTwoColumn: boolean;
    workspaceSidebarTwoColumn: boolean;
    workspaceLabels: WorkspaceLabel[];
}

export function useLeftSidebarWorkspaceDerived({
    currentProjectId,
    currentSidebarRouteKey,
    currentWorkspace,
    groupingMode,
    groups,
    kanbanFilters,
    labelGroupOrder,
    agentGroupKeyByWorkspaceId,
    projectSidebarSelectionRouteKey,
    projects,
    selectedProjectSidebarId,
    selectedWorkspaceGroupKey,
    ungroupedLabel,
    workspaceGroupSelectionRouteKey,
    workspaceSidebarStatusTwoColumn,
    workspaceSidebarTimeTwoColumn,
    workspaceSidebarPriorityTwoColumn,
    workspaceSidebarLabelTwoColumn,
    workspaceSidebarGroupTwoColumn,
    workspaceSidebarAgentTwoColumn,
    workspaceSidebarTwoColumn,
    workspaceLabels,
}: UseLeftSidebarWorkspaceDerivedParams) {
    const flattenedWorkspaces = useMemo(() => flattenProjectWorkspaces(projects), [projects]);
    const activeKanbanFilterCount = getActiveWorkspaceKanbanFilterCount(kanbanFilters);
    const hasExplicitWorkspaceFilters = activeKanbanFilterCount > 0;
    const shouldApplyWorkspaceFilter = shouldApplyWorkspaceKanbanVisibilityFilter(kanbanFilters);
    const filteredFlattenedWorkspaces = filterWorkspaceKanbanEntries(
        flattenedWorkspaces,
        kanbanFilters,
        groups,
    );
    const projectModeProjects = useMemo(
        () => getProjectModeProjects(projects, filteredFlattenedWorkspaces, {
            hideProjectsWithoutVisibleWorkspaces: hasExplicitWorkspaceFilters,
            shouldApplyWorkspaceFilter,
        }),
        [filteredFlattenedWorkspaces, hasExplicitWorkspaceFilters, projects, shouldApplyWorkspaceFilter],
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
    const filteredProjectEntries = useMemo(
        () => filterProjectSidebarEntries(flattenProjects(projects), kanbanFilters, groups),
        [groups, kanbanFilters, projects],
    );
    const groupedWorkspaces = useMemo(() => {
        if (groupingMode === 'project' || groupingMode === 'group') return [];
        return groupWorkspaces(
            [...unpinnedFlattenedWorkspaces, ...filteredProjectEntries],
            groupingMode,
            {
                availableLabels: workspaceLabels,
                labelGroupOrder,
                agentGroupKeyByWorkspaceId,
            },
        );
    }, [
        agentGroupKeyByWorkspaceId,
        filteredProjectEntries,
        groupingMode,
        labelGroupOrder,
        unpinnedFlattenedWorkspaces,
        workspaceLabels,
    ]);
    const userGroupViews = useMemo((): UserGroupView[] => {
        if (groupingMode !== 'group') return [];
        return buildUserGroupViews(groups, projectModeProjects, ungroupedLabel);
    }, [groupingMode, groups, projectModeProjects, ungroupedLabel]);
    const isProjectTwoColumn = groupingMode === 'project' && workspaceSidebarTwoColumn;
    const isGroupTwoColumn = groupingMode === 'group' && workspaceSidebarGroupTwoColumn;
    const isTimeTwoColumn = groupingMode === 'time' && workspaceSidebarTimeTwoColumn;
    const isStatusTwoColumn = groupingMode === 'status' && workspaceSidebarStatusTwoColumn;
    const isPriorityTwoColumn = groupingMode === 'priority' && workspaceSidebarPriorityTwoColumn;
    const isLabelTwoColumn = groupingMode === 'label' && workspaceSidebarLabelTwoColumn;
    const isAgentTwoColumn = groupingMode === 'agent' && workspaceSidebarAgentTwoColumn;
    const isTwoColumnSidebar =
        isProjectTwoColumn ||
        isGroupTwoColumn ||
        isTimeTwoColumn ||
        isStatusTwoColumn ||
        isPriorityTwoColumn ||
        isLabelTwoColumn ||
        isAgentTwoColumn;
    const shouldShowGlobalPinnedSection = pinnedWorkspaces.length > 0;
    const currentWorkspaceGroupKey = useMemo(() => {
        if (groupingMode === 'project') return null;
        if (currentWorkspace && !currentWorkspace.isPinned) {
            if (groupingMode === 'group') {
                // Ungrouped workspaces must resolve to the ungrouped bucket so two-column
                // mode does not fall through to the first named group.
                return (
                    findGroupIdForMember(groups, 'workspace', currentWorkspace.id) ??
                    findGroupIdForMember(groups, 'project', currentWorkspace.projectId) ??
                    UNGROUPED_USER_GROUP_KEY
                );
            }
            if (groupingMode === 'status') {
                return getWorkspaceStatusGroupKey(currentWorkspace.workflowStatus);
            }
            if (groupingMode === 'time') {
                return getWorkspaceTimeGroupKey(currentWorkspace);
            }
            if (groupingMode === 'priority') {
                return parseWorkspacePriority(currentWorkspace.priority);
            }
            if (groupingMode === 'label') {
                return getWorkspaceLabelGroupKey(
                    currentWorkspace,
                    labelGroupOrder,
                    workspaceLabels,
                );
            }
            if (groupingMode === 'agent') {
                return parseWorkspaceAgentGroupKey(
                    agentGroupKeyByWorkspaceId?.[currentWorkspace.id],
                );
            }
            return null;
        }
        if (!currentProjectId || groupingMode === 'group') return null;
        const currentProject = projects.find((project) => project.id === currentProjectId);
        if (!currentProject) return null;
        return getProjectSidebarGroupKey(currentProject, groupingMode, {
            availableLabels: workspaceLabels,
            labelGroupOrder,
            agentGroupKeyByWorkspaceId,
        });
    }, [
        agentGroupKeyByWorkspaceId,
        currentProjectId,
        currentWorkspace,
        groupingMode,
        groups,
        labelGroupOrder,
        projects,
        workspaceLabels,
    ]);
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
        if (groupingMode === 'project' || !isTwoColumnSidebar) return null;
        if (groupingMode === 'group') {
            if (userGroupViews.length === 0) return null;
            const visibleKeys = new Set(userGroupViews.map((view) => view.key));
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
            return userGroupViews[0]?.key ?? null;
        }
        if (groupedWorkspaces.length === 0) return null;
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
        userGroupViews,
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
    const selectedUserGroupForSidebar = useMemo(
        () => userGroupViews.find((view) => view.key === effectiveSelectedWorkspaceGroupKey) ?? null,
        [effectiveSelectedWorkspaceGroupKey, userGroupViews],
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
        isGroupTwoColumn,
        isPinnedSortingDisabled,
        isProjectTwoColumn,
        isTwoColumnSidebar,
        pinnedWorkspaces,
        projectModeProjects,
        selectedGroupForSidebar,
        selectedProjectForSidebar,
        selectedProjectPinnedEntries,
        selectedProjectUnpinnedWorkspaces,
        selectedUserGroupForSidebar,
        shouldShowGlobalPinnedSection,
        shouldApplyWorkspaceFilter,
        userGroupViews,
    };
}
