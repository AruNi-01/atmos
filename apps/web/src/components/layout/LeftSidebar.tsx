"use client";

import React, { useState, useRef, useEffect } from 'react';
import {
    ChevronRight,
    ChevronDown,
    Plus,
    GitBranch,
    Folder,
    File,
    Layers,
    MoreHorizontal,
    Settings,
    X,
    Trash2,
    Palette,
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
    toastManager,
    cn,
    restrictToVerticalAxis,
    restrictToWindowEdges,
    MouseSensor,
    DragOverlay,
    defaultDropAnimationSideEffects,
    rectIntersection
} from "@workspace/ui";
import { Project, Workspace, PROJECT_COLOR_PRESETS } from '@/types/types';
import { projectApi } from '@/api/project';

// Sortable Project Item
// Stateless Project UI for Main List and Drag Overlay
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
    onSetColor: (projectId: string, color?: string) => void;
    onDelete: (projectId: string) => void;
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
    onSetColor,
    onDelete
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
                    "flex items-center justify-between px-2 py-1.5 hover:bg-zinc-800/40 rounded-sm mx-2 transition-all duration-200",
                    isDragging && "bg-zinc-800 shadow-2xl scale-[1.02]"
                )}>
                    <div
                        {...attributes}
                        {...listeners}
                        className="flex items-center flex-1 min-w-0 cursor-pointer select-none"
                        onClick={() => onToggle(project.id)}
                    >
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                            <div
                                className="size-6 flex items-center justify-center bg-zinc-800 rounded-md border border-white/5 text-[10px] font-bold text-zinc-400 shrink-0 transition-colors group-hover/project:bg-zinc-700"
                                style={{ borderLeft: project.borderColor ? `2px solid ${project.borderColor}` : undefined }}
                            >
                                {initialLetter}
                            </div>
                            <span className="text-[13px] font-medium truncate text-zinc-300 group-hover/project:text-white transition-colors">
                                {project.name}
                            </span>
                        </div>
                    </div>

                    {!isDragging && (
                        <div className="flex items-center opacity-0 group-hover/project:opacity-100 transition-opacity">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="p-1 hover:bg-zinc-700 rounded-sm transition-all duration-200">
                                        <Plus className="size-3.5 text-zinc-400" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
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
                                                        className="size-6 rounded-md hover:scale-110 transition-transform flex items-center justify-center border border-white/10"
                                                        style={{ backgroundColor: preset.color || 'transparent' }}
                                                        title={preset.name}
                                                    >
                                                        {!preset.color && <X className="size-3 text-zinc-500" />}
                                                    </button>
                                                ))}
                                            </div>
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                    <DropdownMenuSeparator />

                                    <DropdownMenuItem onClick={() => window.open(`/project/${project.id}/settings`, '_blank')}>
                                        <Settings className="size-4 mr-2" />
                                        <span>Project Setting</span>
                                    </DropdownMenuItem>
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

                {/* When dragging a project, we don't render its workspaces in the list to avoid collision issues */}
                {isExpanded && !isDragging && (
                    <div
                        className={cn(
                            "ml-8 space-y-0.5 pr-2 transition-all duration-200 overflow-hidden",
                            isAnyProjectDragging ? "pointer-events-none opacity-0 max-h-0" : "opacity-100 max-h-[1000px]"
                        )}
                    >
                        <SortableContext items={project.workspaces.map(w => w.id)} strategy={verticalListSortingStrategy}>
                            {project.workspaces.map((ws) => (
                                <WorkspaceItem key={ws.id} workspace={ws} />
                            ))}
                        </SortableContext>
                        {project.workspaces.length === 0 && (
                            <div className="py-2 text-[12px] text-zinc-600 italic">No workspaces</div>
                        )}
                    </div>
                )}
            </div>
        );
    };

// Sortable wrapper
const SortableProject: React.FC<{
    project: Project;
    isExpanded: boolean;
    isAnyProjectDragging: boolean;
    onToggle: (id: string) => void;
    onAddWorkspace: (projectId: string) => void;
    onSetColor: (projectId: string, color?: string) => void;
    onDelete: (projectId: string) => void;
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
    isDragging?: boolean;
    isPlaceholder?: boolean;
    attributes?: any;
    listeners?: any;
}> = ({ workspace, isDragging, isPlaceholder, attributes, listeners }) => {
    return (
        <div
            {...attributes}
            {...listeners}
            className={cn(
                "flex items-center px-3 py-1.5 rounded-md cursor-pointer transition-all border border-transparent group/ws",
                workspace.isActive
                    ? 'bg-zinc-800 text-blue-400 border-white/5 shadow-inner'
                    : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200',
                isPlaceholder && "opacity-20",
                isDragging && "bg-zinc-800 shadow-xl scale-[1.02] border-white/5 text-blue-400"
            )}
        >
            <GitBranch className={cn("size-3.5 mr-2", workspace.isActive || isDragging ? 'text-blue-400' : 'text-zinc-600 group-hover/ws:text-zinc-400')} />
            <span className="text-[13px] truncate">{workspace.name}</span>
            {workspace.isActive && !isDragging && (
                <div className="ml-auto size-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
            )}
        </div>
    );
};

const WorkspaceItem: React.FC<{ workspace: Workspace }> = ({ workspace }) => {
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
                isPlaceholder={isDragging}
                attributes={attributes}
                listeners={listeners}
            />
        </div>
    );
};

interface LeftSidebarProps {
    projects: Project[];
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({ projects: initialProjects }) => {
    const [activeTab, setActiveTab] = useState<'projects' | 'files'>('projects');
    const [projects, setProjects] = useState<Project[]>(initialProjects);
    const [expandedProjects, setExpandedProjects] = useState<string[]>(projects.map(p => p.id));
    const [activeId, setActiveId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (over && active.id !== over.id) {
            setProjects((items) => {
                // Check if sorting projects
                const activeProjectIndex = items.findIndex((i) => i.id === active.id);
                const overProjectIndex = items.findIndex((i) => i.id === over.id);

                if (activeProjectIndex !== -1 && overProjectIndex !== -1) {
                    return arrayMove(items, activeProjectIndex, overProjectIndex);
                }

                // Check if sorting workspaces within a project
                return items.map(project => {
                    const activeWorkspaceIndex = project.workspaces.findIndex(w => w.id === active.id);
                    const overWorkspaceIndex = project.workspaces.findIndex(w => w.id === over.id);

                    if (activeWorkspaceIndex !== -1 && overWorkspaceIndex !== -1) {
                        return {
                            ...project,
                            workspaces: arrayMove(project.workspaces, activeWorkspaceIndex, overWorkspaceIndex)
                        };
                    }
                    return project;
                });
            });

            toastManager.add({
                title: "Sorted",
                description: "Order updated successfully",
                type: "success"
            });
        }
    };

    const handleAddProject = () => {
        fileInputRef.current?.click();
    };

    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        // In a real web environment, we can't get the full path easily.
        // For this habitat app, we assume it's running in an environment where we can validate.
        const path = "/Users/username/mock/project"; // Placeholder for selection logic

        try {
            const result = await projectApi.validateGitPath(path);

            if (result.success && result.data?.isValid) {
                const newProject = await projectApi.create({
                    name: result.data.name,
                    mainFilePath: path,
                    sidebarOrder: projects.length,
                });

                if (newProject.success && newProject.data) {
                    setProjects([...projects, newProject.data as any]);
                    toastManager.add({
                        title: "Success",
                        description: `Project ${result.data.name} added`,
                        type: "success"
                    });
                }
            } else {
                // Centered toast for failure
                // Since our ToastProvider is bottom-right, we use a specific override or another provider
                // Alternatively, we can use toastManager if we adjust our Toaster component
                toastManager.add({
                    title: "Add Failed",
                    description: "Not a valid git project",
                    type: "error",
                    // Custom implementation for bottom-center if supported
                });

                // For now, satisfy requirement manually via alert or by improving the Toast implementation
            }
        } catch (error) {
            toastManager.add({ title: "Error", description: "Failed to add project", type: "error" });
        }
    };

    const handleSetColor = async (projectId: string, color?: string) => {
        try {
            await projectApi.update({ id: projectId, borderColor: color });
            setProjects(prev => prev.map(p =>
                p.id === projectId ? { ...p, borderColor: color } : p
            ));
        } catch (error) {
            toastManager.add({ title: "Error", description: "Failed to set color", type: "error" });
        }
    };

    const handleDeleteProject = async (projectId: string) => {
        if (confirm("Are you sure you want to delete this project?")) {
            try {
                await projectApi.delete(projectId);
                setProjects(prev => prev.filter(p => p.id !== projectId));
                toastManager.add({ title: "Deleted", description: "Project removed", type: "info" });
            } catch (error) {
                toastManager.add({ title: "Error", description: "Failed to delete project", type: "error" });
            }
        }
    };

    return (
        <aside className="w-full flex flex-col border-r border-white/5 h-full select-none bg-[#0a0a0a]">
            {/* Tabs Header */}
            <div className="h-10 flex items-center px-2 border-b border-white/5 space-x-1">
                <button
                    onClick={() => setActiveTab('projects')}
                    className={cn(
                        "flex-1 flex items-center justify-center space-x-2 py-1.5 rounded-sm text-[12px] font-medium transition-all duration-300",
                        activeTab === 'projects' ? 'bg-zinc-800 text-zinc-100 shadow-lg' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
                    )}
                >
                    <Layers className="size-3.5" />
                    <span>Projects</span>
                </button>
                <button
                    onClick={() => setActiveTab('files')}
                    className={cn(
                        "flex-1 flex items-center justify-center space-x-2 py-1.5 rounded-sm text-[12px] font-medium transition-all duration-300",
                        activeTab === 'files' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
                    )}
                >
                    <Folder className="size-3.5" />
                    <span>Files</span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar py-3">
                {activeTab === 'projects' && (
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
                                    onAddWorkspace={(id) => console.log('Add WS to', id)}
                                    onSetColor={handleSetColor}
                                    onDelete={handleDeleteProject}
                                />
                            ))}
                        </SortableContext>

                        {/* Professional Drag Overlay */}
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
                                    onSetColor={() => { }}
                                    onDelete={() => { }}
                                />
                            ) : activeId && projects.some(p => p.workspaces.some(w => w.id === activeId)) ? (
                                <WorkspaceContent
                                    workspace={projects.flatMap(p => p.workspaces).find(w => w.id === activeId)!}
                                    isDragging={true}
                                />
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                )}

                {activeTab === 'files' && (
                    <div className="px-4 py-8 text-center">
                        <Folder className="size-8 mx-auto text-zinc-700 mb-2 opacity-50" />
                        <p className="text-zinc-500 text-xs text-pretty italic">Select a project to view files</p>
                    </div>
                )}
            </div>

            {/* Add Button */}
            {activeTab === 'projects' && (
                <div className="p-3 border-t border-white/5">
                    <button
                        onClick={handleAddProject}
                        className="w-full flex items-center justify-center space-x-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[13px] py-2 rounded-md border border-white/5 transition-all duration-200 shadow-lg"
                    >
                        <Plus className="size-4" />
                        <span className="font-medium">Add Project</span>
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={onFileChange}
                        // @ts-ignore
                        webkitdirectory=""
                        directory=""
                    />
                </div>
            )}
        </aside>
    );
};

export default LeftSidebar;