"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
    RefreshCw,
    Eye,
    EyeOff,
    FolderKanban,
    ArrowRight,
    Puzzle,
    SquareTerminal
} from "@workspace/ui";
import { Project } from '@/types/types';
import { useProjectStore } from '@/hooks/use-project-store';
import { CreateWorkspaceDialog } from '@/components/dialogs/CreateWorkspaceDialog';
import { CreateProjectDialog } from '@/components/dialogs/CreateProjectDialog';
import { WorkspaceScriptDialog } from '@/components/dialogs/WorkspaceScriptDialog';
import { DeleteProjectDialog } from '@/components/dialogs/DeleteProjectDialog';
import { FileTree } from '@/components/files/FileTree';
import { fsApi, FileTreeNode } from '@/api/ws-api';
import { useEditorStore } from '@/hooks/use-editor-store';
import { useShallow } from 'zustand/react/shallow';
import { useGitInfoStore } from '@/hooks/use-git-info-store';
import { useDialogStore } from '@/hooks/use-dialog-store';
import { Bot, SquareKanban } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ProjectItem } from '@/components/layout/sidebar/ProjectItem';
import { SortableProject } from '@/components/layout/sidebar/SortableProject';
import { WorkspaceContent } from '@/components/layout/sidebar/WorkspaceContent';

interface LeftSidebarProps {
    projects?: Project[];
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({ projects: initialProjects }) => {
    const router = useAppRouter();
    const { workspaceId: currentWorkspaceId, projectId: currentProjectIdFromUrl, currentView } = useContextParams();
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
            reorderProjects: s.reorderProjects,
            reorderWorkspaces: s.reorderWorkspaces,
            setupProgress: s.setupProgress,
            isLoading: s.isLoading,
        }))
    );

    const setCurrentProjectPath = useEditorStore(s => s.setCurrentProjectPath);
    const { setCurrentContext } = useGitInfoStore();

    const [activeTab, setActiveTab] = useQueryState("lsTab", leftSidebarParams.lsTab);
    const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
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
        if (projects.length > 0 && expandedProjects.length === 0) {
            setExpandedProjects(projects.map(p => p.id));
        }
    }, [projects]);

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
    const isSettingUp = currentWorkspaceId ? setupProgress[currentWorkspaceId]?.status !== 'completed' && !!setupProgress[currentWorkspaceId] : false;

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

    const doFetchFileTree = useCallback(async (projectId: string, workspaceId: string | null, effectivePath: string, showHidden: boolean = false) => {
        if (!effectivePath) return;

        const currentRequestId = ++fetchRequestId.current;

        setIsLoadingFiles(true);
        setFileTreeData([]);

        console.log(`[Req #${currentRequestId}] Fetching files for Project: ${projectId}, Workspace: ${workspaceId}, Path: ${effectivePath}`);

        try {
            const response = await fsApi.listProjectFiles(effectivePath, { showHidden });

            if (fetchRequestId.current === currentRequestId) {
                console.log(`[Req #${currentRequestId}] Fetch success. Updating state.`);
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
        const workspaceId = await quickAddWorkspace(projectId);
        if (workspaceId) {
            router.push(`/workspace?id=${workspaceId}`);
        }
    };

    const handleSetColor = async (projectId: string, color?: string) => {
        await updateProject(projectId, { borderColor: color });
    };

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
                            <div className="grid grid-cols-1 @[200px]:grid-cols-2 @[300px]:grid-cols-3">
                                {[
                                    { id: 'workspaces', label: 'Workspaces', icon: SquareKanban, path: '/workspaces' },
                                    { id: 'skills', label: 'Skills', icon: Puzzle, path: '/skills' },
                                    { id: 'terminals', label: 'Terminals', icon: SquareTerminal, path: '/terminals' },
                                    { id: 'agents', label: 'Agents', icon: Bot, path: '/agents' },
                                ].map((item) => {
                                    const Icon = item.icon;
                                    const isActive = currentView === item.id;
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => router.push(item.path)}
                                            className={cn(
                                                "group relative h-12 cursor-pointer overflow-hidden transition-all duration-300 border-r border-sidebar-border/30 last:border-r-0 outline-none",
                                                "border-b border-b-sidebar-border/30 transition-colors",
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
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                                modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
                            >
                                <SortableContext items={projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
                                    {projects.map(project => (
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
                                            onConfigureScripts={() => { }}
                                            onSelectMain={() => { }}
                                            isActiveProject={false}
                                        />
                                    ) : activeId && projects.some(p => p.workspaces.some(w => w.id === activeId)) ? (
                                        (() => {
                                            const ws = projects.flatMap(p => p.workspaces).find(w => w.id === activeId)!;
                                            return (
                                                <WorkspaceContent
                                                    workspace={ws}
                                                    projectId={ws.projectId}
                                                    isDragging={true}
                                                />
                                            );
                                        })()
                                    ) : null}
                                </DragOverlay>
                            </DndContext>
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
                                            <RefreshCw className={cn(
                                                "size-3.5 text-muted-foreground",
                                                isLoadingFiles && "animate-spin"
                                            )} />
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
                                        <RefreshCw className="size-5 animate-spin text-muted-foreground" />
                                    </div>
                                ) : (
                                    <FileTree
                                        key={`${currentProjectId}-${currentWorkspaceId}`}
                                        data={fileTreeData}
                                    />
                                )}
                            </div>
                        </TabsPanel>

                    </Tabs>
                </div>
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
