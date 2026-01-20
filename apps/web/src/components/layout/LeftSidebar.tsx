"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Plus,
    Folder,
    Layers,
    X,
    Trash2,
    Palette,
    Zap,
    Pin,
    Archive,
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
    useSortable,
    CSS,
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Button,
    toastManager,
    cn,
    restrictToVerticalAxis,
    restrictToWindowEdges,
    MouseSensor,
    DragOverlay,
    defaultDropAnimationSideEffects,
    GitBranch,
    Tabs,
    TabsList,
    TabsTab,
    TabsPanel
} from "@workspace/ui";
import { Project, Workspace, PROJECT_COLOR_PRESETS } from '@/types/types';
import { projectApi, workspaceApi } from '@/api/project';
import { useProjectStore } from '@/hooks/use-project-store';
import { CreateWorkspaceDialog } from '@/components/dialogs/CreateWorkspaceDialog';
import { CreateProjectDialog } from '@/components/dialogs/CreateProjectDialog';
import { formatRelativeTime } from '@atmos/shared';
import { getWorkspaceShortName } from '@/utils/format-time';

// ... (Keep existing stateless components: ProjectItem, SortableProject, WorkspaceContent, WorkspaceItem)
// But update them to handle onClick correctly

const ProjectItem: React.FC<{
    project: Project;
    isExpanded: boolean;
    isDragging?: boolean;
    isPlaceholder?: boolean;
    isAnyProjectDragging?: boolean;
    attributes?: any;
    listeners?: any;
    onToggle: (id: string) => void;
    onAddWorkspace: (projectId: string) => void;
    onQuickAddWorkspace: (projectId: string) => void;
    onSetColor: (projectId: string, color?: string) => void;
    onDelete: (projectId: string) => void;
    onPinWorkspace: (projectId: string, workspaceId: string) => void;
    onUnpinWorkspace: (projectId: string, workspaceId: string) => void;
    onArchiveWorkspace: (projectId: string, workspaceId: string) => void;
    onDeleteWorkspace: (projectId: string, workspaceId: string) => void;
}> = ({
    project,
    isExpanded,
    isDragging,
    isPlaceholder,
    isAnyProjectDragging,
    attributes,
    listeners,
    onToggle,
    onAddWorkspace,
    onQuickAddWorkspace,
    onSetColor,
    onDelete,
    onPinWorkspace,
    onUnpinWorkspace,
    onArchiveWorkspace,
    onDeleteWorkspace,
}) => {
        const initialLetter = project.name.charAt(0).toUpperCase();

        return (
            <div
                className={cn(
                    "group/project mb-1 transition-all duration-200",
                    isPlaceholder ? "opacity-20" : "opacity-100",
                    isDragging && "z-50"
                )}
            >
                <div className={cn(
                    "flex items-center justify-between px-2 py-1.5 hover:bg-sidebar-accent/50 rounded-sm mx-2 transition-all duration-200",
                    isDragging && "bg-sidebar-accent shadow-2xl scale-[1.02]"
                )}>
                    <div
                        {...attributes}
                        {...listeners}
                        className="flex items-center flex-1 min-w-0 cursor-pointer select-none"
                        onClick={() => onToggle(project.id)}
                    >
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                            <div
                                className="size-6 flex items-center justify-center bg-sidebar-accent rounded-md border border-sidebar-border text-[10px] font-bold text-muted-foreground shrink-0 transition-colors group-hover/project:bg-sidebar-accent/80"
                                style={{ borderLeft: project.borderColor ? `2px solid ${project.borderColor}` : undefined }}
                            >
                                {initialLetter}
                            </div>
                            <span className="text-[13px] font-medium truncate text-sidebar-foreground group-hover/project:text-sidebar-foreground transition-colors">
                                {project.name}
                            </span>
                        </div>
                    </div>

                    {!isDragging && (
                        <div className="flex items-center opacity-0 group-hover/project:opacity-100 transition-opacity">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="p-1 hover:bg-sidebar-accent rounded-sm transition-all duration-200">
                                        <Plus className="size-3.5 text-muted-foreground" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuItem onClick={() => onQuickAddWorkspace(project.id)}>
                                        <Zap className="size-4 mr-2" />
                                        <span>Quick New Workspace</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onAddWorkspace(project.id)}>
                                        <Plus className="size-4 mr-2" />
                                        <span>New Workspace</span>
                                    </DropdownMenuItem>

                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>
                                            <Palette className="size-4 mr-2" />
                                            <span>Set Color</span>
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent className="p-1">
                                            <div className="grid grid-cols-5 gap-1 p-1">
                                                {PROJECT_COLOR_PRESETS.map((preset) => (
                                                    <button
                                                        key={preset.name}
                                                        onClick={() => onSetColor(project.id, preset.color)}
                                                        className="size-6 rounded-md hover:scale-110 transition-transform flex items-center justify-center border border-sidebar-border"
                                                        style={{ backgroundColor: preset.color || 'transparent' }}
                                                        title={preset.name}
                                                    >
                                                        {!preset.color && <X className="size-3 text-muted-foreground" />}
                                                    </button>
                                                ))}
                                            </div>
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                        onClick={() => onDelete(project.id)}
                                    >
                                        <Trash2 className="size-4 mr-2" />
                                        <span>Delete Project</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}
                </div>

                {isExpanded && !isDragging && (
                    <div
                        className={cn(
                            "ml-8 mt-1 space-y-0.5 pr-2 transition-all duration-200 overflow-hidden",
                            isAnyProjectDragging ? "pointer-events-none opacity-0 max-h-0" : "opacity-100 max-h-[1000px]"
                        )}
                    >
                        <SortableContext items={project.workspaces.map(w => w.id)} strategy={verticalListSortingStrategy}>
                            {project.workspaces.map((ws) => (
                                <WorkspaceItem
                                    key={ws.id}
                                    workspace={ws}
                                    projectId={project.id}
                                    onPin={(wsId) => onPinWorkspace(project.id, wsId)}
                                    onUnpin={(wsId) => onUnpinWorkspace(project.id, wsId)}
                                    onArchive={(wsId) => onArchiveWorkspace(project.id, wsId)}
                                    onDelete={(wsId) => onDeleteWorkspace(project.id, wsId)}
                                />
                            ))}
                        </SortableContext>
                        {project.workspaces.length === 0 && (
                            <div className="py-2 text-[12px] text-muted-foreground italic">No workspaces</div>
                        )}
                    </div>
                )}
            </div>
        );
    };

const SortableProject: React.FC<{
    project: Project;
    isExpanded: boolean;
    isAnyProjectDragging: boolean;
    onToggle: (id: string) => void;
    onAddWorkspace: (projectId: string) => void;
    onQuickAddWorkspace: (projectId: string) => void;
    onSetColor: (projectId: string, color?: string) => void;
    onDelete: (projectId: string) => void;
    onPinWorkspace: (projectId: string, workspaceId: string) => void;
    onUnpinWorkspace: (projectId: string, workspaceId: string) => void;
    onArchiveWorkspace: (projectId: string, workspaceId: string) => void;
    onDeleteWorkspace: (projectId: string, workspaceId: string) => void;
}> = (props) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: props.project.id });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style}>
            <ProjectItem
                {...props}
                isPlaceholder={isDragging}
                attributes={attributes}
                listeners={listeners}
            />
        </div>
    );
};

const WorkspaceContent: React.FC<{
    workspace: Workspace;
    projectId: string;
    isDragging?: boolean;
    isPlaceholder?: boolean;
    attributes?: any;
    listeners?: any;
    onPin?: (workspaceId: string) => void;
    onUnpin?: (workspaceId: string) => void;
    onArchive?: (workspaceId: string) => void;
    onDelete?: (workspaceId: string) => void;
}> = ({ workspace, projectId, isDragging, isPlaceholder, attributes, listeners, onPin, onUnpin, onArchive, onDelete }) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isActive = searchParams.get('workspaceId') === workspace.id;
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    const handleClick = () => {
        router.push(`?workspaceId=${workspace.id}`);
    };

    const handlePinClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (workspace.isPinned) {
            onUnpin?.(workspace.id);
        } else {
            onPin?.(workspace.id);
        }
    };

    const handleArchiveClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onArchive?.(workspace.id);
    };

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowDeleteDialog(true);
    };

    const confirmDelete = () => {
        onDelete?.(workspace.id);
        setShowDeleteDialog(false);
    };

    const shortName = getWorkspaceShortName(workspace.name);
    const timeAgo = formatRelativeTime(workspace.createdAt);

    return (
        <>
            <div
                {...attributes}
                {...listeners}
                onClick={handleClick}
                className={cn(
                    "flex flex-col px-3 py-2 rounded-md cursor-pointer transition-all border border-transparent hover:bg-sidebar-accent/50 group/ws",
                    isActive
                        ? 'bg-sidebar-accent/50 text-sidebar-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-sidebar-foreground',
                    isPlaceholder && "opacity-20",
                    isDragging && "bg-sidebar-accent shadow-xl scale-[1.02] border-sidebar-border text-sidebar-foreground"
                )}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center min-w-0 flex-1">
                        <GitBranch className={cn("size-3.5 mr-2 shrink-0", isActive || isDragging ? 'text-sidebar-foreground' : 'text-muted-foreground group-hover/ws:text-foreground')} />
                        <span className="text-[13px] font-medium truncate">{workspace.branch}</span>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover/ws:opacity-100 transition-opacity ml-2">
                        <button
                            onClick={handlePinClick}
                            className={cn(
                                "size-4 flex items-center justify-center hover:bg-muted rounded transition-colors hover:cursor-pointer",
                                workspace.isPinned && "text-amber-500"
                            )}
                            title={workspace.isPinned ? "Unpin" : "Pin"}
                        >
                            <Pin className="size-3" />
                        </button>
                        <button
                            onClick={handleArchiveClick}
                            className="size-4 flex items-center justify-center hover:bg-muted rounded transition-colors hover:cursor-pointer"
                            title="Archive"
                        >
                            <Archive className="size-3" />
                        </button>
                    </div>
                </div>
                <div className="flex items-center mt-0.5 ml-5">
                    <span className="text-[11px] text-muted-foreground truncate">{shortName}</span>
                    <span className="text-[11px] text-muted-foreground mx-1">·</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo}</span>
                </div>
            </div>

            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent showCloseButton={false}>
                    <DialogHeader>
                        <DialogTitle>Delete Workspace</DialogTitle>
                        <DialogDescription>
                            This will permanently delete the workspace `{workspace.name}` and its local directory. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

const WorkspaceItem: React.FC<{
    workspace: Workspace;
    projectId: string;
    onPin: (workspaceId: string) => void;
    onUnpin: (workspaceId: string) => void;
    onArchive: (workspaceId: string) => void;
    onDelete: (workspaceId: string) => void;
}> = ({ workspace, projectId, onPin, onUnpin, onArchive, onDelete }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: workspace.id });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition: transition || 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
    };

    return (
        <div ref={setNodeRef} style={style}>
            <WorkspaceContent
                workspace={workspace}
                projectId={projectId}
                isPlaceholder={isDragging}
                attributes={attributes}
                listeners={listeners}
                onPin={onPin}
                onUnpin={onUnpin}
                onArchive={onArchive}
                onDelete={onDelete}
            />
        </div>
    );
};

interface LeftSidebarProps {
    projects?: Project[]; // Optional now as we use store
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({ projects: initialProjects }) => {
    const router = useRouter();
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
    } = useProjectStore();

    const [activeTab, setActiveTab] = useState<'projects' | 'files'>('projects');
    const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);

    // Dialog states
    const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
    const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');

    // Fetch projects on mount
    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    // Update expanded projects when projects load
    useEffect(() => {
        if (projects.length > 0 && expandedProjects.length === 0) {
            setExpandedProjects(projects.map(p => p.id));
        }
    }, [projects]);

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

    const handleDragStart = (event: { active: { id: any } }) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (over && active.id !== over.id) {
            // Check if sorting projects
            const activeProjectIndex = projects.findIndex((i) => i.id === active.id);
            const overProjectIndex = projects.findIndex((i) => i.id === over.id);

            if (activeProjectIndex !== -1 && overProjectIndex !== -1) {
                // Optimistic update
                // Note: Implement reorder action in store if needed
                // For now just toast
                toastManager.add({
                    title: "Sorted",
                    description: "Project order updated locally",
                    type: "info"
                });
                return;
            }

            // Check if sorting workspaces within a project
            // This logic needs to be robust to handle cross-project drags if allowed,
            // but for now we assume same-list sorting within SortableContext
        }
    };

    const handleAddProject = () => {
        setIsCreateProjectOpen(true);
    };

    const handleAddWorkspace = (projectId: string) => {
        setSelectedProjectId(projectId);
        setIsCreateWorkspaceOpen(true);
    };

    const handleQuickAddWorkspace = async (projectId: string) => {
        const workspaceId = await quickAddWorkspace(projectId);
        if (workspaceId) {
            router.push(`?workspaceId=${workspaceId}`);
        }
    };

    const handleSetColor = async (projectId: string, color?: string) => {
        await updateProject(projectId, { borderColor: color });
    };

    const handleDeleteProject = async (projectId: string) => {
        if (confirm("Are you sure you want to delete this project?")) {
            await deleteProject(projectId);
        }
    };

    return (
        <>
            <aside className="w-full flex flex-col border-r border-sidebar-border h-full select-none">
                <Tabs
                    defaultValue="projects"
                    className="flex flex-col h-full"
                    onValueChange={(value) => setActiveTab(value as 'projects' | 'files')}
                >
                    {/* Tabs Header */}
                    <div className="h-10 flex items-center px-2 border-b border-sidebar-border">
                        <TabsList className="w-full gap-1">
                            <TabsTab
                                value="projects"
                                className="flex-1 h-7 text-[12px] gap-1.5"
                            >
                                <Layers className="size-3.5" />
                                <span>Projects</span>
                            </TabsTab>
                            <TabsTab
                                value="files"
                                className="flex-1 h-7 text-[12px] gap-1.5"
                            >
                                <Folder className="size-3.5" />
                                <span>Files</span>
                            </TabsTab>
                        </TabsList>
                    </div>

                    {/* Tab Panels */}
                    <TabsPanel value="projects" className="flex-1 overflow-y-auto no-scrollbar py-3">
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

                    <TabsPanel value="files" className="flex-1 overflow-y-auto no-scrollbar py-3">
                        <div className="px-4 py-8 text-center">
                            <Folder className="size-8 mx-auto text-muted-foreground mb-2 opacity-50" />
                            <p className="text-muted-foreground text-xs text-pretty italic">Select a project to view files</p>
                        </div>
                    </TabsPanel>

                    {/* Add Button */}
                    {activeTab === 'projects' && (
                        <div className="p-3 border-t border-sidebar-border">
                            <button
                                onClick={handleAddProject}
                                className="w-full flex items-center justify-center space-x-2 bg-transparent hover:bg-sidebar-accent text-sidebar-foreground text-[13px] py-2 rounded-md border border-sidebar-border transition-all duration-200"
                            >
                                <Plus className="size-4" />
                                <span className="font-medium">Add Project</span>
                            </button>
                        </div>
                    )}
                </Tabs>
            </aside>

            {/* Dialogs */}
            <CreateWorkspaceDialog
                isOpen={isCreateWorkspaceOpen}
                onClose={() => setIsCreateWorkspaceOpen(false)}
                defaultProjectId={selectedProjectId}
            />
            <CreateProjectDialog
                isOpen={isCreateProjectOpen}
                onClose={() => setIsCreateProjectOpen(false)}
            />
        </>
    );
};

export default LeftSidebar;
