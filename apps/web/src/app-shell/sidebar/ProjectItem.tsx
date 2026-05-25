"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@workspace/ui";
import {
  Ellipsis,
  Plus,
  X,
  Trash2,
  Palette,
  Zap,
  Popover,
  PopoverTrigger,
  PopoverContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  cn,
  MapPinned,
  FileCode,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  SortableContext,
  verticalListSortingStrategy,
  toastManager,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
} from "@workspace/ui";
import type { Project, WorkspaceLabel, WorkspacePriority } from "@/shared/types/domain";
import { PROJECT_COLOR_PRESETS } from "@/shared/types/domain";
import { useTheme } from "next-themes";
import { SketchPicker } from "react-color";
import { ImageIcon } from "lucide-react";
import { WorkspaceItem } from "./WorkspaceItem";
import { AGENT_STATE, useAgentHooksStore } from "@/features/agent/store/agent-hooks-store";
import { AgentHookStatusIndicator } from "@/features/agent/components/AgentHookStatusIndicator";
import type { WorkspaceWorkflowStatus } from "@/shared/types/domain";
import { FileBrowser } from "@/features/files/components/FileBrowser";
import { getRuntimeApiConfig, httpBase } from "@/shared/lib/desktop-runtime";

export interface ProjectItemProps {
  project: Project;
  isExpanded: boolean;
  hideWorkspaceList?: boolean;
  disableRowClick?: boolean;
  isDragging?: boolean;
  isPlaceholder?: boolean;
  isAnyProjectDragging?: boolean;
  attributes?: DraggableAttributes;
  listeners?: DraggableSyntheticListeners;
  onToggle: (id: string) => void;
  onProjectRowClick?: (projectId: string) => void;
  onAddWorkspace: (projectId: string) => void;
  onQuickAddWorkspace: (projectId: string) => void;
  onSetColor: (projectId: string, color?: string) => void;
  onSetLogo: (projectId: string, logoPath: string | null) => void;
  onDelete: (projectId: string) => void;
  onPinWorkspace: (projectId: string, workspaceId: string) => void;
  onUnpinWorkspace: (projectId: string, workspaceId: string) => void;
  onArchiveWorkspace: (projectId: string, workspaceId: string) => void;
  onDeleteWorkspace: (projectId: string, workspaceId: string) => void;
  onUpdateWorkspaceName: (projectId: string, workspaceId: string, name: string) => Promise<void>;
  onUpdateWorkspaceWorkflowStatus: (
    projectId: string,
    workspaceId: string,
    workflowStatus: WorkspaceWorkflowStatus,
  ) => void;
  onUpdateWorkspacePriority: (
    projectId: string,
    workspaceId: string,
    priority: WorkspacePriority,
  ) => void;
  availableLabels: WorkspaceLabel[];
  onCreateWorkspaceLabel: (data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateWorkspaceLabel: (
    labelId: string,
    data: { name: string; color: string },
  ) => Promise<WorkspaceLabel>;
  onUpdateWorkspaceLabels: (
    projectId: string,
    workspaceId: string,
    labels: WorkspaceLabel[],
  ) => Promise<void>;
  onConfigureScripts: (projectId: string) => void;
  onSelectMain: (projectId: string) => void;
  isActiveProject: boolean;
  isSelected?: boolean;
}

const parseColorToRgb = (colorStr: string | undefined): { r: number; g: number; b: number; a: number } => {
  if (!colorStr) return { r: 239, g: 68, b: 68, a: 1 };
  const rgbaMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1]),
      g: parseInt(rgbaMatch[2]),
      b: parseInt(rgbaMatch[3]),
      a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1,
    };
  }
  const hex = colorStr.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  return { r, g, b, a: 1 };
};

const getVerticalLineStyle = (colorStr: string): React.CSSProperties => {
  const rgb = parseColorToRgb(colorStr);
  return {
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(rgb.a * 0.25, 0.25)})`,
  };
};

const PROJECT_MENU_CLOSE_DELAY_MS = 120;
const PROJECT_LOGO_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "avif",
  "bmp",
  "ico",
  "tiff",
  "tif",
]);

function isSupportedProjectLogoPath(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase();
  return !!extension && PROJECT_LOGO_EXTENSIONS.has(extension);
}

function isRemoteLogoSource(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export const ProjectItem = React.memo<ProjectItemProps>(function ProjectItem({
  project,
  isExpanded,
  hideWorkspaceList = false,
  disableRowClick = false,
  isDragging,
  isPlaceholder,
  isAnyProjectDragging,
  attributes,
  listeners,
  onToggle,
  onProjectRowClick,
  onAddWorkspace,
  onQuickAddWorkspace,
  onSetColor,
  onSetLogo,
  onDelete,
  onPinWorkspace,
  onUnpinWorkspace,
  onArchiveWorkspace,
  onDeleteWorkspace,
  onUpdateWorkspaceName,
  onUpdateWorkspaceWorkflowStatus,
  onUpdateWorkspacePriority,
  availableLabels,
  onCreateWorkspaceLabel,
  onUpdateWorkspaceLabel,
  onUpdateWorkspaceLabels,
  onConfigureScripts,
  onSelectMain,
  isActiveProject,
  isSelected = false,
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const initialLetter = project.name.charAt(0).toUpperCase();

  const projectAgentState = useAgentHooksStore((s) =>
    s.getAgentStateForContextId(project.id)
  );
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showLogoDialog, setShowLogoDialog] = useState(false);
  const [showLogoBrowser, setShowLogoBrowser] = useState(false);
  const [logoInput, setLogoInput] = useState("");
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const projectMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [hasLogoLoadError, setHasLogoLoadError] = useState(false);
  const [customColor, setCustomColor] = useState<{ r: number; g: number; b: number; a: number }>({
    r: 239, g: 68, b: 68, a: 1,
  });

  const cancelProjectMenuClose = useCallback(() => {
    if (projectMenuTimerRef.current) {
      clearTimeout(projectMenuTimerRef.current);
      projectMenuTimerRef.current = null;
    }
  }, []);

  const openProjectMenu = useCallback(() => {
    cancelProjectMenuClose();
    setIsProjectMenuOpen(true);
  }, [cancelProjectMenuClose]);

  const scheduleProjectMenuClose = useCallback(() => {
    cancelProjectMenuClose();
    projectMenuTimerRef.current = setTimeout(() => {
      const hoveringTrigger = !!triggerRef.current?.matches(":hover");
      const hoveringMenu = !!menuRef.current?.matches(":hover");
      if (!hoveringTrigger && !hoveringMenu) {
        setIsProjectMenuOpen(false);
      }
      projectMenuTimerRef.current = null;
    }, PROJECT_MENU_CLOSE_DELAY_MS);
  }, [cancelProjectMenuClose]);

  useEffect(() => {
    if (project.borderColor) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomColor(parseColorToRgb(project.borderColor));
    }
  }, [project.borderColor]);

  useEffect(() => {
    let cancelled = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasLogoLoadError(false);
    if (!project.logoPath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLogoUrl(null);
      return () => {
        cancelled = true;
      };
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLogoUrl(null);

    // If it's a remote URL, use it directly
    if (isRemoteLogoSource(project.logoPath)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLogoUrl(project.logoPath);
      return () => {
        cancelled = true;
      };
    }

    // For local file paths, use the local file endpoint
    void getRuntimeApiConfig()
      .then((config) => {
        if (cancelled) {
          return;
        }
        const params = new URLSearchParams({ path: project.logoPath! });
        if (config.token) {
          params.set("token", config.token);
        }
        setLogoUrl(`${httpBase(config)}/api/system/file?${params.toString()}`);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setLogoUrl(null);
        setHasLogoLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [project.logoPath]);

  useEffect(() => {
    return () => {
      cancelProjectMenuClose();
    };
  }, [cancelProjectMenuClose]);

  const handleOpenLogoDialog = useCallback(() => {
    setLogoInput(project.logoPath ?? "");
    setShowLogoDialog(true);
  }, [project.logoPath]);

  const handleSaveLogo = useCallback(() => {
    const value = logoInput.trim();
    if (!value) {
      toastManager.add({
        title: "Logo is required",
        description: "Choose a local image file or enter a remote URL.",
        type: "error",
      });
      return;
    }

    if (!isRemoteLogoSource(value) && !isSupportedProjectLogoPath(value)) {
      toastManager.add({
        title: "Unsupported logo file",
        description: "Please choose an image file such as PNG, JPG, SVG, or WebP.",
        type: "error",
      });
      return;
    }

    onSetLogo(project.id, value);
    setShowLogoDialog(false);
    setShowLogoBrowser(false);
  }, [logoInput, onSetLogo, project.id]);

  return (
    <div
      className={cn(
        "group/project mb-1 transition-all duration-200",
        isPlaceholder ? "opacity-20" : "opacity-100",
        isDragging && "z-50"
      )}
    >
      <div
        className={cn(
            "flex items-center px-2 py-1.5 hover:bg-sidebar-accent/50 rounded-sm mx-2 transition-all duration-300 relative",
            isDragging && "bg-sidebar-accent shadow-2xl scale-[1.02]",
            (isActiveProject || isSelected) && "bg-sidebar-accent/70"
          )}
      >
        <div
          {...attributes}
          {...listeners}
          className={cn(
            "flex items-center flex-1 min-w-0 select-none pr-8",
            disableRowClick ? "cursor-default" : "cursor-pointer",
          )}
          onClick={() => {
            if (disableRowClick) {
              return;
            }
            if (onProjectRowClick) {
              onProjectRowClick(project.id);
              return;
            }
            onToggle(project.id);
          }}
        >
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            <div
              className="size-6 flex items-center justify-center bg-sidebar rounded-md border border-sidebar-border text-[10px] font-bold text-muted-foreground shrink-0 transition-colors hover:bg-sidebar-accent relative"
              style={{ borderLeft: project.borderColor ? `2px solid ${project.borderColor}` : undefined }}
            >
              {logoUrl && !hasLogoLoadError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="size-full rounded-[inherit] object-cover group-hover/project:hidden"
                  onError={() => setHasLogoLoadError(true)}
                />
              ) : (
                <span className="group-hover/project:hidden transition-all duration-200">{initialLetter}</span>
              )}
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
            {projectAgentState !== AGENT_STATE.IDLE && (
              <AgentHookStatusIndicator
                state={projectAgentState}
                variant="compact"
                className="shrink-0"
              />
            )}
          </div>
        </div>

            {!isDragging && (
          <div
            className={cn(
              "absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center justify-end",
            )}
          >
            <div
              className={cn(
                "flex items-center overflow-hidden pl-2 transition-all duration-200 ease-out",
                isProjectMenuOpen
                  ? "ml-1 max-w-24 opacity-100"
                  : "max-w-0 opacity-0 group-hover/project:ml-1 group-hover/project:max-w-24 group-hover/project:opacity-100",
              )}
            >
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

              <DropdownMenu
                open={isProjectMenuOpen}
                modal={false}
                onOpenChange={(open) => {
                  if (open) {
                    cancelProjectMenuClose();
                  }
                  setIsProjectMenuOpen(open);
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    ref={triggerRef}
                    className="p-1 hover:bg-sidebar-accent rounded-sm transition-all duration-200 hover:cursor-pointer"
                    onMouseEnter={openProjectMenu}
                    onMouseLeave={scheduleProjectMenuClose}
                  >
                    <Ellipsis className="size-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  ref={menuRef}
                  side="right"
                  align="start"
                  alignOffset={6}
                  sideOffset={8}
                  avoidCollisions={false}
                  className="w-56"
                  onMouseEnter={cancelProjectMenuClose}
                  onMouseLeave={scheduleProjectMenuClose}
                  onCloseAutoFocus={(e) => e.preventDefault()}
                >
                  <DropdownMenuItem onClick={() => onAddWorkspace(project.id)} className="cursor-pointer">
                    <Plus className="size-4 mr-2" />
                    <span>New Workspace</span>
                  </DropdownMenuItem>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer">
                      <Palette className="size-4 mr-2" />
                      <span>Set Color</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-[195px] p-3">
                      <div className="grid grid-cols-6 gap-1 mb-1">
                        {PROJECT_COLOR_PRESETS.filter(p => p.color).map((preset) => (
                          <button
                            key={preset.name}
                            onClick={() => onSetColor(project.id, preset.color)}
                            className="size-6 rounded hover:scale-110 transition-transform border border-sidebar-border/50 cursor-pointer"
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

                      <div className="flex items-center gap-1 pt-2">
                        <Popover open={showColorPicker} onOpenChange={setShowColorPicker}>
                          <PopoverTrigger asChild>
                            <button
                              className="flex items-center gap-2 px-1 text-xs hover:bg-sidebar-accent rounded transition-colors border border-sidebar-border hover:cursor-pointer w-full"
                              title="Custom Color"
                            >
                              <Palette className="size-4 shrink-0" />
                              <span className="font-medium whitespace-nowrap">Custom Color</span>
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
                                  saturation: { borderRadius: '8px' },
                                  activeColor: { borderRadius: '4px' },
                                  hue: { height: '10px', borderRadius: '4px' },
                                  alpha: { height: '10px', borderRadius: '4px' },
                                }
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem
                    onClick={handleOpenLogoDialog}
                    className="cursor-pointer"
                  >
                    <ImageIcon className="size-4 mr-2" />
                    <span>Set Logo</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onConfigureScripts(project.id)} className="cursor-pointer">
                    <FileCode className="size-4 mr-2" />
                    <span>Workspace Scripts</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
                    onClick={() => onDelete(project.id)}
                  >
                    <Trash2 className="size-4 mr-2" />
                    <span>Delete Project</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </div>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          hideWorkspaceList
            ? "grid-rows-[0fr]"
            : isExpanded && !isDragging && !isAnyProjectDragging
              ? "grid-rows-[1fr]"
              : "grid-rows-[0fr]"
        )}
      >
        <div className={cn(
          "overflow-hidden relative transition-opacity duration-300",
          isAnyProjectDragging ? "opacity-0 invisible" : "opacity-100 visible"
        )}>
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
            <SortableContext items={project.workspaces.filter(w => !w.isPinned).map(w => w.id)} strategy={verticalListSortingStrategy}>
              {project.workspaces.filter(w => !w.isPinned).map((ws) => (
                <WorkspaceItem
                  key={ws.id}
                  workspace={ws}
                  projectId={project.id}
                  projectName={project.name}
                  projectPath={project.mainFilePath}
                  onPin={(wsId) => onPinWorkspace(project.id, wsId)}
                  onUnpin={(wsId) => onUnpinWorkspace(project.id, wsId)}
                  onArchive={(wsId) => onArchiveWorkspace(project.id, wsId)}
                  onDelete={(wsId) => onDeleteWorkspace(project.id, wsId)}
                  onUpdateName={(wsId, name) => onUpdateWorkspaceName(project.id, wsId, name)}
                  onUpdateWorkflowStatus={(wsId, workflowStatus) =>
                    onUpdateWorkspaceWorkflowStatus(project.id, wsId, workflowStatus)
                  }
                  onUpdatePriority={(wsId, priority) =>
                    onUpdateWorkspacePriority(project.id, wsId, priority)
                  }
                  availableLabels={availableLabels}
                  onCreateLabel={onCreateWorkspaceLabel}
                  onUpdateLabel={onUpdateWorkspaceLabel}
                  onUpdateLabels={(wsId, labels) =>
                    onUpdateWorkspaceLabels(project.id, wsId, labels)
                  }
                  suppressInfoPopover={isProjectMenuOpen}
                />
              ))}
            </SortableContext>
            {project.workspaces.length === 0 && (
              <div className="py-2 text-[12px] text-muted-foreground italic ml-4">No workspaces</div>
            )}
          </div>
        </div>
      </div>
      <Dialog
        open={showLogoDialog}
        onOpenChange={(open) => {
          setShowLogoDialog(open);
          if (!open) {
            setShowLogoBrowser(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Set Logo</DialogTitle>
            <DialogDescription>
              Choose a local image file or paste a remote image URL. The app only distinguishes between local and remote sources.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor={`project-logo-source-${project.id}`}>Logo Source</Label>
              <Input
                id={`project-logo-source-${project.id}`}
                value={logoInput}
                onChange={(e) => setLogoInput(e.target.value)}
                placeholder="https://example.com/logo.png or /path/to/logo.png"
              />
              <p className="text-xs text-muted-foreground">
                Detected as {logoInput.trim() ? (isRemoteLogoSource(logoInput.trim()) ? "remote URL" : "local file path") : "unknown"}.
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Local file</p>
                <p className="text-xs text-muted-foreground">
                  Pick any local image file and save its absolute path.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer shrink-0"
                onClick={() => setShowLogoBrowser(true)}
              >
                Browse...
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="cursor-pointer mr-auto text-muted-foreground hover:text-foreground"
              onClick={() => {
                onSetLogo(project.id, null);
                setShowLogoDialog(false);
                setShowLogoBrowser(false);
                setLogoInput("");
              }}
            >
              Remove Logo
            </Button>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={() => {
                setShowLogoDialog(false);
                setShowLogoBrowser(false);
              }}
            >
              Cancel
            </Button>
            <Button type="button" className="cursor-pointer" onClick={handleSaveLogo}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FileBrowser
        open={showLogoBrowser}
        onOpenChange={setShowLogoBrowser}
        onSelect={(path) => {
          if (!isSupportedProjectLogoPath(path)) {
            toastManager.add({
              title: "Unsupported logo file",
              description: "Please choose an image file such as PNG, JPG, SVG, or WebP.",
              type: "error",
            });
            return;
          }
          setLogoInput(path);
        }}
        title="Select Logo Image"
        selectLabel="Use File"
        dirsOnly={false}
      />
    </div>
  );
});
