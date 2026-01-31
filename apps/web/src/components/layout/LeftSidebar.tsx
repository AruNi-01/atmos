"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Ellipsis,
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
    Popover,
    PopoverTrigger,
    PopoverContent,
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
    TabsPanel,
    RefreshCw,
    AlertTriangle,
    Eye,
    EyeOff,
    FileCode,
    MapPinned,
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider
} from "@workspace/ui";
import { Project, Workspace, PROJECT_COLOR_PRESETS } from '@/types/types';
import { useProjectStore } from '@/hooks/use-project-store';
import { CreateWorkspaceDialog } from '@/components/dialogs/CreateWorkspaceDialog';
import { CreateProjectDialog } from '@/components/dialogs/CreateProjectDialog';
import { WorkspaceScriptDialog } from '@/components/dialogs/WorkspaceScriptDialog';
import { formatRelativeTime } from '@atmos/shared';
import { getWorkspaceShortName } from '@/utils/format-time';
import { FileTree } from '@/components/files/FileTree';
import { fsApi, FileTreeNode, gitApi } from '@/api/ws-api';
import { useEditorStore } from '@/hooks/use-editor-store';
import { useGitStatusCheck, useGitInfoStore } from '@/hooks/use-git-info-store';
import { useDialogStore } from '@/hooks/use-dialog-store';
import { useTheme } from 'next-themes';
import { SketchPicker } from 'react-color';

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
    onConfigureScripts: (projectId: string) => void;
    onSelectMain: (projectId: string) => void;
    isActiveProject: boolean;
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
    onConfigureScripts,
    onSelectMain,
    isActiveProject,
}) => {
        const { theme } = useTheme();
        const isDark = theme === 'dark';
        const initialLetter = project.name.charAt(0).toUpperCase();
        const [showColorPicker, setShowColorPicker] = useState(false);
        const [customColor, setCustomColor] = useState<{ r: number; g: number; b: number; a: number }>({
            r: 239, g: 68, b: 68, a: 1,
        });

        // Parse color string to rgb object
        const parseColorToRgb = (colorStr: string | undefined): { r: number; g: number; b: number; a: number } => {
            if (!colorStr) return { r: 239, g: 68, b: 68, a: 1 };

            // Handle rgba format
            const rgbaMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (rgbaMatch) {
                return {
                    r: parseInt(rgbaMatch[1]),
                    g: parseInt(rgbaMatch[2]),
                    b: parseInt(rgbaMatch[3]),
                    a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1,
                };
            }

            // Handle hex format
            const hex = colorStr.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            return { r, g, b, a: 1 };
        };

        // Convert color to rgba with reduced opacity for vertical line
        const getVerticalLineStyle = (colorStr: string): React.CSSProperties => {
            const rgb = parseColorToRgb(colorStr);
            return {
                backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(rgb.a * 0.25, 0.25)})`,
            };
        };

        // Sync customColor when project.borderColor changes
        useEffect(() => {
            if (project.borderColor) {
                setCustomColor(parseColorToRgb(project.borderColor));
            }
        }, [project.borderColor]);

        return (
            <div
                className={cn(
                    "group/project mb-1 transition-all duration-200",
                    isPlaceholder ? "opacity-20" : "opacity-100",
                    isDragging && "z-50"
                )}
            >
                <div className={cn(
                    "flex items-center justify-between px-2 py-1.5 hover:bg-sidebar-accent/50 rounded-sm mx-2 transition-all duration-300",
                    isDragging && "bg-sidebar-accent shadow-2xl scale-[1.02]",
                    isActiveProject && "bg-sidebar-accent/70"
                )}>
                    <div
                        {...attributes}
                        {...listeners}
                        className="flex items-center flex-1 min-w-0 cursor-pointer select-none"
                        onClick={() => onToggle(project.id)}
                    >
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                            <div
                                className="size-6 flex items-center justify-center bg-sidebar-accent rounded-md border border-sidebar-border text-[10px] font-bold text-muted-foreground shrink-0 transition-colors group-hover/project:bg-sidebar-accent/80 relative"
                                style={{ borderLeft: project.borderColor ? `2px solid ${project.borderColor}` : undefined }}
                            >
                                <span className="group-hover/project:hidden transition-all duration-200">{initialLetter}</span>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSelectMain(project.id);
                                                }}
                                                className="hidden group-hover/project:flex items-center justify-center size-full absolute inset-0 text-muted-foreground hover:text-foreground transition-colors hover:cursor-pointer"
                                            >
                                                <MapPinned className="size-3.5" />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="right">
                                            Building on main/master directory, not workspace/worktree
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <span className="text-[13px] font-medium truncate text-sidebar-foreground group-hover/project:text-sidebar-foreground transition-colors">
                                {project.name}
                            </span>
                        </div>
                    </div>

                    {!isDragging && (
                        <div className="flex items-center opacity-0 group-hover/project:opacity-100 transition-opacity">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onQuickAddWorkspace(project.id);
                                            }}
                                            className="p-1 hover:bg-sidebar-accent rounded-sm transition-all duration-200 hover:cursor-pointer"
                                        >
                                            <Zap className="size-3.5 text-muted-foreground" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                        Quick New Workspace
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="p-1 hover:bg-sidebar-accent rounded-sm transition-all duration-200 hover:cursor-pointer">
                                        <Ellipsis className="size-3.5 text-muted-foreground" />
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
                                        <DropdownMenuSubContent className="w-[195px] p-3">
                                            {/* Row 1: Preset Colors */}
                                            <div className="grid grid-cols-6 gap-1 mb-1">
                                                {PROJECT_COLOR_PRESETS.filter(p => p.color).map((preset) => (
                                                    <button
                                                        key={preset.name}
                                                        onClick={() => onSetColor(project.id, preset.color)}
                                                        className="size-6 rounded hover:scale-110 transition-transform border border-sidebar-border/50"
                                                        style={{ backgroundColor: preset.color }}
                                                        title={preset.name}
                                                    />
                                                ))}
                                                <button
                                                    onClick={() => onSetColor(project.id, undefined)}
                                                    className="size-6 rounded hover:cursor-pointer hover:bg-sidebar-accent transition-colors border border-sidebar-border/50 flex items-center justify-center"
                                                    title="None"
                                                >
                                                    <X className="size-4 text-muted-foreground" />
                                                </button>
                                            </div>

                                            {/* Row 2: Custom Color button on the right */}
                                            <div className="flex items-center gap-1 pt-2">
                                                <Popover open={showColorPicker} onOpenChange={setShowColorPicker}>
                                                    <PopoverTrigger asChild>
                                                        <button
                                                            className="flex items-center gap-2 px-1 text-xs hover:bg-sidebar-accent rounded transition-colors border border-sidebar-border hover:cursor-pointer w-full"
                                                            title="Custom Color"
                                                        >
                                                            <Palette className="size-4 shrink-0" />
                                                            <span className="font- whitespace-nowrap">Custom Color</span>
                                                            <div
                                                                className="size-6 m-[2px] rounded-sm shrink-0 ml-auto"
                                                                style={{
                                                                    backgroundColor: `rgba(${customColor.r}, ${customColor.g}, ${customColor.b}, ${customColor.a})`,
                                                                    boxShadow: '0 0 0 1px rgba(0,0,0,0.1)',
                                                                }}
                                                            />
                                                        </button>
                                                    </PopoverTrigger>
                                                    <PopoverContent
                                                        side="right"
                                                        align="start"
                                                        sideOffset={8}
                                                        className="z-50 p-0 border-0 bg-transparent shadow-none"
                                                    >
                                                        <SketchPicker
                                                            color={customColor}
                                                            onChange={(color) => {
                                                                setCustomColor({
                                                                    r: color.rgb.r,
                                                                    g: color.rgb.g,
                                                                    b: color.rgb.b,
                                                                    a: color.rgb.a ?? 1,
                                                                });
                                                            }}
                                                            onChangeComplete={(color) => {
                                                                const rgb = color.rgb;
                                                                const rgbaColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${rgb.a ?? 1})`;
                                                                onSetColor(project.id, rgbaColor);
                                                            }}
                                                            styles={{
                                                                default: {
                                                                    picker: {
                                                                        background: isDark ? '#1c1c1f' : '#fff',
                                                                        borderRadius: '12px',
                                                                        boxShadow: 'none',
                                                                        border: isDark ? '1px solid #27272a' : '1px solid #e4e4e7',
                                                                        padding: '12px',
                                                                        width: '220px',
                                                                    },
                                                                    saturation: {
                                                                        borderRadius: '8px',
                                                                    },
                                                                    activeColor: {
                                                                        borderRadius: '4px',
                                                                    },
                                                                    hue: {
                                                                        height: '10px',
                                                                        borderRadius: '4px',
                                                                    },
                                                                    alpha: {
                                                                        height: '10px',
                                                                        borderRadius: '4px',
                                                                    },
                                                                }
                                                            }}
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => onConfigureScripts(project.id)}>
                                        <FileCode className="size-4 mr-2" />
                                        <span>Workspace Scripts</span>
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

                <div
                    className={cn(
                        "grid transition-[grid-template-rows] duration-300 ease-out",
                        isExpanded && !isDragging && !isAnyProjectDragging ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    )}
                >
                    <div className={cn(
                        "overflow-hidden relative transition-opacity duration-300",
                        isAnyProjectDragging ? "opacity-0 invisible" : "opacity-100 visible"
                    )}>
                        {/* Connecting Vertical Line */}
                        <div
                            className="absolute left-6 top-0 bottom-4 w-px bg-sidebar-border/60"
                            style={project.borderColor ? getVerticalLineStyle(project.borderColor) : undefined}
                        />

                        <div
                            className={cn(
                                "ml-8 mt-1 space-y-0.5 pr-2 transition-all duration-300",
                                isAnyProjectDragging ? "pointer-events-none opacity-0" : "opacity-100"
                            )}
                        >
                            <SortableContext items={project.workspaces.map(w => w.id)} strategy={verticalListSortingStrategy}>
                                {project.workspaces.map((ws) => (
                                    <WorkspaceItem
                                        key={ws.id}
                                        workspace={ws}
                                        projectId={project.id}
                                        projectPath={project.mainFilePath}
                                        onPin={(wsId) => onPinWorkspace(project.id, wsId)}
                                        onUnpin={(wsId) => onUnpinWorkspace(project.id, wsId)}
                                        onArchive={(wsId) => onArchiveWorkspace(project.id, wsId)}
                                        onDelete={(wsId) => onDeleteWorkspace(project.id, wsId)}
                                    />
                                ))}
                            </SortableContext>
                            {project.workspaces.length === 0 && (
                                <div className="py-2 text-[12px] text-muted-foreground italic ml-4">No workspaces</div>
                            )}
                        </div>
                    </div>
                </div>
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
    onConfigureScripts: (projectId: string) => void;
    onSelectMain: (projectId: string) => void;
    isActiveProject: boolean;
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
    projectPath?: string;
    isDragging?: boolean;
    isPlaceholder?: boolean;
    attributes?: any;
    listeners?: any;
    onPin?: (workspaceId: string) => void;
    onUnpin?: (workspaceId: string) => void;
    onArchive?: (workspaceId: string) => void;
    onDelete?: (workspaceId: string) => void;
}> = ({ workspace, projectId, projectPath, isDragging, isPlaceholder, attributes, listeners, onPin, onUnpin, onArchive, onDelete }) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isActive = searchParams.get('workspaceId') === workspace.id;
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showGitWarningDialog, setShowGitWarningDialog] = useState(false);
    const [gitWarningMessage, setGitWarningMessage] = useState('');
    const [pendingOperation, setPendingOperation] = useState<'archive' | 'delete' | null>(null);
    const [isCheckingGit, setIsCheckingGit] = useState(false);

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

    const checkGitStatusAndProceed = async (operation: 'archive' | 'delete') => {
        if (!projectPath) {
            // No project path, proceed without check
            if (operation === 'archive') {
                onArchive?.(workspace.id);
            } else {
                setShowDeleteDialog(true);
            }
            return;
        }

        setIsCheckingGit(true);
        try {
            const status = await gitApi.getStatus(projectPath);

            if (status.has_uncommitted_changes || status.has_unpushed_commits) {
                const issues: string[] = [];
                if (status.has_uncommitted_changes) {
                    issues.push(`${status.uncommitted_count} uncommitted change(s)`);
                }
                if (status.has_unpushed_commits) {
                    issues.push(`${status.unpushed_count} unpushed commit(s)`);
                }
                setGitWarningMessage(issues.join(' and '));
                setPendingOperation(operation);
                setShowGitWarningDialog(true);
            } else {
                // Clean, proceed
                if (operation === 'archive') {
                    onArchive?.(workspace.id);
                } else {
                    setShowDeleteDialog(true);
                }
            }
        } catch (error) {
            console.error('Failed to check git status:', error);
            // Proceed with warning
            if (operation === 'archive') {
                onArchive?.(workspace.id);
            } else {
                setShowDeleteDialog(true);
            }
        } finally {
            setIsCheckingGit(false);
        }
    };

    const handleArchiveClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await checkGitStatusAndProceed('archive');
    };

    const handleDeleteClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await checkGitStatusAndProceed('delete');
    };

    const handleForceOperation = () => {
        setShowGitWarningDialog(false);
        if (pendingOperation === 'archive') {
            onArchive?.(workspace.id);
        } else if (pendingOperation === 'delete') {
            setShowDeleteDialog(true);
        }
        setPendingOperation(null);
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
                            disabled={isCheckingGit}
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

            {/* Git Warning Dialog */}
            <Dialog open={showGitWarningDialog} onOpenChange={setShowGitWarningDialog}>
                <DialogContent showCloseButton={false}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="size-5 text-amber-500" />
                            Uncommitted Changes Detected
                        </DialogTitle>
                        <DialogDescription>
                            This workspace has {gitWarningMessage}. These changes will be lost if you {pendingOperation} this workspace.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowGitWarningDialog(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleForceOperation}>
                            {pendingOperation === 'archive' ? 'Archive Anyway' : 'Continue to Delete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
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
    projectPath?: string;
    onPin: (workspaceId: string) => void;
    onUnpin: (workspaceId: string) => void;
    onArchive: (workspaceId: string) => void;
    onDelete: (workspaceId: string) => void;
}> = ({ workspace, projectId, projectPath, onPin, onUnpin, onArchive, onDelete }) => {
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
                projectPath={projectPath}
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
    const searchParams = useSearchParams();
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
    } = useProjectStore();

    const { setCurrentProjectPath } = useEditorStore();
    const { setCurrentContext } = useGitInfoStore();

    const [activeTab, setActiveTab] = useState<'projects' | 'files'>('projects');
    const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);

    // File tree state
    const [fileTreeData, setFileTreeData] = useState<FileTreeNode[]>([]);
    const [fileTreeProjectId, setFileTreeProjectId] = useState<string | null>(null);
    const [fileTreeWorkspaceId, setFileTreeWorkspaceId] = useState<string | null>(null);
    const [fileTreeShowHidden, setFileTreeShowHidden] = useState(false);

    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    const [showHiddenFiles, setShowHiddenFiles] = useState(false);

    // Track the latest fetch request to prevent race conditions
    const fetchRequestId = useRef(0);

    // Dialog states from global store
    const {
        isCreateProjectOpen,
        setCreateProjectOpen,
        isCreateWorkspaceOpen,
        setCreateWorkspaceOpen,
        selectedProjectId,
        setSelectedProjectId
    } = useDialogStore();

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

    const [scriptDialogProjectId, setScriptDialogProjectId] = useState<string | null>(null);

    const currentWorkspaceId = searchParams.get('workspaceId');
    const currentProjectIdFromUrl = searchParams.get('projectId');
    // Find current project based on workspaceId OR projectId
    const currentProject = projects.find(p =>
        (currentWorkspaceId && p.workspaces.some(w => w.id === currentWorkspaceId)) ||
        (!currentWorkspaceId && currentProjectIdFromUrl === p.id)
    );
    const currentProjectId = currentProject?.id ?? null;
    const currentWorkspace = currentProject?.workspaces.find(w => w.id === currentWorkspaceId);
    const currentEffectivePath = currentWorkspace?.localPath ?? currentProject?.mainFilePath ?? null;
    const isSettingUp = currentWorkspaceId ? setupProgress[currentWorkspaceId]?.status !== 'completed' && !!setupProgress[currentWorkspaceId] : false;

    // Sync git info context
    useEffect(() => {
        if (currentProjectId && currentEffectivePath) {
            // If we have a workspace, it MUST NOT be setting up to sync context
            // If we are in main dev mode (no workspaceId), we can sync immediately
            if (currentWorkspaceId) {
                if (isSettingUp) {
                    setCurrentContext(null, null, null);
                } else {
                    setCurrentContext(currentProjectId, currentWorkspaceId, currentEffectivePath);
                }
            } else {
                // Main dev mode
                setCurrentContext(currentProjectId, null, currentEffectivePath);
            }
        }
    }, [currentProjectId, currentWorkspaceId, currentEffectivePath, isSettingUp, setCurrentContext]);

    // Fetch file tree from backend
    const doFetchFileTree = useCallback(async (projectId: string, workspaceId: string | null, effectivePath: string, showHidden: boolean = false) => {
        if (!effectivePath) return;

        // Increment request ID to invalidate any previous pending requests
        const currentRequestId = ++fetchRequestId.current;

        setIsLoadingFiles(true);
        // Clear data start of new fetch to avoid mixing context
        setFileTreeData([]);

        console.log(`[Req #${currentRequestId}] Fetching files for Project: ${projectId}, Workspace: ${workspaceId}, Path: ${effectivePath}`);

        try {
            const response = await fsApi.listProjectFiles(effectivePath, { showHidden });

            // CRITICAL: Only update state if this is still the latest request
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

    // Keep file tree in sync
    useEffect(() => {
        if (activeTab === 'files' && currentProjectId && currentEffectivePath) {
            // If we have a workspace, it must not be setting up
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

    // Handle tab change
    const handleTabChange = (value: string) => {
        setActiveTab(value as 'projects' | 'files');
    };

    // Refresh file tree
    const handleRefreshFiles = () => {
        if (currentProjectId && currentEffectivePath) {
            doFetchFileTree(currentProjectId, currentWorkspaceId, currentEffectivePath, showHiddenFiles);
        }
    };

    const toggleHiddenFiles = () => {
        setShowHiddenFiles(prev => !prev);
    };

    // Simplified Display Logic
    const isIdsMatching = fileTreeProjectId === currentProjectId && fileTreeWorkspaceId === currentWorkspaceId;

    // Show loader if we are fetching OR if the data we have doesn't match current context
    // This covers the gap between "Project Switch" and "Fetch Start"
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
                // Reorder projects
                const newProjects = arrayMove(projects, activeProjectIndex, overProjectIndex);
                await reorderProjects(newProjects);
                return;
            }

            // Check if sorting workspaces within a project
            for (const project of projects) {
                const activeWorkspaceIndex = project.workspaces.findIndex((w) => w.id === active.id);
                const overWorkspaceIndex = project.workspaces.findIndex((w) => w.id === over.id);

                if (activeWorkspaceIndex !== -1 && overWorkspaceIndex !== -1) {
                    // Reorder workspaces within the same project
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

    const handleConfigureScripts = (projectId: string) => {
        setScriptDialogProjectId(projectId);
    };

    return (
        <>
            <aside className="w-full flex flex-col h-full select-none">
                <Tabs
                    defaultValue="projects"
                    className="flex flex-col h-full"
                    onValueChange={handleTabChange}
                >
                    {/* Tabs Header */}
                    <div className="h-10 flex items-center px-2 border-b border-sidebar-border">
                        <TabsList variant="underline" className="w-full gap-1">
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
                                        onSelectMain={(id) => router.push(`/?projectId=${id}`)}
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
                        {/* Files Header */}
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

                        {/* File Tree Content */}
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
        </>
    );
};

export default LeftSidebar;
