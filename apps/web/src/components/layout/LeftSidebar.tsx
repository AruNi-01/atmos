"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { DragStartEvent } from '@workspace/ui';
import { useAppRouter } from '@/hooks/use-app-router';
import { useQueryState } from 'nuqs';
import { useContextParams } from '@/hooks/use-context-params';
import { leftSidebarParams, type LeftSidebarTab } from '@/lib/nuqs/searchParams';
import {
  Plus,
  Folder,
  Layers,
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  toastManager,
  cn,
  restrictToVerticalAxis,
  restrictToWindowEdges,
  MouseSensor,
  DragOverlay,
  defaultDropAnimationSideEffects,
  Tabs,
  TabsList,
  TabsTab,
  TabsPanel,
  LoaderCircle,
  Eye,
  EyeOff,
  FolderKanban,
  ArrowRight,
  Puzzle,
  SquareTerminal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui";
import type { Project,
  WorkspacePriority,
  WorkspaceWorkflowStatus } from '@/types/types';
import { useProjectStore } from '@/hooks/use-project-store';
import { CreateWorkspaceDialog } from '@/components/dialogs/CreateWorkspaceDialog';
import { CreateProjectDialog } from '@/components/dialogs/CreateProjectDialog';
import { WorkspaceScriptDialog } from '@/components/dialogs/WorkspaceScriptDialog';
import { DeleteProjectDialog } from '@/components/dialogs/DeleteProjectDialog';
import { FileTree } from '@/components/files/FileTree';
import { fsApi, FileTreeNode, functionSettingsApi } from '@/api/ws-api';
import { useEditorStore } from '@/hooks/use-editor-store';
import { useShallow } from 'zustand/react/shallow';
import { useGitInfoStore } from '@/hooks/use-git-info-store';
import { useDialogStore } from '@/hooks/use-dialog-store';
import {
  Bot,
  ChevronRight,
  Group,
  SquareKanban,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ProjectItem } from '@/components/layout/sidebar/ProjectItem';
import { SortableProject } from '@/components/layout/sidebar/SortableProject';
import { WorkspaceContent } from '@/components/layout/sidebar/WorkspaceContent';
import { WorkspaceItem } from '@/components/layout/sidebar/WorkspaceItem';
import { WorkspaceKanbanView } from '@/components/layout/sidebar/WorkspaceKanbanView';
import {
  flattenProjectWorkspaces,
  getWorkspaceTimeGroupLabel,
  groupWorkspaces,
} from '@/components/layout/sidebar/workspace-grouping';
import {
  SIDEBAR_GROUPING_OPTIONS,
  WORKSPACE_WORKFLOW_STATUS_OPTIONS,
  getWorkspaceWorkflowStatusMeta,
  type SidebarGroupingMode,
} from '@/components/layout/sidebar/workspace-status';
import { WORKSPACE_PRIORITY_OPTIONS } from '@/components/layout/sidebar/workspace-metadata-controls';
import {
  EMPTY_WORKSPACE_KANBAN_FILTERS,
  WorkspaceKanbanFilterMenu,
  filterWorkspaceKanbanEntries,
  getActiveWorkspaceKanbanFilterCount,
  type WorkspaceKanbanFilters,
} from '@/components/layout/sidebar/WorkspaceKanbanFilterMenu';
import { isWorkspaceSetupBlocking } from '@/utils/workspace-setup';
import { useWorkspaceCreationStore } from '@/hooks/use-workspace-creation-store';

interface LeftSidebarProps {
    projects?: Project[];
}

function normalizePathForContainment(path: string): string {
    const normalized = path.replace(/\\/g, '/');
    if (normalized.length > 1 && normalized.endsWith('/')) {
        return normalized.slice(0, -1);
    }
    return normalized;
}

const LeftSidebar: React.FC<LeftSidebarProps> = () => {
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

    const setCurrentProjectPath = useEditorStore(s => s.setCurrentProjectPath);
    const fileTreeRevealTarget = useEditorStore(s => s.fileTreeRevealTarget);
    const fileTreeRefreshRequest = useEditorStore(s => s.fileTreeRefreshRequest);
    const clearFileTreeRefreshRequest = useEditorStore(s => s.clearFileTreeRefreshRequest);
    const { setCurrentContext } = useGitInfoStore();

    const [activeTab, setActiveTab] = useQueryState("lsTab", leftSidebarParams.lsTab);
    const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
    const [collapsedWorkspaceGroups, setCollapsedWorkspaceGroups] = useState<Record<string, boolean>>({});
    const [groupingMode, setGroupingMode] = useState<SidebarGroupingMode>('project');
    const [isGroupingSettingsReady, setIsGroupingSettingsReady] = useState(false);
    const [kanbanFilters, setKanbanFilters] = useState<WorkspaceKanbanFilters>(EMPTY_WORKSPACE_KANBAN_FILTERS);
    const [isWorkspacesExpanded, setIsWorkspacesExpanded] = useState(
        currentView === 'workspaces' || currentView === 'skills' || currentView === 'terminals' || currentView === 'agents'
    );
    const [activeId, setActiveId] = useState<string | null>(null);

    const [fileTreeData, setFileTreeData] = useState<FileTreeNode[]>([]);
    const [fileTreeProjectId, setFileTreeProjectId] = useState<string | null>(null);
    const [fileTreeWorkspaceId, setFileTreeWorkspaceId] = useState<string | null>(null);
    const [fileTreeShowHidden, setFileTreeShowHidden] = useState(false);

    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    const [showHiddenFiles, setShowHiddenFiles] = useState(false);

    const fetchRequestId = useRef(0);

    const {
        isCreateProjectOpen,
        setCreateProjectOpen,
        isCreateWorkspaceOpen,
        setCreateWorkspaceOpen,
        selectedProjectId,
        setSelectedProjectId
    } = useDialogStore();

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    useEffect(() => {
        functionSettingsApi.get()
            .then((settings) => {
                const groupingModeSetting = settings.workspace_sidebar?.grouping_mode;
                if (groupingModeSetting === 'project' || groupingModeSetting === 'status' || groupingModeSetting === 'time') {
                    setGroupingMode(groupingModeSetting);
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
        const availableStatusSet = new Set(WORKSPACE_WORKFLOW_STATUS_OPTIONS.map((option) => option.value));
        const availablePrioritySet = new Set(WORKSPACE_PRIORITY_OPTIONS.map((option) => option.value));

        functionSettingsApi.get()
            .then((settings) => {
                const section = settings.workspace_kanban_view;
                const raw = (section && typeof section === "object" && "state" in (section as Record<string, unknown>))
                    ? (section as { state?: unknown }).state
                    : section;
                const state = (raw && typeof raw === "object") ? raw as { filters?: Record<string, unknown> } : {};
                const filters = state.filters && typeof state.filters === "object" ? state.filters : {};

                setKanbanFilters({
                    statuses: Array.isArray(filters.statuses)
                        ? filters.statuses.filter((item): item is WorkspaceWorkflowStatus => availableStatusSet.has(item as WorkspaceWorkflowStatus))
                        : [],
                    priorities: Array.isArray(filters.priorities)
                        ? filters.priorities.filter((item): item is WorkspacePriority => availablePrioritySet.has(item as WorkspacePriority))
                        : [],
                    labelIds: Array.isArray(filters.label_ids)
                        ? filters.label_ids.filter((item): item is string => typeof item === "string")
                        : [],
                    projectIds: Array.isArray(filters.project_ids)
                        ? filters.project_ids.filter((item): item is string => typeof item === "string")
                        : [],
                });
            })
            .catch(() => {
                setKanbanFilters(EMPTY_WORKSPACE_KANBAN_FILTERS);
            });
    }, []);

    useEffect(() => {
        if (projects.length > 0 && expandedProjects.length === 0) {
            setExpandedProjects(projects.map(p => p.id));
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

    const doFetchFileTree = useCallback(async (projectId: string, workspaceId: string | null, effectivePath: string, showHidden: boolean = false) => {
        if (!effectivePath) return;

        const currentRequestId = ++fetchRequestId.current;

        setIsLoadingFiles(true);
        setFileTreeData([]);

        try {
            const response = await fsApi.listProjectFiles(effectivePath, { showHidden });

            if (fetchRequestId.current === currentRequestId) {
                setFileTreeData(response.tree);
                setFileTreeProjectId(projectId);
                setFileTreeWorkspaceId(workspaceId);
                setFileTreeShowHidden(showHidden);
                setCurrentProjectPath(effectivePath);
            } else {
                console.log(`[Req #${currentRequestId}] Stale response ignored.`);
            }
        } catch (error) {
            if (fetchRequestId.current === currentRequestId) {
                console.error(`[Req #${currentRequestId}] Failed to fetch file tree:`, error);
                toastManager.add({
                    title: 'Error',
                    description: 'Failed to load project files',
                    type: 'error',
                });
                setFileTreeData([]);
                setFileTreeProjectId(projectId);
                setFileTreeWorkspaceId(workspaceId);
            }
        } finally {
            if (fetchRequestId.current === currentRequestId) {
                setIsLoadingFiles(false);
            }
        }
    }, [setCurrentProjectPath]);

    useEffect(() => {
        if (activeTab === 'files' && currentProjectId && currentEffectivePath) {
            const canFetch = currentWorkspaceId ? !isSettingUp : true;

            if (canFetch) {
                const isContextMismatch = fileTreeProjectId !== currentProjectId || fileTreeWorkspaceId !== currentWorkspaceId;
                const isHiddenMismatch = fileTreeShowHidden !== showHiddenFiles;

                if ((isContextMismatch || isHiddenMismatch) && !isLoadingFiles) {
                    doFetchFileTree(currentProjectId, currentWorkspaceId, currentEffectivePath, showHiddenFiles);
                }
            }
        }
    }, [activeTab, currentProjectId, currentWorkspaceId, currentEffectivePath, isSettingUp, fileTreeProjectId, fileTreeWorkspaceId, fileTreeShowHidden, isLoadingFiles, doFetchFileTree, showHiddenFiles]);

    useEffect(() => {
        if (!fileTreeRevealTarget) return;
        if (fileTreeRevealTarget.workspaceId && fileTreeRevealTarget.workspaceId !== effectiveContextId) {
            return;
        }
        if (!currentEffectivePath) return;
        const normalizedCurrentPath = normalizePathForContainment(currentEffectivePath);
        const normalizedRevealPath = normalizePathForContainment(fileTreeRevealTarget.path);
        if (
            normalizedRevealPath !== normalizedCurrentPath &&
            !normalizedRevealPath.startsWith(`${normalizedCurrentPath}/`)
        ) {
            return;
        }
        if (activeTab !== 'files') {
            void setActiveTab('files');
        }
    }, [activeTab, currentEffectivePath, currentWorkspaceId, effectiveContextId, fileTreeRevealTarget, setActiveTab]);

    useEffect(() => {
        if (!fileTreeRefreshRequest || !currentProjectId || !currentEffectivePath) return;
        if (
            fileTreeRefreshRequest.workspaceId &&
            fileTreeRefreshRequest.workspaceId !== effectiveContextId
        ) {
            return;
        }

        doFetchFileTree(
            currentProjectId,
            currentWorkspaceId,
            currentEffectivePath,
            showHiddenFiles
        );
        clearFileTreeRefreshRequest(fileTreeRefreshRequest.requestId);
    }, [
        clearFileTreeRefreshRequest,
        currentEffectivePath,
        currentProjectId,
        currentWorkspaceId,
        doFetchFileTree,
        effectiveContextId,
        fileTreeRefreshRequest,
        showHiddenFiles,
    ]);

    const handleTabChange = (value: string) => {
        setActiveTab(value as LeftSidebarTab);
    };

    const handleRefreshFiles = () => {
        if (currentProjectId && currentEffectivePath) {
            doFetchFileTree(currentProjectId, currentWorkspaceId, currentEffectivePath, showHiddenFiles);
        }
    };

    const toggleHiddenFiles = () => {
        setShowHiddenFiles(prev => !prev);
    };

    const isIdsMatching = fileTreeProjectId === currentProjectId && fileTreeWorkspaceId === currentWorkspaceId;
    const shouldShowLoader = isLoadingFiles || (activeTab === 'files' && !isIdsMatching && !!currentProject);

    const isAnyProjectDragging = activeId !== null && projects.some(p => p.id === activeId);

    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const toggleProject = (id: string) => {
        setExpandedProjects(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    };

    const toggleWorkspaceGroup = useCallback((groupKey: string) => {
        setCollapsedWorkspaceGroups((prev) => ({
            ...prev,
            [groupKey]: !prev[groupKey],
        }));
    }, []);

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(String(event.active.id));
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (over && active.id !== over.id) {
            const activeProjectIndex = projects.findIndex((i) => i.id === active.id);
            const overProjectIndex = projects.findIndex((i) => i.id === over.id);

            if (activeProjectIndex !== -1 && overProjectIndex !== -1) {
                const newProjects = arrayMove(projects, activeProjectIndex, overProjectIndex);
                await reorderProjects(newProjects);
                return;
            }

            for (const project of projects) {
                const activeWorkspaceIndex = project.workspaces.findIndex((w) => w.id === active.id);
                const overWorkspaceIndex = project.workspaces.findIndex((w) => w.id === over.id);

                if (activeWorkspaceIndex !== -1 && overWorkspaceIndex !== -1) {
                    const newWorkspaces = arrayMove(project.workspaces, activeWorkspaceIndex, overWorkspaceIndex);
                    await reorderWorkspaces(project.id, newWorkspaces);
                    return;
                }
            }
        }
    };

    const handleAddProject = () => {
        setCreateProjectOpen(true);
    };

    const handleAddWorkspace = (projectId: string) => {
        setSelectedProjectId(projectId);
        setCreateWorkspaceOpen(true);
    };

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
        await updateProject(projectId, { borderColor: color });
    };

    const flattenedWorkspaces = useMemo(() => flattenProjectWorkspaces(projects), [projects]);
    const activeKanbanFilterCount = getActiveWorkspaceKanbanFilterCount(kanbanFilters);
    const filteredFlattenedWorkspaces = useMemo(
        () => filterWorkspaceKanbanEntries(flattenedWorkspaces, kanbanFilters),
        [flattenedWorkspaces, kanbanFilters],
    );
    const projectModeProjects = useMemo(() => {
        if (activeKanbanFilterCount === 0) return projects;
        const visibleWorkspaceIds = new Set(filteredFlattenedWorkspaces.map((entry) => entry.workspace.id));
        return projects
            .map((project) => ({
                ...project,
                workspaces: project.workspaces.filter((workspace) => visibleWorkspaceIds.has(workspace.id)),
            }))
            .filter((project) => project.workspaces.length > 0);
    }, [activeKanbanFilterCount, filteredFlattenedWorkspaces, projects]);
    const pinnedWorkspaces = useMemo(
        () => filteredFlattenedWorkspaces
            .filter((e) => e.workspace.isPinned)
            .sort((a, b) => {
                const aOrder = a.workspace.pinOrder;
                const bOrder = b.workspace.pinOrder;
                if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) {
                    return aOrder - bOrder;
                }
                if (aOrder !== undefined && bOrder === undefined) return -1;
                if (aOrder === undefined && bOrder !== undefined) return 1;

                const aTime = a.workspace.pinnedAt ? new Date(a.workspace.pinnedAt).getTime() : 0;
                const bTime = b.workspace.pinnedAt ? new Date(b.workspace.pinnedAt).getTime() : 0;
                if (aTime !== bTime) return bTime - aTime;
                return a.workspace.id.localeCompare(b.workspace.id);
            }),
        [filteredFlattenedWorkspaces],
    );
    const isPinnedSortingDisabled = activeKanbanFilterCount > 0;
    const unpinnedFlattenedWorkspaces = useMemo(
        () => filteredFlattenedWorkspaces.filter((e) => !e.workspace.isPinned),
        [filteredFlattenedWorkspaces],
    );
    const groupedWorkspaces = useMemo(() => {
        if (groupingMode === 'project') return [];
        return groupWorkspaces(unpinnedFlattenedWorkspaces, groupingMode);
    }, [unpinnedFlattenedWorkspaces, groupingMode]);

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

    const [isAddProjectReady, setIsAddProjectReady] = useState(false);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (activeTab === 'projects') {
            timer = setTimeout(() => {
                setIsAddProjectReady(true);
            }, 1000);
        } else {
            setIsAddProjectReady(false);
        }
        return () => clearTimeout(timer);
    }, [activeTab]);

    const pinnedWorkspaceSection = pinnedWorkspaces.length > 0 ? (
        <>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => {
                    if (isPinnedSortingDisabled) return;
                    const { active, over } = event;
                    if (!over || active.id === over.id) return;

                    const oldIndex = pinnedWorkspaces.findIndex(e => e.workspace.id === active.id);
                    const newIndex = pinnedWorkspaces.findIndex(e => e.workspace.id === over.id);
                    if (oldIndex === -1 || newIndex === -1) return;

                    const reordered = arrayMove(pinnedWorkspaces, oldIndex, newIndex);
                    updateWorkspacePinOrder(reordered.map(e => e.workspace.id));
                }}
                modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
            >
                <SortableContext items={pinnedWorkspaces.map(e => e.workspace.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-0.5 px-2 pb-1">
                        {pinnedWorkspaces.map((entry) => (
                            (() => {
                                const statusMeta = getWorkspaceWorkflowStatusMeta(entry.workspace.workflowStatus);
                                const StatusIcon = statusMeta.icon;
                                const rightContext = groupingMode === 'status' ? (
                                    <StatusIcon className={cn("size-3.5 shrink-0", statusMeta.className)} />
                                ) : groupingMode === 'time' ? (
                                    <span className="truncate">{getWorkspaceTimeGroupLabel(entry.workspace)}</span>
                                ) : undefined;

                                return (
                                    <WorkspaceItem
                                        key={entry.workspace.id}
                                        workspace={entry.workspace}
                                        projectId={entry.projectId}
                                        projectName={entry.projectName}
                                        projectPath={entry.projectPath}
                                        showProjectName={true}
                                        rightContext={rightContext}
                                        sortingDisabled={isPinnedSortingDisabled}
                                        sortingDisabledMessage="Clear workspace filters before reordering pinned workspaces."
                                        onPin={(workspaceId) => pinWorkspace(entry.projectId, workspaceId)}
                                        onUnpin={(workspaceId) => unpinWorkspace(entry.projectId, workspaceId)}
                                        onArchive={(workspaceId) => archiveWorkspace(entry.projectId, workspaceId)}
                                        onDelete={(workspaceId) => deleteWorkspace(entry.projectId, workspaceId)}
                                        onUpdateWorkflowStatus={(workspaceId, workflowStatus) =>
                                            updateWorkspaceWorkflowStatus(entry.projectId, workspaceId, workflowStatus)
                                        }
                                        onUpdatePriority={(workspaceId, priority) =>
                                            updateWorkspacePriority(entry.projectId, workspaceId, priority)
                                        }
                                        availableLabels={workspaceLabels}
                                        onCreateLabel={createWorkspaceLabel}
                                        onUpdateLabel={updateWorkspaceLabel}
                                        onUpdateLabels={(workspaceId, labels) =>
                                            updateWorkspaceLabels(entry.projectId, workspaceId, labels)
                                        }
                                        onUpdateName={(workspaceId, name) =>
                                            updateWorkspaceName(entry.projectId, workspaceId, name)
                                        }
                                    />
                                );
                            })()
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
            <div className="mx-4 my-1.5 border-t border-dashed border-sidebar-border" />
        </>
    ) : null;

    return (
        <>
            <aside className="@container w-full flex flex-col h-full select-none">
                {/* Management Center */}
                <div className="flex flex-col border-b border-sidebar-border shrink-0">
                    <div
                        className="h-[39px] flex items-center justify-between px-4 text-sm font-medium cursor-pointer hover:bg-sidebar-accent/50 transition-colors select-none"
                        onClick={() => setIsWorkspacesExpanded(!isWorkspacesExpanded)}
                    >
                        <div className="flex items-center gap-2">
                            <Layers className="size-4" />
                            <span>Management Center</span>
                        </div>
                        <div className={cn("text-muted-foreground transition-transform duration-200", isWorkspacesExpanded ? "rotate-90" : "")}>
                            <ArrowRight className="size-3.5" />
                        </div>
                    </div>

                    <div className={cn(
                        "grid transition-[grid-template-rows] duration-200 ease-in-out",
                        isWorkspacesExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    )}>
                        <div className="overflow-hidden border-t border-sidebar-border/30">
                            <div className="grid grid-cols-1 @[200px]:grid-cols-2">
                                {[
                                    { id: 'workspaces', label: 'Workspaces', icon: SquareKanban, path: '/workspaces' },
                                    { id: 'skills', label: 'Skills', icon: Puzzle, path: '/skills' },
                                    { id: 'terminals', label: 'Terminals', icon: SquareTerminal, path: '/terminals' },
                                    { id: 'agents', label: 'Agents', icon: Bot, path: '/agents' },
                                ].map((item, index) => {
                                    const Icon = item.icon;
                                    const isActive = currentView === item.id;
                                    const isLeftColumnOnTwoCol = index % 2 === 0;
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => router.push(item.path)}
                                            className={cn(
                                                "group relative h-12 cursor-pointer overflow-hidden transition-all duration-300 outline-none",
                                                "border-b border-b-sidebar-border/30 transition-colors",
                                                isLeftColumnOnTwoCol && "@[200px]:border-r @[200px]:border-sidebar-border/30",
                                                isActive ? "text-sidebar-foreground" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                                            )}
                                        >
                                            <AnimatePresence>
                                                {isActive && (
                                                    <motion.div
                                                        initial={{ scaleX: 0, opacity: 0 }}
                                                        animate={{ scaleX: 1, opacity: 1 }}
                                                        exit={{ scaleX: 0, opacity: 0 }}
                                                        transition={{
                                                            default: { ease: [0.16, 1, 0.3, 1] },
                                                            opacity: { duration: 0.5 },
                                                            scaleX: {
                                                                duration: isActive ? 0.6 : 1.0,
                                                                type: "tween"
                                                            }
                                                        }}
                                                        className="absolute bottom-0 left-0 right-0 h-px bg-sidebar-foreground z-10 origin-center"
                                                    />
                                                )}
                                            </AnimatePresence>

                                            <div className="flex flex-col h-[200%] w-full transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) group-hover:-translate-y-1/2">
                                                <div className="flex items-center justify-center h-1/2 w-full transition-all duration-300 group-hover:opacity-0 group-hover:scale-90">
                                                    <Icon className="size-4.5" />
                                                </div>
                                                <div className="flex items-center justify-center h-1/2 w-full px-1">
                                                    <span className="text-[10px] font-bold uppercase tracking-tight text-center leading-none">
                                                        {item.label}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                </div>



                <div className="flex-1 flex flex-col min-h-0">

                    <Tabs
                        value={activeTab}
                        className="flex flex-col h-full overflow-hidden"
                        onValueChange={handleTabChange}
                    >
                        <div className="h-10 flex border-b border-sidebar-border">
                            <TabsList variant="underline" className="w-full h-full gap-0 items-stretch py-0!">
                                <TabsTab
                                    value="projects"
                                    className="flex-1 h-full! text-[12px] p-0 overflow-hidden relative rounded-none border-0!"
                                >
                                    <div
                                        className="w-full h-full flex items-center justify-center group cursor-pointer"
                                        onClick={(e) => {
                                            if (activeTab === 'projects' && isAddProjectReady) {
                                                e.stopPropagation();
                                                handleAddProject();
                                            }
                                        }}
                                    >
                                        <div className="flex items-center justify-center gap-0.5">
                                            <div className="relative size-3.5 shrink-0">
                                                <FolderKanban className={cn(
                                                    "absolute inset-0 size-3.5 transition-transform duration-300",
                                                    activeTab === 'projects' && isAddProjectReady && "group-hover:-translate-y-8"
                                                )} />
                                                <Plus className={cn(
                                                    "absolute inset-0 size-3.5 -translate-x-8 opacity-0 transition-all duration-300",
                                                    activeTab === 'projects' && isAddProjectReady && "group-hover:translate-x-0 group-hover:opacity-100"
                                                )} />
                                            </div>

                                            <div className="flex items-center whitespace-nowrap">
                                                <span className={cn(
                                                    "inline-block overflow-hidden max-w-0 opacity-0 transition-all duration-300 ease-out text-left",
                                                    activeTab === 'projects' && isAddProjectReady && "group-hover:max-w-[40px] group-hover:opacity-100"
                                                )}>
                                                    Add&nbsp;
                                                </span>
                                                <span>Project</span>
                                                <span className={cn(
                                                    "inline-block overflow-hidden transition-all duration-300 max-w-[10px]",
                                                    activeTab === 'projects' && isAddProjectReady && "group-hover:max-w-0 group-hover:opacity-0 group-hover:translate-x-2"
                                                )}>
                                                    s
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </TabsTab>
                                <TabsTab
                                    value="files"
                                    className="flex-1 h-full! text-[12px] gap-1.5 rounded-none border-0!"
                                >
                                    <Folder className="size-3.5" />
                                    <span>Files</span>
                                </TabsTab>
                            </TabsList>
                        </div>

                        <TabsPanel value="projects" className="flex-1 overflow-y-auto no-scrollbar pt-1.5 pb-3">
                            {pinnedWorkspaceSection}
                            {groupingMode === 'project' ? (
                                <>
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragStart={handleDragStart}
                                    onDragEnd={handleDragEnd}
                                    modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
                                >
                                    <SortableContext items={projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
                                        {projectModeProjects.map(project => (
                                            <SortableProject
                                                key={project.id}
                                                project={project}
                                                isExpanded={expandedProjects.includes(project.id)}
                                                isAnyProjectDragging={isAnyProjectDragging}
                                                onToggle={toggleProject}
                                                onAddWorkspace={handleAddWorkspace}
                                                onQuickAddWorkspace={handleQuickAddWorkspace}
                                                onSetColor={handleSetColor}
                                                onDelete={handleDeleteProject}
                                                onPinWorkspace={pinWorkspace}
                                                onUnpinWorkspace={unpinWorkspace}
                                                onArchiveWorkspace={archiveWorkspace}
                                                onDeleteWorkspace={deleteWorkspace}
                                                onUpdateWorkspaceWorkflowStatus={updateWorkspaceWorkflowStatus}
                                                onUpdateWorkspacePriority={updateWorkspacePriority}
                                                availableLabels={workspaceLabels}
                                                onCreateWorkspaceLabel={createWorkspaceLabel}
                                                onUpdateWorkspaceLabel={updateWorkspaceLabel}
                                                onUpdateWorkspaceLabels={updateWorkspaceLabels}
                                                onUpdateWorkspaceName={updateWorkspaceName}
                                                onConfigureScripts={handleConfigureScripts}
                                                onSelectMain={(id) => router.push(`/project?id=${id}`)}
                                                isActiveProject={currentProjectId === project.id && !currentWorkspaceId}
                                            />
                                        ))}
                                    </SortableContext>

                                    <DragOverlay
                                        dropAnimation={{
                                            sideEffects: defaultDropAnimationSideEffects({
                                                styles: {
                                                    active: {
                                                        opacity: '0.4',
                                                    },
                                                },
                                            }),
                                        }}
                                    >
                                        {activeId && projects.find(p => p.id === activeId) ? (
                                            <ProjectItem
                                                project={projects.find(p => p.id === activeId)!}
                                                isExpanded={false}
                                                isDragging={true}
                                                onToggle={() => { }}
                                                onAddWorkspace={() => { }}
                                                onQuickAddWorkspace={() => { }}
                                                onSetColor={() => { }}
                                                onDelete={() => { }}
                                                onPinWorkspace={() => { }}
                                                onUnpinWorkspace={() => { }}
                                                onArchiveWorkspace={() => { }}
                                                onDeleteWorkspace={() => { }}
                                                onUpdateWorkspaceName={async () => { }}
                                                onUpdateWorkspaceWorkflowStatus={() => { }}
                                                onUpdateWorkspacePriority={() => { }}
                                                availableLabels={workspaceLabels}
                                                onCreateWorkspaceLabel={async data => ({ id: "", name: data.name, color: data.color })}
                                                onUpdateWorkspaceLabel={async (_labelId, data) => ({ id: _labelId, name: data.name, color: data.color })}
                                                onUpdateWorkspaceLabels={async () => { }}
                                                onConfigureScripts={() => { }}
                                                onSelectMain={() => { }}
                                                isActiveProject={false}
                                            />
                                        ) : activeId && projects.some(p => p.workspaces.some(w => w.id === activeId)) ? (
                                            (() => {
                                                const entry = flattenedWorkspaces.find(({ workspace }) => workspace.id === activeId);
                                                if (!entry) return null;
                                                return (
                                                    <WorkspaceContent
                                                        workspace={entry.workspace}
                                                        projectId={entry.projectId}
                                                        projectName={entry.projectName}
                                                        isDragging={true}
                                                    />
                                                );
                                            })()
                                        ) : null}
                                    </DragOverlay>
                                </DndContext>
                                </>
                            ) : (
                                <div className="space-y-0.5 px-2">
                                    {groupedWorkspaces.map((group) => (
                                        <section key={group.key} className="space-y-1.5">
                                            {(() => {
                                                const stateKey = `${groupingMode}:${group.key}`;
                                                const isCollapsed = collapsedWorkspaceGroups[stateKey] ?? false;
                                                const statusMeta = groupingMode === 'status'
                                                    ? getWorkspaceWorkflowStatusMeta(group.key as Parameters<typeof getWorkspaceWorkflowStatusMeta>[0])
                                                    : null;
                                                const StatusIcon = statusMeta?.icon;

                                                return (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleWorkspaceGroup(stateKey)}
                                                            className="group flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-[11px] font-semibold tracking-[0.03em] text-muted-foreground transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                                                        >
                                                            {StatusIcon ? (
                                                                <StatusIcon className={cn("size-3.5 shrink-0", statusMeta?.className)} />
                                                            ) : null}
                                                            <span className="truncate">{group.label}</span>
                                                            <ChevronRight
                                                                className={cn(
                                                                    "ml-1 size-3 shrink-0 opacity-0 transition-all duration-200 group-hover:opacity-100",
                                                                    !isCollapsed && "rotate-90",
                                                                )}
                                                            />
                                                            <span className="ml-auto text-[10px] font-medium normal-case tracking-normal text-muted-foreground/80">
                                                                {group.items.length}
                                                            </span>
                                                        </button>
                                                        <div
                                                            className={cn(
                                                                "grid transition-[grid-template-rows] duration-300 ease-out",
                                                                isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
                                                            )}
                                                        >
                                                            <div className="overflow-hidden">
                                                                <div className="space-y-1 pl-3 pt-0.5">
                                                                    {group.items.map((entry) => (
                                                                        <WorkspaceContent
                                                                            key={entry.workspace.id}
                                                                            workspace={entry.workspace}
                                                                            projectId={entry.projectId}
                                                                            projectName={entry.projectName}
                                                                            projectPath={entry.projectPath}
                                                                            showProjectName={true}
                                                                            onPin={(workspaceId) => pinWorkspace(entry.projectId, workspaceId)}
                                                                            onUnpin={(workspaceId) => unpinWorkspace(entry.projectId, workspaceId)}
                                                                            onArchive={(workspaceId) => archiveWorkspace(entry.projectId, workspaceId)}
                                                                            onDelete={(workspaceId) => deleteWorkspace(entry.projectId, workspaceId)}
                                                                            onUpdateWorkflowStatus={(workspaceId, workflowStatus) =>
                                                                                updateWorkspaceWorkflowStatus(entry.projectId, workspaceId, workflowStatus)
                                                                            }
                                                                            onUpdatePriority={(workspaceId, priority) =>
                                                                                updateWorkspacePriority(entry.projectId, workspaceId, priority)
                                                                            }
                                                                            availableLabels={workspaceLabels}
                                                                            onCreateLabel={createWorkspaceLabel}
                                                                            onUpdateLabel={updateWorkspaceLabel}
                                                                            onUpdateLabels={(workspaceId, labels) =>
                                                                                updateWorkspaceLabels(entry.projectId, workspaceId, labels)
                                                                            }
                                                                        onUpdateName={(workspaceId, name) =>
                                                                            updateWorkspaceName(entry.projectId, workspaceId, name)
                                                                        }
                                                                    />
                                                                ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </section>
                                    ))}
                                </div>
                            )}
                        </TabsPanel>

                        <TabsPanel value="files" className="flex-1 overflow-y-auto no-scrollbar flex flex-col">
                            {currentProject && (
                                <div className="flex items-center justify-between px-3 py-1.5 border-b border-sidebar-border">
                                    <span className="text-[12px] font-medium text-muted-foreground truncate">
                                        {currentProject.name}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={toggleHiddenFiles}
                                            className={cn(
                                                "p-1 hover:bg-sidebar-accent rounded-sm transition-colors",
                                                showHiddenFiles ? "text-sidebar-foreground bg-sidebar-accent" : "text-muted-foreground"
                                            )}
                                            title={showHiddenFiles ? "Hide hidden files" : "Show hidden files"}
                                        >
                                            {showHiddenFiles ? (
                                                <Eye className="size-3.5" />
                                            ) : (
                                                <EyeOff className="size-3.5" />
                                            )}
                                        </button>
                                        <button
                                            onClick={handleRefreshFiles}
                                            className="p-1 hover:bg-sidebar-accent rounded-sm transition-colors"
                                            title="Refresh files"
                                            disabled={isLoadingFiles}
                                        >
                                            <LoaderCircle className={cn("size-3.5 text-muted-foreground",
                                                isLoadingFiles && "animate-spin")} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto pt-1.5">
                                {!currentProject ? (
                                    <div className="px-4 py-8 text-center">
                                        <Folder className="size-8 mx-auto text-muted-foreground mb-2 opacity-50" />
                                        <p className="text-muted-foreground text-xs text-pretty italic">
                                            Select a workspace to view files
                                        </p>
                                    </div>
                                ) : !currentEffectivePath ? (
                                    <div className="px-4 py-8 text-center text-muted-foreground">
                                        <p className="text-sm">No project path configured</p>
                                    </div>
                                ) : shouldShowLoader ? (
                                    <div className="flex items-center justify-center py-8">
                                        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
                                    </div>
                                ) : (
                                    <FileTree
                                        key={`${currentProjectId}-${currentWorkspaceId}`}
                                        data={fileTreeData}
                                        rootPath={currentEffectivePath}
                                        onRefresh={handleRefreshFiles}
                                    />
                                )}
                            </div>
                        </TabsPanel>

                    </Tabs>
                </div>
                {activeTab === 'projects' && (
                    <div className="relative shrink-0 bg-transparent">
                        <div className="relative flex items-center justify-between gap-1 px-1.5 py-0.5">
                            <div className="flex items-center gap-0">
                                <WorkspaceKanbanFilterMenu
                                    projects={projects}
                                    availableLabels={workspaceLabels}
                                    filters={kanbanFilters}
                                    onFiltersChange={setKanbanFilters}
                                    triggerVariant="icon"
                                    align="start"
                                    side="top"
                                />
                                {(() => {
                                    const currentGroupingOption = SIDEBAR_GROUPING_OPTIONS.find((option) => option.value === groupingMode)
                                        ?? SIDEBAR_GROUPING_OPTIONS[0];

                                    return (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="group inline-flex h-8 items-center gap-0.5 rounded-lg bg-transparent px-1 text-[11px] text-muted-foreground/90 transition-colors hover:text-sidebar-foreground"
                                                >
                                                    <span className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover:text-sidebar-foreground">
                                                        <Group className="size-3.5" />
                                                    </span>
                                                    <span>
                                                        {currentGroupingOption.label}
                                                    </span>
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-40">
                                                {SIDEBAR_GROUPING_OPTIONS.map((option) => (
                                                    <DropdownMenuItem
                                                        key={option.value}
                                                        className={cn(
                                                            "cursor-pointer",
                                                            groupingMode === option.value && "bg-accent text-accent-foreground",
                                                        )}
                                                        onClick={() => setGroupingMode(option.value)}
                                                    >
                                                        <option.icon className="size-4 text-muted-foreground" />
                                                        <span>{option.label}</span>
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    );
                                })()}
                            </div>
                            <WorkspaceKanbanView
                                projects={projects}
                                availableLabels={workspaceLabels}
                                onUpdateWorkflowStatus={updateWorkspaceWorkflowStatus}
                                onUpdatePriority={updateWorkspacePriority}
                                onCreateLabel={createWorkspaceLabel}
                                onUpdateLabel={updateWorkspaceLabel}
                                onUpdateLabels={updateWorkspaceLabels}
                                filters={kanbanFilters}
                                onFiltersChange={setKanbanFilters}
                                trigger={(
                                    <button
                                        type="button"
                                        className="group inline-flex h-8 items-center gap-1 rounded-lg bg-transparent px-0.5 text-[11px] text-muted-foreground/90 transition-colors hover:text-sidebar-foreground"
                                    >
                                        <span className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover:text-sidebar-foreground">
                                            <SquareKanban className="size-3.5" />
                                        </span>
                                    </button>
                                )}
                            />
                        </div>
                    </div>
                )}
            </aside >

            <CreateWorkspaceDialog
                isOpen={isCreateWorkspaceOpen}
                onClose={() => setCreateWorkspaceOpen(false)}
                defaultProjectId={selectedProjectId}
            />
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
