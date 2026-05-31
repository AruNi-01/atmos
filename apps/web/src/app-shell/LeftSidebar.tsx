"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useHotkeys } from "react-hotkeys-hook";
import { useAppRouter } from '@/shared/hooks/use-app-router';
import { useQueryState } from 'nuqs';
import { useContextParams } from '@/shared/hooks/use-context-params';
import { useSidebarLayout } from '@/app-shell/SidebarLayoutContext';
import { centerStageParams, leftSidebarParams, type LeftSidebarTab } from '@/shared/lib/nuqs/searchParams';
import { cn, Tabs, TabsPanel } from "@workspace/ui";
import { useAppStorage } from "@atmos/shared";
import type { Project } from '@/shared/types/domain';
import { useProjectStore } from '@/features/project/store/use-project-store';
import { CreateProjectDialog } from '@/features/project/components/CreateProjectDialog';
import { WorkspaceScriptDialog } from '@/features/workspace/components/WorkspaceScriptDialog';
import { DeleteProjectDialog } from '@/features/project/components/DeleteProjectDialog';
import { FileTreePanel } from '@/features/files/components/FileTreePanel';
import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';
import { useShallow } from 'zustand/react/shallow';
import { useGitInfoStore } from '@/features/git/store/use-git-info-store';
import { useDialogStore } from '@/app-shell/state/use-dialog-store';
import {
  DEFAULT_KANBAN_CARD_PROPERTIES,
  type KanbanCardProperties,
} from '@/app-shell/sidebar/WorkspaceKanbanView';
import {
  type SidebarGroupingMode,
} from '@/app-shell/sidebar/workspace-status';
import {
  type WorkspaceKanbanFilters,
} from '@/app-shell/sidebar/WorkspaceKanbanFilterMenu';
import {
  EMPTY_WORKSPACE_KANBAN_FILTERS,
  parseWorkspaceKanbanCardProperties,
  parseWorkspaceKanbanFilters,
} from '@/app-shell/left-sidebar-settings';
import { isWorkspaceSetupBlocking } from '@/features/workspace/lib/workspace-setup';
import { useWorkspaceCreationStore } from '@/features/workspace/store/workspace-creation-store';
import { useLayoutSettingsStore } from '@/features/settings/store/layout-settings-store';
import { useExperimentSettingsStore } from '@/features/settings/store/experiment-settings-store';
import { useInitialProjectsLoading } from '@/features/project/store/use-initial-projects-loading';
import { ProjectsSidebarLoading } from '@/app-shell/ProjectsSidebarLoading';
import { LeftSidebarManagementCenter } from '@/app-shell/LeftSidebarManagementCenter';
import { LeftSidebarPinnedSection } from '@/app-shell/LeftSidebarPinnedSection';
import {
    GroupedWorkspaceOneColumnContent,
    GroupedWorkspaceTwoColumnLeftContent,
    GroupedWorkspaceTwoColumnRightContent,
    LeftSidebarFooter,
    LeftSidebarSortableProjectList,
    LeftSidebarTabsHeader,
    ProjectWorkspaceTwoColumnRightContent,
    TwoColumnSidebarContent,
} from '@/app-shell/left-sidebar-controls';
import { useLeftSidebarFileTreeSync } from '@/app-shell/use-left-sidebar-file-tree-sync';
import { useLeftSidebarTwoColumnResize } from '@/app-shell/use-left-sidebar-two-column-resize';
import { useLeftSidebarWorkspaceDerived } from '@/app-shell/use-left-sidebar-workspace-derived';
import { useLeftSidebarWorkspaceRenderers } from '@/app-shell/use-left-sidebar-workspace-renderers';
import { useLeftSidebarDragHandlers } from '@/app-shell/use-left-sidebar-drag-handlers';

interface LeftSidebarProps {
    projects?: Project[];
}

const LeftSidebar: React.FC<LeftSidebarProps> = () => {
    const storage = useAppStorage();
    const router = useAppRouter();
    const { workspaceId: currentWorkspaceId, projectId: currentProjectIdFromUrl, effectiveContextId, currentView } = useContextParams();
    const {
        projects,
        fetchProjects,
        deleteProject,
        updateProject,
        deleteWorkspace,
        quickAddWorkspace,
        pinWorkspace,
        unpinWorkspace,
        archiveWorkspace,
        updateWorkspacePinOrder,
        updateWorkspaceName,
        updateWorkspaceWorkflowStatus,
        updateWorkspacePriority,
        workspaceLabels,
        createWorkspaceLabel,
        updateWorkspaceLabel,
        updateWorkspaceLabels,
        markWorkspaceVisited,
        reorderProjects,
        reorderWorkspaces,
        setupProgress,
        isLoading,
    } = useProjectStore(
        useShallow(s => ({
            projects: s.projects,
            fetchProjects: s.fetchProjects,
            deleteProject: s.deleteProject,
            updateProject: s.updateProject,
            deleteWorkspace: s.deleteWorkspace,
            quickAddWorkspace: s.quickAddWorkspace,
            pinWorkspace: s.pinWorkspace,
            unpinWorkspace: s.unpinWorkspace,
            archiveWorkspace: s.archiveWorkspace,
            updateWorkspacePinOrder: s.updateWorkspacePinOrder,
            updateWorkspaceName: s.updateWorkspaceName,
            updateWorkspaceWorkflowStatus: s.updateWorkspaceWorkflowStatus,
            updateWorkspacePriority: s.updateWorkspacePriority,
            workspaceLabels: s.workspaceLabels,
            createWorkspaceLabel: s.createWorkspaceLabel,
            updateWorkspaceLabel: s.updateWorkspaceLabel,
            updateWorkspaceLabels: s.updateWorkspaceLabels,
            markWorkspaceVisited: s.markWorkspaceVisited,
            reorderProjects: s.reorderProjects,
            reorderWorkspaces: s.reorderWorkspaces,
            setupProgress: s.setupProgress,
            isLoading: s.isLoading,
        }))
    );

    const { setCurrentContext } = useGitInfoStore();
    const { isLeftCollapsed, leftSidebarSize, resizeLeftSidebar } = useSidebarLayout();
    const filesOnRight = useLayoutSettingsStore((s) => s.projectFilesSide === 'right');
    const workspaceSidebarTwoColumn = useLayoutSettingsStore((s) => s.workspaceSidebarTwoColumn);
    const workspaceSidebarTwoColumnShowPinned = useLayoutSettingsStore((s) => s.workspaceSidebarTwoColumnShowPinned);
    const workspaceSidebarSecondColumnKanban = useLayoutSettingsStore((s) => s.workspaceSidebarSecondColumnKanban);
    const workspaceSidebarTimeTwoColumn = useLayoutSettingsStore((s) => s.workspaceSidebarTimeTwoColumn);
    const workspaceSidebarStatusTwoColumn = useLayoutSettingsStore((s) => s.workspaceSidebarStatusTwoColumn);
    const layoutLoaded = useLayoutSettingsStore((s) => s.loaded);
    const loadLayoutSettings = useLayoutSettingsStore((s) => s.loadSettings);
    useEffect(() => { loadLayoutSettings(); }, [loadLayoutSettings]);

    const [activeTab, setActiveTab] = useQueryState("lsTab", leftSidebarParams.lsTab);
    const [newWorkspace, setNewWorkspace] = useQueryState("newWorkspace", centerStageParams.newWorkspace);
    const [canvasOpen, setCanvasOpen] = useQueryState("canvas", centerStageParams.canvas);
    const [isKanbanExpanded, setIsKanbanExpanded] = useQueryState("lsKanban", leftSidebarParams.lsKanban);
    const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
    const [collapsedWorkspaceGroups, setCollapsedWorkspaceGroups] = useState<Record<string, boolean>>({});
    const [groupingMode, setGroupingMode] = useState<SidebarGroupingMode>('project');
    const [isGroupingSettingsReady, setIsGroupingSettingsReady] = useState(false);
    const [kanbanFilters, setKanbanFilters] = useState<WorkspaceKanbanFilters>(EMPTY_WORKSPACE_KANBAN_FILTERS);
    const [isWorkspacesExpanded, setIsWorkspacesExpanded] = useState(
        currentView === 'workspaces' || currentView === 'skills' || currentView === 'terminals' || currentView === 'agents' || currentView === 'automations'
    );
    const [isPinnedSectionCollapsed, setIsPinnedSectionCollapsed] = useState(false);
    const [isPinnedDividerHovered, setIsPinnedDividerHovered] = useState(false);
    const [selectedProjectSidebarId, setSelectedProjectSidebarId] = useState<string | null>(null);
    const [projectSidebarSelectionRouteKey, setProjectSidebarSelectionRouteKey] = useState<string | null>(null);
    const [selectedWorkspaceGroupKey, setSelectedWorkspaceGroupKey] = useState<string | null>(null);
    const [workspaceGroupSelectionRouteKey, setWorkspaceGroupSelectionRouteKey] = useState<string | null>(null);
    const [isSecondColumnPinnedExpanded, setIsSecondColumnPinnedExpanded] = useState(true);
    const [isSecondColumnWorkspacesExpanded, setIsSecondColumnWorkspacesExpanded] = useState(true);
    const [secondColumnKanbanCardProperties, setSecondColumnKanbanCardProperties] = useState<KanbanCardProperties>(DEFAULT_KANBAN_CARD_PROPERTIES);

    const isInitialProjectsLoading = useInitialProjectsLoading();

    const managementTerminalsEnabled = useExperimentSettingsStore((s) => s.managementTerminalsEnabled);
    const managementAgentsEnabled = useExperimentSettingsStore((s) => s.managementAgentsEnabled);
    const automationsEnabled = useExperimentSettingsStore((s) => s.automationsEnabled);
    const loadExperimentSettings = useExperimentSettingsStore((s) => s.loadSettings);
    useEffect(() => {
        void loadExperimentSettings();
    }, [loadExperimentSettings]);

    const {
        isCreateProjectOpen,
        setCreateProjectOpen,
        setSelectedProjectId
    } = useDialogStore();

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    useEffect(() => {
        useFunctionSettingsStore.getState().load()
            .then((settings) => {
                const groupingModeSetting = settings.workspace_sidebar?.grouping_mode;
                if (groupingModeSetting === 'project' || groupingModeSetting === 'status' || groupingModeSetting === 'time') {
                    setGroupingMode(groupingModeSetting);
                }
                const pinnedSectionCollapsed = settings.workspace_sidebar?.pinned_section_collapsed;
                if (typeof pinnedSectionCollapsed === 'boolean') {
                    setIsPinnedSectionCollapsed(pinnedSectionCollapsed);
                }
            })
            .finally(() => {
                setIsGroupingSettingsReady(true);
            });
    }, []);

    useEffect(() => {
        if (!isGroupingSettingsReady) return;
        void functionSettingsApi.update('workspace_sidebar', 'grouping_mode', groupingMode);
    }, [groupingMode, isGroupingSettingsReady]);

    useEffect(() => {
        if (!isGroupingSettingsReady) return;
        void functionSettingsApi.update('workspace_sidebar', 'pinned_section_collapsed', isPinnedSectionCollapsed);
    }, [isPinnedSectionCollapsed, isGroupingSettingsReady]);

    useEffect(() => {
        useFunctionSettingsStore.getState().load()
            .then((settings) => {
                setKanbanFilters(parseWorkspaceKanbanFilters(settings));
            })
            .catch(() => {
                setKanbanFilters(EMPTY_WORKSPACE_KANBAN_FILTERS);
            });
    }, []);

    useEffect(() => {
        useFunctionSettingsStore.getState().load()
            .then((settings) => {
                setSecondColumnKanbanCardProperties(parseWorkspaceKanbanCardProperties(settings));
            })
            .catch(() => {
                setSecondColumnKanbanCardProperties(DEFAULT_KANBAN_CARD_PROPERTIES);
            });
    }, []);

    useEffect(() => {
        if (projects.length > 0 && expandedProjects.length === 0) {
            const timer = window.setTimeout(() => {
                setExpandedProjects(projects.map(p => p.id));
            }, 0);
            return () => window.clearTimeout(timer);
        }
    }, [expandedProjects.length, projects]);

    const [scriptDialogProjectId, setScriptDialogProjectId] = useState<string | null>(null);
    const [deleteProjectDialog, setDeleteProjectDialog] = useState<{
        isOpen: boolean;
        projectId: string;
        projectName: string;
        canDelete: boolean;
    } | null>(null);

    const currentProject = projects.find(p =>
        (currentWorkspaceId && p.workspaces.some(w => w.id === currentWorkspaceId)) ||
        (!currentWorkspaceId && currentProjectIdFromUrl === p.id)
    );
    const currentProjectId = currentProject?.id ?? null;
    const currentSidebarRouteKey = `${currentView}:${currentProjectId ?? ''}:${currentWorkspaceId ?? ''}`;
    const currentWorkspace = currentProject?.workspaces.find(w => w.id === currentWorkspaceId);
    const currentEffectivePath = currentWorkspace?.localPath ?? currentProject?.mainFilePath ?? null;
    const isSettingUp = isWorkspaceSetupBlocking(
        currentWorkspaceId ? setupProgress[currentWorkspaceId] : null,
    );
    const showCreating = useWorkspaceCreationStore((s) => s.showCreating);
    const showOpening = useWorkspaceCreationStore((s) => s.showOpening);
    const clearWorkspaceCreationOverlay = useWorkspaceCreationStore((s) => s.clear);

    useEffect(() => {
        if (currentProjectId && currentEffectivePath) {
            if (currentWorkspaceId) {
                if (isSettingUp) {
                    setCurrentContext(null, null, null);
                } else {
                    setCurrentContext(currentProjectId, currentWorkspaceId, currentEffectivePath);
                }
            } else {
                setCurrentContext(currentProjectId, null, currentEffectivePath);
            }
        }
    }, [currentProjectId, currentWorkspaceId, currentEffectivePath, isSettingUp, setCurrentContext]);

    const hasFetchedRef = useRef(false);
    useEffect(() => {
        if (projects.length > 0 || isLoading) {
            hasFetchedRef.current = true;
        }
    }, [projects, isLoading]);

    useEffect(() => {
        if (currentView !== 'workspace' || !currentWorkspaceId || isLoading || !hasFetchedRef.current) {
            return;
        }

        const workspaceStillExists = projects.some((project) =>
            project.workspaces.some((workspace) => workspace.id === currentWorkspaceId)
        );

        if (!workspaceStillExists) {
            router.replace('/');
        }
    }, [currentView, currentWorkspaceId, isLoading, projects, router]);

    const lastVisitedWorkspaceRef = useRef<string | null>(null);
    useEffect(() => {
        if (currentView !== 'workspace' || !currentWorkspaceId) {
            lastVisitedWorkspaceRef.current = null;
            return;
        }

        if (isLoading) {
            return;
        }

        const workspaceExists = projects.some((project) =>
            project.workspaces.some((workspace) => workspace.id === currentWorkspaceId)
        );
        if (!workspaceExists) {
            return;
        }

        if (lastVisitedWorkspaceRef.current === currentWorkspaceId) {
            return;
        }

        lastVisitedWorkspaceRef.current = currentWorkspaceId;
        void markWorkspaceVisited(currentWorkspaceId);
    }, [currentView, currentWorkspaceId, isLoading, markWorkspaceVisited, projects]);

    useLeftSidebarFileTreeSync({
        activeTab,
        currentEffectivePath,
        currentProjectId,
        currentWorkspaceId,
        effectiveContextId,
        filesOnRight,
        isSettingUp,
        setActiveTab,
    });

    const handleTabChange = (value: string) => {
        setActiveTab(value as LeftSidebarTab);
    };

    const toggleProject = (id: string) => {
        setExpandedProjects(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    };

    const handleSelectProjectSidebar = useCallback((projectId: string) => {
        setSelectedProjectSidebarId(projectId);
        setProjectSidebarSelectionRouteKey(currentSidebarRouteKey);
    }, [currentSidebarRouteKey]);

    const toggleWorkspaceGroup = useCallback((groupKey: string) => {
        setCollapsedWorkspaceGroups((prev) => ({
            ...prev,
            [groupKey]: !prev[groupKey],
        }));
    }, []);

    const handleSelectWorkspaceGroup = useCallback((groupKey: string) => {
        setSelectedWorkspaceGroupKey(groupKey);
        setWorkspaceGroupSelectionRouteKey(currentSidebarRouteKey);
    }, [currentSidebarRouteKey]);

    const handleAddProject = () => {
        setCreateProjectOpen(true);
    };

    const handleAddWorkspace = useCallback((projectId: string) => {
        if (currentView === "welcome") {
            return;
        }
        setSelectedProjectId(projectId);
        void setNewWorkspace(true);
    }, [currentView, setSelectedProjectId, setNewWorkspace]);

    /**
     * Open the New Workspace dialog scoped to the currently active project (or
     * empty selection when there is no active project). Used by sidebar card click.
     * Does nothing if on the welcome page (which already has a composer).
     */
    const handleOpenNewWorkspace = useCallback(() => {
        if (currentView === "welcome") {
            return;
        }
        setSelectedProjectId(currentProjectId ?? "");
        void setNewWorkspace(true);
    }, [currentProjectId, setNewWorkspace, setSelectedProjectId, currentView]);

    /**
     * Toggle the New Workspace dialog. Used by the global ⌘N hotkey.
     * If already open, close it; if closed, open it.
     * Does nothing if on the welcome page (which already has a composer).
     */
    const handleToggleNewWorkspace = useCallback(() => {
        if (currentView === "welcome") {
            return;
        }
        setSelectedProjectId(currentProjectId ?? "");
        void setNewWorkspace(!newWorkspace);
    }, [currentProjectId, setNewWorkspace, setSelectedProjectId, newWorkspace, currentView]);

    /**
     * Toggle the Canvas/Presentation overlay. Used by the global ⌘⇧H hotkey.
     * If already open, close it; if closed, open it.
     */
    const handleToggleCanvas = useCallback(() => {
        void setCanvasOpen(!canvasOpen);
    }, [canvasOpen, setCanvasOpen]);

    // ⌘N → toggle the New Workspace overlay from anywhere in the app.
    useHotkeys(
        "mod+n",
        handleToggleNewWorkspace,
        { enableOnFormTags: true, preventDefault: true },
        [handleToggleNewWorkspace],
    );

    // ⌘⇧H → toggle the Canvas/Presentation overlay from anywhere in the app.
    useHotkeys(
        "mod+shift+h",
        handleToggleCanvas,
        { enableOnFormTags: true, preventDefault: true },
        [handleToggleCanvas],
    );

    // ⌘⇧K → expand the Kanban board overlay. The kanban dialog is bound to the
    // `lsKanban` URL state, so flipping it to true opens the board from anywhere.
    useHotkeys(
        "mod+shift+k",
        () => {
            void setIsKanbanExpanded(true);
        },
        { enableOnFormTags: true, preventDefault: true },
        [setIsKanbanExpanded],
    );

    const handleQuickAddWorkspace = async (projectId: string) => {
        showCreating();
        const workspaceId = await quickAddWorkspace(projectId);
        if (workspaceId) {
            showOpening(workspaceId);
            router.push(`/workspace?id=${workspaceId}`);
            return;
        }
        clearWorkspaceCreationOverlay();
    };

    const handleSetColor = async (projectId: string, color?: string) => {
        await updateProject(projectId, { borderColor: color ?? null });
    };

    const handleSetLogo = async (projectId: string, logoPath: string | null) => {
        await updateProject(projectId, { logoPath });
    };

    const {
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
    } = useLeftSidebarWorkspaceDerived({
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
    });
    const {
        activeId,
        handleDragEnd,
        handleDragStart,
        isAnyProjectDragging,
        sensors,
    } = useLeftSidebarDragHandlers({
        activeKanbanFilterCount,
        filteredFlattenedWorkspaces,
        projects,
        reorderProjects,
        reorderWorkspaces,
    });
    const {
        currentTwoColumnPrimarySize,
        handleTwoColumnDividerDragging,
        handleTwoColumnPrimaryResize,
        isTwoColumnPrimaryCollapsed,
        setIsTwoColumnPrimaryCollapsed,
        toggleTwoColumnPrimaryPanel,
        twoColumnPrimaryPanelRef,
    } = useLeftSidebarTwoColumnResize({
        groupingMode,
        isLeftCollapsed,
        isProjectTwoColumn,
        isTwoColumnSidebar,
        leftSidebarSize,
        resizeLeftSidebar,
    });

    const handleDeleteProject = (projectId: string) => {
        const project = projects.find(p => p.id === projectId);
        if (!project) return;

        const hasActiveWorkspaces = project.workspaces.some(w => !w.isArchived);
        setDeleteProjectDialog({
            isOpen: true,
            projectId,
            projectName: project.name,
            canDelete: !hasActiveWorkspaces,
        });
    };

    const handleConfigureScripts = (projectId: string) => {
        setScriptDialogProjectId(projectId);
    };

    const handleSelectProjectMain = useCallback((id: string) => {
        router.push(`/project?id=${id}`);
    }, [router]);

    const [isAddProjectReady, setIsAddProjectReady] = useState(false);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (activeTab === 'projects') {
            timer = setTimeout(() => {
                setIsAddProjectReady(true);
            }, 1000);
        } else {
            timer = setTimeout(() => {
                setIsAddProjectReady(false);
            }, 0);
        }
        return () => clearTimeout(timer);
    }, [activeTab]);

    const handleEnterWorkspaceFromSidebarKanban = useCallback((projectId: string, workspaceId: string) => {
        void projectId;
        router.push(`/workspace?id=${workspaceId}`);
    }, [router]);

    const {
        renderWorkspaceContentRow,
        renderWorkspaceItemRow,
        renderWorkspaceKanbanCard,
    } = useLeftSidebarWorkspaceRenderers({
        archiveWorkspace,
        createWorkspaceLabel,
        deleteWorkspace,
        onEnterWorkspaceFromKanban: handleEnterWorkspaceFromSidebarKanban,
        pinWorkspace,
        secondColumnKanbanCardProperties,
        unpinWorkspace,
        updateWorkspaceLabel,
        updateWorkspaceLabels,
        updateWorkspaceName,
        updateWorkspacePriority,
        updateWorkspaceWorkflowStatus,
        workspaceLabels,
    });

    const pinnedWorkspaceSection = shouldShowGlobalPinnedSection ? (
        <LeftSidebarPinnedSection
            groupingMode={groupingMode}
            isCollapsed={isPinnedSectionCollapsed}
            isDividerHovered={isPinnedDividerHovered}
            isSortingDisabled={isPinnedSortingDisabled}
            pinnedWorkspaces={pinnedWorkspaces}
            renderWorkspaceItemRow={renderWorkspaceItemRow}
            sensors={sensors}
            onCollapsedChange={setIsPinnedSectionCollapsed}
            onDividerHoverChange={setIsPinnedDividerHovered}
            onUpdatePinOrder={updateWorkspacePinOrder}
        />
    ) : null;

    const projectModeOneColumnContent = (
        <LeftSidebarSortableProjectList
            activeId={activeId}
            activeProjectId={currentProjectId}
            activeWorkspaceId={currentWorkspaceId}
            availableLabels={workspaceLabels}
            className="no-scrollbar"
            expandedProjectIds={expandedProjects}
            flattenedWorkspaces={flattenedWorkspaces}
            isAnyProjectDragging={isAnyProjectDragging}
            projects={projectModeProjects}
            sensors={sensors}
            showDragOverlay
            onAddWorkspace={handleAddWorkspace}
            onArchiveWorkspace={archiveWorkspace}
            onConfigureScripts={handleConfigureScripts}
            onCreateWorkspaceLabel={createWorkspaceLabel}
            onDeleteProject={handleDeleteProject}
            onDeleteWorkspace={deleteWorkspace}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
            onPinWorkspace={pinWorkspace}
            onQuickAddWorkspace={handleQuickAddWorkspace}
            onSelectMain={handleSelectProjectMain}
            onSetColor={handleSetColor}
            onSetLogo={handleSetLogo}
            onToggleProject={toggleProject}
            onUnpinWorkspace={unpinWorkspace}
            onUpdateWorkspaceLabel={updateWorkspaceLabel}
            onUpdateWorkspaceLabels={updateWorkspaceLabels}
            onUpdateWorkspaceName={updateWorkspaceName}
            onUpdateWorkspacePriority={updateWorkspacePriority}
            onUpdateWorkspaceWorkflowStatus={updateWorkspaceWorkflowStatus}
        />
    );

    const groupedOneColumnContent = (
        <GroupedWorkspaceOneColumnContent
            collapsedWorkspaceGroups={collapsedWorkspaceGroups}
            groupingMode={groupingMode}
            groups={groupedWorkspaces}
            renderWorkspaceContentRow={renderWorkspaceContentRow}
            toggleWorkspaceGroup={toggleWorkspaceGroup}
        />
    );

    const projectTwoColumnLeftContent = (
        <LeftSidebarSortableProjectList
            activeProjectId={currentProjectId}
            activeWorkspaceId={currentWorkspaceId}
            availableLabels={workspaceLabels}
            className="py-1.5"
            expandedProjectIds={expandedProjects}
            hideWorkspaceList
            isAnyProjectDragging={isAnyProjectDragging}
            projects={projectModeProjects}
            selectedProjectId={effectiveSelectedProjectSidebarId}
            sensors={sensors}
            onAddWorkspace={handleAddWorkspace}
            onArchiveWorkspace={archiveWorkspace}
            onConfigureScripts={handleConfigureScripts}
            onCreateWorkspaceLabel={createWorkspaceLabel}
            onDeleteProject={handleDeleteProject}
            onDeleteWorkspace={deleteWorkspace}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
            onPinWorkspace={pinWorkspace}
            onProjectRowClick={handleSelectProjectSidebar}
            onQuickAddWorkspace={handleQuickAddWorkspace}
            onSelectMain={handleSelectProjectMain}
            onSetColor={handleSetColor}
            onSetLogo={handleSetLogo}
            onToggleProject={toggleProject}
            onUnpinWorkspace={unpinWorkspace}
            onUpdateWorkspaceLabel={updateWorkspaceLabel}
            onUpdateWorkspaceLabels={updateWorkspaceLabels}
            onUpdateWorkspaceName={updateWorkspaceName}
            onUpdateWorkspacePriority={updateWorkspacePriority}
            onUpdateWorkspaceWorkflowStatus={updateWorkspaceWorkflowStatus}
        />
    );

    const projectTwoColumnRightContent = (
        <ProjectWorkspaceTwoColumnRightContent
            activeProjectId={currentProjectId}
            activeWorkspaceId={currentWorkspaceId}
            availableLabels={workspaceLabels}
            isPinnedSortingDisabled={isPinnedSortingDisabled}
            isPrimaryCollapsed={isTwoColumnPrimaryCollapsed}
            isPinnedExpanded={isSecondColumnPinnedExpanded}
            isWorkspacesExpanded={isSecondColumnWorkspacesExpanded}
            secondColumnKanban={workspaceSidebarSecondColumnKanban}
            selectedProject={selectedProjectForSidebar}
            selectedProjectPinnedEntries={selectedProjectPinnedEntries}
            selectedProjectUnpinnedWorkspaces={selectedProjectUnpinnedWorkspaces}
            sensors={sensors}
            showPinnedSection={workspaceSidebarTwoColumnShowPinned}
            renderWorkspaceItemRow={renderWorkspaceItemRow}
            renderWorkspaceKanbanCard={renderWorkspaceKanbanCard}
            onAddWorkspace={handleAddWorkspace}
            onArchiveWorkspace={archiveWorkspace}
            onConfigureScripts={handleConfigureScripts}
            onCreateWorkspaceLabel={createWorkspaceLabel}
            onDeleteProject={handleDeleteProject}
            onDeleteWorkspace={deleteWorkspace}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
            onPinnedExpandedChange={setIsSecondColumnPinnedExpanded}
            onPinWorkspace={pinWorkspace}
            onQuickAddWorkspace={handleQuickAddWorkspace}
            onSelectMain={handleSelectProjectMain}
            onSetColor={handleSetColor}
            onSetLogo={handleSetLogo}
            onTogglePrimaryPanel={toggleTwoColumnPrimaryPanel}
            onUnpinWorkspace={unpinWorkspace}
            onUpdateWorkspaceLabel={updateWorkspaceLabel}
            onUpdateWorkspaceLabels={updateWorkspaceLabels}
            onUpdateWorkspaceName={updateWorkspaceName}
            onUpdateWorkspacePinOrder={updateWorkspacePinOrder}
            onUpdateWorkspacePriority={updateWorkspacePriority}
            onUpdateWorkspaceWorkflowStatus={updateWorkspaceWorkflowStatus}
            onWorkspacesExpandedChange={setIsSecondColumnWorkspacesExpanded}
        />
    );

    const groupedTwoColumnLeftContent = (
        <GroupedWorkspaceTwoColumnLeftContent
            effectiveSelectedWorkspaceGroupKey={effectiveSelectedWorkspaceGroupKey}
            groupingMode={groupingMode}
            groups={groupedWorkspaces}
            onSelectGroup={handleSelectWorkspaceGroup}
        />
    );

    const groupedTwoColumnRightContent = (
        <GroupedWorkspaceTwoColumnRightContent
            isPrimaryCollapsed={isTwoColumnPrimaryCollapsed}
            selectedGroup={selectedGroupForSidebar}
            secondColumnKanban={workspaceSidebarSecondColumnKanban}
            renderWorkspaceContentRow={renderWorkspaceContentRow}
            renderWorkspaceKanbanCard={renderWorkspaceKanbanCard}
            onTogglePrimaryPanel={toggleTwoColumnPrimaryPanel}
        />
    );

    const twoColumnSidebarContent = isTwoColumnSidebar ? (
        <TwoColumnSidebarContent
            autoSaveId={isProjectTwoColumn ? "left-sidebar-project-two-column" : `left-sidebar-group-two-column-${groupingMode}`}
            primaryPanelId={isProjectTwoColumn ? "left-sidebar-two-column-primary-project" : `left-sidebar-two-column-primary-${groupingMode}`}
            secondaryPanelId={isProjectTwoColumn ? "left-sidebar-two-column-secondary-project" : `left-sidebar-two-column-secondary-${groupingMode}`}
            storage={storage}
            primaryPanelRef={twoColumnPrimaryPanelRef}
            isPrimaryCollapsed={isTwoColumnPrimaryCollapsed}
            primarySize={currentTwoColumnPrimarySize}
            pinnedSection={pinnedWorkspaceSection}
            leftContent={isProjectTwoColumn ? projectTwoColumnLeftContent : groupedTwoColumnLeftContent}
            rightContent={isProjectTwoColumn ? projectTwoColumnRightContent : groupedTwoColumnRightContent}
            onPrimaryCollapse={() => setIsTwoColumnPrimaryCollapsed(true)}
            onPrimaryExpand={() => setIsTwoColumnPrimaryCollapsed(false)}
            onPrimaryResize={handleTwoColumnPrimaryResize}
            onDividerDragging={handleTwoColumnDividerDragging}
        />
    ) : null;

    const projectTabContent = isInitialProjectsLoading ? (
        <ProjectsSidebarLoading />
    ) : isTwoColumnSidebar
        ? twoColumnSidebarContent
        : groupingMode === 'project'
            ? projectModeOneColumnContent
            : groupedOneColumnContent;

    return (
        <>
            <aside className="@container w-full flex flex-col h-full select-none">
                {/* Management Center */}
                <div className="flex flex-col shrink-0">
                    <LeftSidebarManagementCenter
                        isExpanded={isWorkspacesExpanded}
                        onExpandedChange={setIsWorkspacesExpanded}
                        currentView={currentView}
                        canvasOpen={Boolean(canvasOpen)}
                        managementTerminalsEnabled={managementTerminalsEnabled}
                        managementAgentsEnabled={managementAgentsEnabled}
                        automationsEnabled={automationsEnabled}
                        projects={projects}
                        availableLabels={workspaceLabels}
                        kanbanFilters={kanbanFilters}
                        onFiltersChange={setKanbanFilters}
                        onNavigate={(path) => router.push(path)}
                        onOpenCanvas={() => void setCanvasOpen(true)}
                        onOpenNewWorkspace={handleOpenNewWorkspace}
                        onUpdateWorkflowStatus={updateWorkspaceWorkflowStatus}
                        onUpdatePriority={updateWorkspacePriority}
                        onCreateLabel={createWorkspaceLabel}
                        onUpdateLabel={updateWorkspaceLabel}
                        onUpdateLabels={updateWorkspaceLabels}
                        onPinWorkspace={pinWorkspace}
                        onUnpinWorkspace={unpinWorkspace}
                        onArchiveWorkspace={archiveWorkspace}
                        onDeleteWorkspace={async (projectId, workspaceId) => {
                            await deleteWorkspace(projectId, workspaceId);
                            await fetchProjects();
                        }}
                    />

                </div>



                <div className="flex-1 flex flex-col min-h-0">

                    <Tabs
                        value={filesOnRight ? 'projects' : activeTab}
                        className="flex flex-col h-full overflow-hidden"
                        onValueChange={handleTabChange}
                    >
                        <LeftSidebarTabsHeader
                            activeTab={activeTab}
                            filesOnRight={filesOnRight}
                            isAddProjectReady={isAddProjectReady}
                            layoutLoaded={layoutLoaded}
                            onAddProject={handleAddProject}
                            onTabChange={handleTabChange}
                        />

                        <TabsPanel
                            value="projects"
                            className={cn(
                                "flex-1 overflow-hidden",
                                isTwoColumnSidebar ? "pt-0 pb-0" : "pt-1.5 pb-3",
                            )}
                        >
                            <div className="flex h-full min-h-0 flex-col">
                                {!isTwoColumnSidebar ? pinnedWorkspaceSection : null}
                                <div className="flex-1 min-h-0 overflow-hidden">
                                    {projectTabContent}
                                </div>
                            </div>
                        </TabsPanel>

                        {!filesOnRight && layoutLoaded && (
                        <TabsPanel value="files" className="flex-1 overflow-hidden flex flex-col">
                            <FileTreePanel projectName={currentProject?.name} />
                        </TabsPanel>
                        )}

                    </Tabs>
                </div>
                <LeftSidebarFooter
                    activeTab={activeTab}
                    availableLabels={workspaceLabels}
                    filesOnRight={filesOnRight}
                    filters={kanbanFilters}
                    groupingMode={groupingMode}
                    isKanbanExpanded={isKanbanExpanded}
                    projects={projects}
                    onAddProject={handleAddProject}
                    onArchiveWorkspace={archiveWorkspace}
                    onCreateLabel={createWorkspaceLabel}
                    onDeleteWorkspace={async (projectId, workspaceId) => {
                        await deleteWorkspace(projectId, workspaceId);
                        await fetchProjects();
                    }}
                    onFiltersChange={setKanbanFilters}
                    onGroupingModeChange={setGroupingMode}
                    onPinWorkspace={pinWorkspace}
                    onUnpinWorkspace={unpinWorkspace}
                    onUpdateLabel={updateWorkspaceLabel}
                    onUpdateLabels={updateWorkspaceLabels}
                    onUpdatePriority={updateWorkspacePriority}
                    onUpdateWorkflowStatus={updateWorkspaceWorkflowStatus}
                />
            </aside >
            <CreateProjectDialog
                isOpen={isCreateProjectOpen}
                onClose={() => setCreateProjectOpen(false)}
            />

            <WorkspaceScriptDialog
                projectId={scriptDialogProjectId}
                isOpen={!!scriptDialogProjectId}
                onClose={() => setScriptDialogProjectId(null)}
            />

            {deleteProjectDialog && (
                <DeleteProjectDialog
                    isOpen={deleteProjectDialog.isOpen}
                    onClose={() => setDeleteProjectDialog(null)}
                    projectId={deleteProjectDialog.projectId}
                    projectName={deleteProjectDialog.projectName}
                    canDelete={deleteProjectDialog.canDelete}
                    onConfirm={async () => {
                        await deleteProject(deleteProjectDialog.projectId);
                        setDeleteProjectDialog(null);
                    }}
                />
            )}
        </>
    );
};

export default LeftSidebar;
