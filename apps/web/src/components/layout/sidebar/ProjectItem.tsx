"use client";

import React, { useState, useEffect } from "react";
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
} from "@workspace/ui";
import type { Project } from "@/types/types";
import { PROJECT_COLOR_PRESETS } from "@/types/types";
import { useTheme } from "next-themes";
import { SketchPicker } from "react-color";
import { WorkspaceItem } from "./WorkspaceItem";

export interface ProjectItemProps {
  project: Project;
  isExpanded: boolean;
  isDragging?: boolean;
  isPlaceholder?: boolean;
  isAnyProjectDragging?: boolean;
  attributes?: DraggableAttributes;
  listeners?: DraggableSyntheticListeners;
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

export const ProjectItem = React.memo<ProjectItemProps>(function ProjectItem({
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
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const initialLetter = project.name.charAt(0).toUpperCase();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customColor, setCustomColor] = useState<{ r: number; g: number; b: number; a: number }>({
    r: 239, g: 68, b: 68, a: 1,
  });

  useEffect(() => {
    if (project.borderColor) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
              className="size-6 flex items-center justify-center bg-sidebar rounded-md border border-sidebar-border text-[10px] font-bold text-muted-foreground shrink-0 transition-colors hover:bg-sidebar-accent relative"
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
});
