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
import {
  useProjects,
  useWorkspaceLabels,
  useGroups,
  useProjectBootstrapQuery,
} from '@/features/project/hooks/use-project-bootstrap-query';
import {
  createGroup,
  deleteGroup,
  renameGroup,
  setGroupMember,
  removeGroupMember,
} from '@/features/project/lib/group-actions';
import {
  UserGroupOneColumnContent,
  UserGroupTwoColumnLeftContent,
  UserGroupTwoColumnRightContent,
} from '@/app-shell/sidebar/UserGroupSidebarContent';
import { useTranslations } from 'next-intl';
import { CreateProjectDialog } from '@/features/project/components/CreateProjectDialog';
import { WorkspaceScriptDialog } from '@/features/workspace/components/WorkspaceScriptDialog';
import { DeleteProjectDialog } from '@/features/project/components/DeleteProjectDialog';
import { FileTreePanel } from '@/features/files/components/FileTreePanel';
import { functionSettingsApi } from '@/api/ws-api';
import { useComputerQueryScope } from '@/api/query/query-scope';
import { isComputerQueryScopeCurrent } from '@/api/ws/request';
import { isCancelledError } from '@/shared/lib/is-cancelled-error';
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
    const projects = useProjects();
    const workspaceLabels = useWorkspaceLabels();
    const groups = useGroups();
    const groupsT = useTranslations('appShell.groups');
    const bootstrapQuery = useProjectBootstrapQuery();
    const {
        activeInstanceId,
        connectionEpoch,
        relaySessionRevision,
    } = useComputerQueryScope();
    const workspaceSidebarSettingsScopeKey = JSON.stringify([
        activeInstanceId,
        connectionEpoch,
        relaySessionRevision,
    ]);
    const isLoading = bootstrapQuery.isPending || bootstrapQuery.isFetching;
    const hasLoadedProjects = !!bootstrapQuery.data;

    const {
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
        createWorkspaceLabel,
        updateWorkspaceLabel,
        updateWorkspaceLabels,
        markWorkspaceVisited,
        reorderProjects,
        reorderWorkspaces,
        setupProgress,
    } = useProjectStore(
        useShallow(s => ({
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
            createWorkspaceLabel: s.createWorkspaceLabel,
            updateWorkspaceLabel: s.updateWorkspaceLabel,
            updateWorkspaceLabels: s.updateWorkspaceLabels,
            markWorkspaceVisited: s.markWorkspaceVisited,
            reorderProjects: s.reorderProjects,
            reorderWorkspaces: s.reorderWorkspaces,
            setupProgress: s.setupProgress,
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
    const workspaceSidebarPriorityTwoColumn = useLayoutSettingsStore((s) => s.workspaceSidebarPriorityTwoColumn);
    const workspaceSidebarLabelTwoColumn = useLayoutSettingsStore((s) => s.workspaceSidebarLabelTwoColumn);
    const workspaceSidebarGroupTwoColumn = useLayoutSettingsStore((s) => s.workspaceSidebarGroupTwoColumn);
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
    const [labelGroupOrder, setLabelGroupOrder] = useState<string[]>([]);
    const [loadedGroupingSettingsScopeKey, setLoadedGroupingSettingsScopeKey] = useState<string | null>(null);
    const isGroupingSettingsReady =
        loadedGroupingSettingsScopeKey === workspaceSidebarSettingsScopeKey;
    const effectiveLabelGroupOrder = isGroupingSettingsReady
        ? labelGroupOrder
        : [];
    const [kanbanFilters, setKanbanFilters] = useState<WorkspaceKanbanFilters>(EMPTY_WORKSPACE_KANBAN_FILTERS);
    const [isWorkspacesExpanded, setIsWorkspacesExpanded] = useState(
        currentView === 'workspaces' || currentView === 'skills' || currentView === 'terminals' || currentView === 'agents' || currentView === 'automations' || currentView === 'disk-analyzer'
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

    const persistedGroupingModeRef = useRef<SidebarGroupingMode>('project');
    const persistedPinnedSectionCollapsedRef = useRef(false);
    const persistedLabelGroupOrderRef = useRef<string[]>([]);
    const labelGroupOrderWriteRef = useRef<Promise<void>>(Promise.resolve());
    const labelGroupOrderWriteVersionRef = useRef(0);
    const settingsScopeVersionRef = useRef(0);
    const persistWorkspaceSidebarSetting = useCallback((
        key: string,
        value: unknown,
    ) => {
        const expectedScope = {
            activeInstanceId,
            connectionEpoch,
            relaySessionRevision,
        };
        void functionSettingsApi.update(
            'workspace_sidebar',
            key,
            value,
            expectedScope,
        ).catch((error) => {
            if (!isComputerQueryScopeCurrent(expectedScope)) return;
            console.error(`Failed to persist workspace sidebar setting "${key}":`, error);
        });
    }, [activeInstanceId, connectionEpoch, relaySessionRevision]);

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
        setSelectedProjectId,
        pendingSidebarProjectId,
        setPendingSidebarProjectId,
    } = useDialogStore();

    // Projects are now loaded by the TanStack Query bootstrap — no manual fetch needed.

    useEffect(() => {
        const scopeVersion = settingsScopeVersionRef.current + 1;
        settingsScopeVersionRef.current = scopeVersion;
        labelGroupOrderWriteVersionRef.current += 1;
        labelGroupOrderWriteRef.current = Promise.resolve();
        persistedGroupingModeRef.current = 'project';
        persistedPinnedSectionCollapsedRef.current = false;
        persistedLabelGroupOrderRef.current = [];
        let retryTimer: number | null = null;
        let retryAttempt = 0;

        const loadSettings = () => {
            void functionSettingsApi.get()
                .then((settings) => {
                    if (settingsScopeVersionRef.current !== scopeVersion) return;

                    const groupingModeSetting = settings.workspace_sidebar?.grouping_mode;
                    let nextGroupingMode: SidebarGroupingMode = 'project';
                    if (
                        groupingModeSetting === 'project' ||
                        groupingModeSetting === 'group' ||
                        groupingModeSetting === 'status' ||
                        groupingModeSetting === 'time' ||
                        groupingModeSetting === 'label' ||
                        groupingModeSetting === 'priority'
                    ) {
                        nextGroupingMode = groupingModeSetting;
                    }
                    persistedGroupingModeRef.current = nextGroupingMode;
                    setGroupingMode(nextGroupingMode);

                    const savedLabelGroupOrder = settings.workspace_sidebar?.label_group_order;
                    const nextLabelGroupOrder = Array.isArray(savedLabelGroupOrder)
                        ? savedLabelGroupOrder.filter((item): item is string => typeof item === 'string')
                        : [];
                    persistedLabelGroupOrderRef.current = nextLabelGroupOrder;
                    setLabelGroupOrder(nextLabelGroupOrder);

                    const pinnedSectionCollapsed = settings.workspace_sidebar?.pinned_section_collapsed;
                    const nextPinnedSectionCollapsed =
                        typeof pinnedSectionCollapsed === 'boolean'
                            ? pinnedSectionCollapsed
                            : false;
                    persistedPinnedSectionCollapsedRef.current = nextPinnedSectionCollapsed;
                    setIsPinnedSectionCollapsed(nextPinnedSectionCollapsed);
                    setKanbanFilters(parseWorkspaceKanbanFilters(settings));
                    setSecondColumnKanbanCardProperties(
                        parseWorkspaceKanbanCardProperties(settings),
                    );
                    setLoadedGroupingSettingsScopeKey(
                        workspaceSidebarSettingsScopeKey,
                    );
                })
                .catch((error) => {
                    if (settingsScopeVersionRef.current !== scopeVersion) return;
                    if (isCancelledError(error)) return;
                    console.error('Failed to load workspace sidebar settings:', error);
                    const delay = Math.min(1_000 * 2 ** retryAttempt, 15_000);
                    retryAttempt += 1;
                    retryTimer = window.setTimeout(loadSettings, delay);
                });
        };

        queueMicrotask(() => {
            if (settingsScopeVersionRef.current !== scopeVersion) return;
            setGroupingMode('project');
            setLabelGroupOrder([]);
            setIsPinnedSectionCollapsed(false);
            setKanbanFilters(EMPTY_WORKSPACE_KANBAN_FILTERS);
            setSecondColumnKanbanCardProperties(DEFAULT_KANBAN_CARD_PROPERTIES);
            loadSettings();
        });

        return () => {
            if (retryTimer !== null) {
                window.clearTimeout(retryTimer);
            }
            if (settingsScopeVersionRef.current === scopeVersion) {
                settingsScopeVersionRef.current += 1;
            }
        };
    }, [workspaceSidebarSettingsScopeKey]);

    useEffect(() => {
        if (!isGroupingSettingsReady) return;
        if (persistedGroupingModeRef.current === groupingMode) return;
        persistedGroupingModeRef.current = groupingMode;
        persistWorkspaceSidebarSetting('grouping_mode', groupingMode);
    }, [groupingMode, isGroupingSettingsReady, persistWorkspaceSidebarSetting]);

    useEffect(() => {
        if (!isGroupingSettingsReady) return;
        if (persistedPinnedSectionCollapsedRef.current === isPinnedSectionCollapsed) return;
        persistedPinnedSectionCollapsedRef.current = isPinnedSectionCollapsed;
        persistWorkspaceSidebarSetting(
            'pinned_section_collapsed',
            isPinnedSectionCollapsed,
        );
    }, [
        isPinnedSectionCollapsed,
        isGroupingSettingsReady,
        persistWorkspaceSidebarSetting,
    ]);

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
    const openingWorkspaceId = useWorkspaceCreationStore(
        (s) => (s.phase === 'opening' ? s.pendingWorkspaceId : null),
    );

    // One-shot: onboarding/import asks the sidebar to highlight a project without
    // colliding with Add Workspace / ⌘N / GlobalSearch reuse of selectedProjectId.
    useEffect(() => {
        if (!pendingSidebarProjectId) return;
        if (!projects.some((project) => project.id === pendingSidebarProjectId)) {
            return;
        }
        setSelectedProjectSidebarId(pendingSidebarProjectId);
        setProjectSidebarSelectionRouteKey(currentSidebarRouteKey);
        setPendingSidebarProjectId(null);
    }, [
        currentSidebarRouteKey,
        pendingSidebarProjectId,
        projects,
        setPendingSidebarProjectId,
    ]);

    // Git context rebind after paint — keep sidebar hover free during rapid switches.
    useEffect(() => {
        if (!currentProjectId || !currentEffectivePath) return;
        let cancelled = false;
        const outer = requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (cancelled) return;
                if (currentWorkspaceId) {
                    if (isSettingUp) {
                        setCurrentContext(null, null, null);
                    } else {
                        setCurrentContext(currentProjectId, currentWorkspaceId, currentEffectivePath);
                    }
                } else {
                    setCurrentContext(currentProjectId, null, currentEffectivePath);
                }
            });
        });
        return () => {
            cancelled = true;
            cancelAnimationFrame(outer);
        };
    }, [currentProjectId, currentWorkspaceId, currentEffectivePath, isSettingUp, setCurrentContext]);

    useEffect(() => {
        if (currentView !== 'workspace' || !currentWorkspaceId || isLoading || !hasLoadedProjects) {
            return;
        }

        const workspaceStillExists = projects.some((project) =>
            project.workspaces.some((workspace) => workspace.id === currentWorkspaceId)
        );

        if (!workspaceStillExists) {
            if (openingWorkspaceId === currentWorkspaceId) return;
            router.replace('/');
        }
    }, [
        currentView,
        currentWorkspaceId,
        hasLoadedProjects,
        isLoading,
        openingWorkspaceId,
        projects,
        router,
    ]);

    // Debounce visited marks so rapid workspace switching does not thrash the
    // project bootstrap snapshot (and re-render every sidebar row) on each hop.
    // lastVisitedWorkspaceRef prevents re-scheduling after markWorkspaceVisited
    // patches the bootstrap snapshot (which updates `projects` and re-runs this effect).
    const pendingVisitedWorkspaceRef = useRef<string | null>(null);
    const lastVisitedWorkspaceRef = useRef<string | null>(null);
    const visitedMarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (currentView !== 'workspace' || !currentWorkspaceId) {
            pendingVisitedWorkspaceRef.current = null;
            lastVisitedWorkspaceRef.current = null;
            if (visitedMarkTimerRef.current) {
                clearTimeout(visitedMarkTimerRef.current);
                visitedMarkTimerRef.current = null;
            }
            return;
        }

        if (isLoading) {
            return;
        }

        if (lastVisitedWorkspaceRef.current === currentWorkspaceId) {
            return;
        }

        const workspaceExists = projects.some((project) =>
            project.workspaces.some((workspace) => workspace.id === currentWorkspaceId)
        );
        if (!workspaceExists) {
            return;
        }

        pendingVisitedWorkspaceRef.current = currentWorkspaceId;
        if (visitedMarkTimerRef.current) {
            clearTimeout(visitedMarkTimerRef.current);
        }
        visitedMarkTimerRef.current = setTimeout(() => {
            visitedMarkTimerRef.current = null;
            const id = pendingVisitedWorkspaceRef.current;
            if (!id) return;
            pendingVisitedWorkspaceRef.current = null;
            lastVisitedWorkspaceRef.current = id;
            void markWorkspaceVisited(id);
        }, 750);

        return () => {
            if (visitedMarkTimerRef.current) {
                clearTimeout(visitedMarkTimerRef.current);
                visitedMarkTimerRef.current = null;
            }
        };
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

    const handleCreateGroupNamed = useCallback(async (name: string) => {
        try {
            return await createGroup(name);
        } catch (error) {
            console.error('Failed to create group:', error);
            throw error;
        }
    }, []);

    const handleRenameGroupNamed = useCallback(async (groupId: string, name: string) => {
        try {
            await renameGroup(groupId, name);
        } catch (error) {
            console.error('Failed to rename group:', error);
            throw error;
        }
    }, []);

    const handleDeleteGroup = useCallback(async (groupId: string) => {
        try {
            await deleteGroup(groupId);
        } catch (error) {
            console.error('Failed to delete group:', error);
            throw error;
        }
    }, []);

    const handleAddProjectToGroup = useCallback(async (projectId: string, groupId: string) => {
        try {
            await setGroupMember({
                groupId,
                memberType: 'project',
                memberId: projectId,
            });
        } catch (error) {
            console.error('Failed to add project to group:', error);
        }
    }, []);

    const handleRemoveProjectFromGroup = useCallback(async (projectId: string) => {
        try {
            await removeGroupMember({ memberType: 'project', memberId: projectId });
        } catch (error) {
            console.error('Failed to remove project from group:', error);
        }
    }, []);

    const handleAddWorkspaceToGroup = useCallback(async (workspaceId: string, groupId: string) => {
        try {
            await setGroupMember({
                groupId,
                memberType: 'workspace',
                memberId: workspaceId,
            });
        } catch (error) {
            console.error('Failed to add workspace to group:', error);
        }
    }, []);

    const handleRemoveWorkspaceFromGroup = useCallback(async (workspaceId: string) => {
        try {
            await removeGroupMember({ memberType: 'workspace', memberId: workspaceId });
        } catch (error) {
            console.error('Failed to remove workspace from group:', error);
        }
    }, []);

    const handleSetWorkspaceGroup = useCallback(async (workspaceId: string, groupId: string | null) => {
        try {
            if (groupId) {
                await setGroupMember({
                    groupId,
                    memberType: 'workspace',
                    memberId: workspaceId,
                });
            } else {
                await removeGroupMember({ memberType: 'workspace', memberId: workspaceId });
            }
        } catch (error) {
            console.error('Failed to set workspace group:', error);
        }
    }, []);

    const handleLabelGroupOrderChange = useCallback((labelIds: string[]) => {
        setLabelGroupOrder(labelIds);

        const expectedScope = {
            activeInstanceId,
            connectionEpoch,
            relaySessionRevision,
        };
        const settingsScopeVersion = settingsScopeVersionRef.current;
        const writeVersion = labelGroupOrderWriteVersionRef.current + 1;
        labelGroupOrderWriteVersionRef.current = writeVersion;
        const write = labelGroupOrderWriteRef.current
            .catch(() => undefined)
            .then(async () => {
                if (!isComputerQueryScopeCurrent(expectedScope)) return;
                if (settingsScopeVersionRef.current !== settingsScopeVersion) return;
                const result = await functionSettingsApi.update(
                    'workspace_sidebar',
                    'label_group_order',
                    labelIds,
                    expectedScope,
                );
                if (!isComputerQueryScopeCurrent(expectedScope)) return;
                if (settingsScopeVersionRef.current !== settingsScopeVersion) return;
                if (!result.ok) {
                    throw new Error('Failed to persist workspace label group order');
                }
                persistedLabelGroupOrderRef.current = labelIds;
            });
        labelGroupOrderWriteRef.current = write;

        void write.catch((error) => {
            if (!isComputerQueryScopeCurrent(expectedScope)) return;
            console.error('Failed to persist workspace label group order:', error);
            if (settingsScopeVersionRef.current !== settingsScopeVersion) return;
            if (labelGroupOrderWriteVersionRef.current !== writeVersion) return;

            const persistedOrder = persistedLabelGroupOrderRef.current;
            setLabelGroupOrder([...persistedOrder]);
        });
    }, [activeInstanceId, connectionEpoch, relaySessionRevision]);

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
        { enableOnContentEditable: true, enableOnFormTags: true, preventDefault: true },
        [handleToggleNewWorkspace],
    );

    // ⌘⇧H → toggle the Canvas/Presentation overlay from anywhere in the app.
    useHotkeys(
        "mod+shift+h",
        handleToggleCanvas,
        { enableOnContentEditable: true, enableOnFormTags: true, preventDefault: true },
        [handleToggleCanvas],
    );

    // ⌘⇧K → expand the Kanban board overlay. The kanban dialog is bound to the
    // `lsKanban` URL state, so flipping it to true opens the board from anywhere.
    useHotkeys(
        "mod+shift+k",
        () => {
            void setIsKanbanExpanded(true);
        },
        { enableOnContentEditable: true, enableOnFormTags: true, preventDefault: true },
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
        shouldApplyWorkspaceFilter,
        shouldShowGlobalPinnedSection,
        userGroupViews,
    } = useLeftSidebarWorkspaceDerived({
        currentProjectId,
        currentSidebarRouteKey,
        currentWorkspace,
        groupingMode,
        groups,
        kanbanFilters,
        labelGroupOrder: effectiveLabelGroupOrder,
        projectSidebarSelectionRouteKey,
        projects,
        selectedProjectSidebarId,
        selectedWorkspaceGroupKey,
        ungroupedLabel: groupsT('ungrouped'),
        workspaceGroupSelectionRouteKey,
        workspaceSidebarStatusTwoColumn,
        workspaceSidebarTimeTwoColumn,
        workspaceSidebarPriorityTwoColumn,
        workspaceSidebarLabelTwoColumn,
        workspaceSidebarGroupTwoColumn,
        workspaceSidebarTwoColumn,
        workspaceLabels,
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
        shouldApplyWorkspaceFilter,
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

    const sharedProjectItemProps = {
        activeWorkspaceId: currentWorkspaceId,
        activeProjectId: currentProjectId,
        availableLabels: workspaceLabels,
        onAddWorkspace: handleAddWorkspace,
        onArchiveWorkspace: archiveWorkspace,
        onConfigureScripts: handleConfigureScripts,
        onCreateWorkspaceLabel: createWorkspaceLabel,
        onDelete: handleDeleteProject,
        onDeleteWorkspace: deleteWorkspace,
        onPinWorkspace: pinWorkspace,
        onQuickAddWorkspace: handleQuickAddWorkspace,
        onSelectMain: handleSelectProjectMain,
        onSetColor: handleSetColor,
        onSetLogo: handleSetLogo,
        onUnpinWorkspace: unpinWorkspace,
        onUpdateWorkspaceLabel: updateWorkspaceLabel,
        onUpdateWorkspaceLabels: updateWorkspaceLabels,
        onUpdateWorkspaceName: updateWorkspaceName,
        onUpdateWorkspacePriority: updateWorkspacePriority,
        onUpdateWorkspaceWorkflowStatus: updateWorkspaceWorkflowStatus,
        groups,
        onAddProjectToGroup: handleAddProjectToGroup,
        onRemoveProjectFromGroup: handleRemoveProjectFromGroup,
        onAddWorkspaceToGroup: handleAddWorkspaceToGroup,
        onRemoveWorkspaceFromGroup: handleRemoveWorkspaceFromGroup,
        onSetWorkspaceGroup: handleSetWorkspaceGroup,
        onCreateGroup: handleCreateGroupNamed,
    };

    const handleEnterWorkspaceFromSidebarKanban = useCallback((projectId: string, workspaceId: string) => {
        void projectId;
        router.push(`/workspace?id=${workspaceId}`);
    }, [router]);

    const {
        renderWorkspaceContentRow,
        renderWorkspaceItemRow,
        renderWorkspaceKanbanCard,
    } = useLeftSidebarWorkspaceRenderers({
        activeWorkspaceId: currentWorkspaceId,
        archiveWorkspace,
        createWorkspaceLabel,
        deleteWorkspace,
        groups,
        onEnterWorkspaceFromKanban: handleEnterWorkspaceFromSidebarKanban,
        onSetWorkspaceGroup: handleSetWorkspaceGroup,
        onCreateGroup: handleCreateGroupNamed,
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
            availableLabels={workspaceLabels}
            groupingMode={groupingMode}
            labelGroupOrder={effectiveLabelGroupOrder}
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
            groups={groups}
            onAddProjectToGroup={handleAddProjectToGroup}
            onRemoveProjectFromGroup={handleRemoveProjectFromGroup}
            onAddWorkspaceToGroup={handleAddWorkspaceToGroup}
            onRemoveWorkspaceFromGroup={handleRemoveWorkspaceFromGroup}
            onSetWorkspaceGroup={handleSetWorkspaceGroup}
            onCreateGroup={handleCreateGroupNamed}
        />
    );

    const groupedOneColumnContent = (
        <GroupedWorkspaceOneColumnContent
            collapsedWorkspaceGroups={collapsedWorkspaceGroups}
            groupingMode={groupingMode}
            groups={groupedWorkspaces}
            onLabelGroupOrderChange={
                isGroupingSettingsReady ? handleLabelGroupOrderChange : undefined
            }
            renderWorkspaceContentRow={renderWorkspaceContentRow}
            sensors={sensors}
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
            groups={groups}
            onAddProjectToGroup={handleAddProjectToGroup}
            onRemoveProjectFromGroup={handleRemoveProjectFromGroup}
            onAddWorkspaceToGroup={handleAddWorkspaceToGroup}
            onRemoveWorkspaceFromGroup={handleRemoveWorkspaceFromGroup}
            onSetWorkspaceGroup={handleSetWorkspaceGroup}
            onCreateGroup={handleCreateGroupNamed}
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

    const userGroupOneColumnContent = (
        <UserGroupOneColumnContent
            views={userGroupViews}
            collapsedKeys={collapsedWorkspaceGroups}
            onToggleCollapsed={toggleWorkspaceGroup}
            onCreateGroup={handleCreateGroupNamed}
            onRenameGroup={handleRenameGroupNamed}
            onDeleteGroup={handleDeleteGroup}
            projectItemProps={sharedProjectItemProps}
            expandedProjectIds={expandedProjects}
            onToggleProject={toggleProject}
            renderWorkspaceContentRow={renderWorkspaceContentRow}
        />
    );

    const userGroupTwoColumnLeftContent = (
        <UserGroupTwoColumnLeftContent
            views={userGroupViews}
            selectedKey={effectiveSelectedWorkspaceGroupKey}
            onSelect={handleSelectWorkspaceGroup}
            onCreateGroup={handleCreateGroupNamed}
            onRenameGroup={handleRenameGroupNamed}
            onDeleteGroup={handleDeleteGroup}
        />
    );

    const userGroupTwoColumnRightContent = (
        <UserGroupTwoColumnRightContent
            selectedView={selectedUserGroupForSidebar}
            isPrimaryCollapsed={isTwoColumnPrimaryCollapsed}
            onTogglePrimaryPanel={toggleTwoColumnPrimaryPanel}
            projectItemProps={sharedProjectItemProps}
            expandedProjectIds={expandedProjects}
            onToggleProject={toggleProject}
            renderWorkspaceContentRow={renderWorkspaceContentRow}
        />
    );

    const twoColumnLeftContent = isProjectTwoColumn
        ? projectTwoColumnLeftContent
        : isGroupTwoColumn
            ? userGroupTwoColumnLeftContent
            : groupedTwoColumnLeftContent;
    const twoColumnRightContent = isProjectTwoColumn
        ? projectTwoColumnRightContent
        : isGroupTwoColumn
            ? userGroupTwoColumnRightContent
            : groupedTwoColumnRightContent;

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
            leftContent={twoColumnLeftContent}
            rightContent={twoColumnRightContent}
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
            : groupingMode === 'group'
                ? userGroupOneColumnContent
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
                        groups={groups}
                        groupingMode={groupingMode}
                        kanbanFilters={kanbanFilters}
                        onFiltersChange={setKanbanFilters}
                        onGroupingModeChange={setGroupingMode}
                        onNavigate={(path) => router.push(path)}
                        onOpenCanvas={() => void setCanvasOpen(true)}
                        onOpenNewWorkspace={handleOpenNewWorkspace}
                        onUpdateWorkflowStatus={updateWorkspaceWorkflowStatus}
                        onUpdatePriority={updateWorkspacePriority}
                        onSetWorkspaceGroup={handleSetWorkspaceGroup}
                        onCreateLabel={createWorkspaceLabel}
                        onUpdateLabel={updateWorkspaceLabel}
                        onUpdateLabels={updateWorkspaceLabels}
                        onPinWorkspace={pinWorkspace}
                        onUnpinWorkspace={unpinWorkspace}
                        onArchiveWorkspace={archiveWorkspace}
                        onDeleteWorkspace={async (projectId, workspaceId) => {
                            await deleteWorkspace(projectId, workspaceId);
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
                            filesOnRight={filesOnRight}
                            layoutLoaded={layoutLoaded}
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
                    groups={groups}
                    isKanbanExpanded={isKanbanExpanded}
                    projects={projects}
                    onAddProject={handleAddProject}
                    onArchiveWorkspace={archiveWorkspace}
                    onCreateLabel={createWorkspaceLabel}
                    onDeleteWorkspace={async (projectId, workspaceId) => {
                        await deleteWorkspace(projectId, workspaceId);
                    }}
                    onFiltersChange={setKanbanFilters}
                    onGroupingModeChange={setGroupingMode}
                    onPinWorkspace={pinWorkspace}
                    onSetWorkspaceGroup={handleSetWorkspaceGroup}
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
