"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@workspace/ui";
import {
  Ellipsis,
  Plus,
  X,
  Trash2,
  Palette,
  Zap,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  ColorPicker,
  isColorEyedropperActive,
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
import type { Group, Project, WorkspaceLabel, WorkspacePriority } from "@/shared/types/domain";
import { findGroupIdForMember } from "@/app-shell/sidebar/user-groups";
import { FolderMinus, FolderPlus, ImageIcon } from "lucide-react";
import { WorkspaceItem } from "./WorkspaceItem";
import { GroupNamePopoverForm } from "@/app-shell/sidebar/GroupNamePopoverForm";
import {
  useWorkspaceListVisibleCount,
  WorkspaceListShowMoreLess,
} from "./workspace-list-pagination";
import { ProjectAgentStatusMark } from "@/features/agent/components/WorkspaceAgentStatusMark";
import {
  selectAttentionFilterMode,
  useAgentAttentionStore,
} from "@/features/agent/store/agent-attention-store";
import type { WorkspaceWorkflowStatus } from "@/shared/types/domain";
import { FileBrowser } from "@/features/files/components/FileBrowser";
import { getRuntimeApiConfig, httpBase } from "@/shared/lib/desktop-runtime";

export interface ProjectItemProps {
  project: Project;
  isExpanded: boolean;
  hideWorkspaceList?: boolean;
  disableRowClick?: boolean;
  /**
   * Disable nested workspace row sorting (e.g. By Group sidebar, where a parent
   * DndContext only reorders groups and must not register workspace droppables).
   */
  workspaceSortingDisabled?: boolean;
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
  /** Current URL workspace — for row active highlight without per-row URL hooks. */
  activeWorkspaceId?: string | null;
  /** APP-044: optional group membership controls */
  groups?: Group[];
  onAddProjectToGroup?: (projectId: string, groupId: string) => void;
  onRemoveProjectFromGroup?: (projectId: string) => void;
  onAddWorkspaceToGroup?: (workspaceId: string, groupId: string) => void;
  onRemoveWorkspaceFromGroup?: (workspaceId: string) => void;
  onSetWorkspaceGroup?: (workspaceId: string, groupId: string | null) => void;
  /**
   * Create a group by name. When it resolves to a Group (or `{ id }`), this project
   * is assigned to that group automatically.
   */
  onCreateGroup?: (name: string) => Promise<{ id: string } | void> | { id: string } | void;
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

/** One row of common presets (fits the 280px color panel without wrapping). */
const PROJECT_COLOR_SWATCHES: string[] = [
  "#6b7280", // Gray
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#22c55e", // Green
  "#3b82f6", // Blue
  "#a855f7", // Purple
];

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
  workspaceSortingDisabled = false,
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
  activeWorkspaceId = null,
  groups = [],
  onAddProjectToGroup,
  onRemoveProjectFromGroup,
  onAddWorkspaceToGroup,
  onRemoveWorkspaceFromGroup,
  onSetWorkspaceGroup,
  onCreateGroup,
}) {
  const t = useTranslations("AppShell.chrome");
  const groupsT = useTranslations("appShell.groups");
  const projectGroupId = findGroupIdForMember(groups, "project", project.id);
  const initialLetter = project.name.charAt(0).toUpperCase();

  const attentionFilterMode = useAgentAttentionStore(selectAttentionFilterMode);
  // Own project latch — used for filter-mode dimming (child latches don't dim parent).
  const projectOwnAttentionReason = useAgentAttentionStore((s) =>
    s.getContextReason(project.id),
  );
  const childrenVisible =
    !hideWorkspaceList && isExpanded && project.workspaces.length > 0;
  // In attention filter mode, parent projects that only host attention workspaces
  // stay visible for structure but are dimmed so the latched rows stand out.
  const dimAsAttentionParent =
    attentionFilterMode &&
    !projectOwnAttentionReason &&
    project.workspaces.length > 0;
  const [showLogoDialog, setShowLogoDialog] = useState(false);
  const [showLogoBrowser, setShowLogoBrowser] = useState(false);
  const [logoInput, setLogoInput] = useState("");
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);

  const unpinnedWorkspaces = project.workspaces.filter((workspace) => !workspace.isPinned);
  const {
    visibleCount,
    canShowMore,
    canShowLess,
    showMore,
    showLess,
  } = useWorkspaceListVisibleCount(unpinnedWorkspaces.length, project.id);
  const visibleUnpinnedWorkspaces = unpinnedWorkspaces.slice(0, visibleCount);
  const projectMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  /** True while the native EyeDropper is open — keep the project menu mounted. */
  const isColorEyedroppingRef = useRef(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [hasLogoLoadError, setHasLogoLoadError] = useState(false);
  const [customColor, setCustomColor] = useState(
    () => project.borderColor ?? PROJECT_COLOR_SWATCHES[1] ?? "#ef4444",
  );

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
    // Don't dismiss while the user is sampling colors outside the menu.
    if (isColorEyedroppingRef.current || isColorEyedropperActive()) return;
    cancelProjectMenuClose();
    projectMenuTimerRef.current = setTimeout(() => {
      if (isColorEyedroppingRef.current || isColorEyedropperActive()) {
        projectMenuTimerRef.current = null;
        return;
      }
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
      setCustomColor(project.borderColor);
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
        title: t("projectItem.logo.logoRequiredTitle"),
        description: t("projectItem.logo.logoRequiredDescription"),
        type: "error",
      });
      return;
    }

    if (!isRemoteLogoSource(value) && !isSupportedProjectLogoPath(value)) {
      toastManager.add({
        title: t("projectItem.logo.unsupportedLogoFileTitle"),
        description: t("projectItem.logo.unsupportedLogoFileDescription"),
        type: "error",
      });
      return;
    }

    onSetLogo(project.id, value);
    setShowLogoDialog(false);
    setShowLogoBrowser(false);
  }, [logoInput, onSetLogo, project.id, t]);

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
            dimAsAttentionParent && "opacity-45",
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
                    {t("projectItem.mainDirectoryTooltip")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <span
              className={cn(
                "text-[13px] font-medium truncate transition-colors",
                dimAsAttentionParent
                  ? "text-muted-foreground"
                  : "text-sidebar-foreground group-hover/project:text-sidebar-foreground",
              )}
            >
              {project.name}
            </span>
            <ProjectAgentStatusMark
              projectId={project.id}
              workspaceIds={project.workspaces.map((ws) => ws.id)}
              // Collapsed (or no children list): roll up workspace attention onto the project row.
              rollupAttention={!childrenVisible}
            />
          </div>
        </div>

            {!isDragging && (
          <div
            className={cn(
              "absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center justify-end",
            )}
          >
            {/*
              Match terminal mosaic toolbar action-rail motion:
              fixed open width (not max-width) + cubic-bezier expand + short opacity fade.
              Stay open while the ··· menu is open so the rail doesn't collapse under a portaled menu.
            */}
            <div
              className={cn(
                "flex items-center overflow-hidden",
                "[transition:width_0.22s_cubic-bezier(0.22,1,0.36,1),opacity_0.16s_ease]",
                isProjectMenuOpen
                  ? "w-[44px] opacity-100"
                  : "w-0 opacity-0 pointer-events-none group-hover/project:w-[44px] group-hover/project:opacity-100 group-hover/project:pointer-events-auto group-focus-within/project:w-[44px] group-focus-within/project:opacity-100 group-focus-within/project:pointer-events-auto",
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
                    {t("projectItem.quickNewWorkspace")}
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
                  // Keep the menu open while EyeDropper is active so the
                  // color panel is still there after sampling.
                  if (!open && (isColorEyedroppingRef.current || isColorEyedropperActive())) {
                    return;
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
                  onPointerDownOutside={(e) => {
                    if (isColorEyedroppingRef.current || isColorEyedropperActive()) e.preventDefault();
                  }}
                  onFocusOutside={(e) => {
                    if (isColorEyedroppingRef.current || isColorEyedropperActive()) e.preventDefault();
                  }}
                  onInteractOutside={(e) => {
                    if (isColorEyedroppingRef.current || isColorEyedropperActive()) e.preventDefault();
                  }}
                >
                  <DropdownMenuItem onClick={() => onAddWorkspace(project.id)} className="cursor-pointer">
                    <Plus className="size-4" />
                    <span>{t("managementCenter.items.newWorkspace")}</span>
                  </DropdownMenuItem>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer">
                      <Palette className="size-4" />
                      <span>{t("projectItem.setColor")}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                      className="w-auto overflow-visible border-0 bg-transparent p-0 shadow-none"
                      onPointerDownOutside={(e) => {
                        if (isColorEyedroppingRef.current || isColorEyedropperActive()) e.preventDefault();
                      }}
                      onFocusOutside={(e) => {
                        if (isColorEyedroppingRef.current || isColorEyedropperActive()) e.preventDefault();
                      }}
                      onInteractOutside={(e) => {
                        if (isColorEyedroppingRef.current || isColorEyedropperActive()) e.preventDefault();
                      }}
                    >
                      <div className="space-y-2">
                        <ColorPicker
                          value={customColor}
                          onValueChange={(value) => {
                            // Commit only — ColorPicker already defers parent
                            // updates until drag ends; store the picker string
                            // as-is to avoid hex↔rgba thrash.
                            setCustomColor(value);
                            onSetColor(project.id, value);
                          }}
                          onEyedropperOpenChange={(active) => {
                            isColorEyedroppingRef.current = active;
                            if (active) cancelProjectMenuClose();
                          }}
                          swatches={PROJECT_COLOR_SWATCHES}
                        />
                        <button
                          type="button"
                          onClick={() => onSetColor(project.id, undefined)}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-background px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title={t("projectItem.none")}
                        >
                          <X className="size-3.5" />
                          <span>{t("projectItem.none")}</span>
                        </button>
                      </div>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem
                    onClick={handleOpenLogoDialog}
                    className="cursor-pointer"
                  >
                    <ImageIcon className="size-4" />
                    <span>{t("projectItem.logo.setLogo")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onConfigureScripts(project.id)} className="cursor-pointer">
                    <FileCode className="size-4" />
                    <span>{t("projectItem.workspaceScripts")}</span>
                  </DropdownMenuItem>
                  {(onAddProjectToGroup || onRemoveProjectFromGroup || onCreateGroup) ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="cursor-pointer">
                          <FolderPlus className="size-4" />
                          <span>{projectGroupId ? groupsT("moveToGroup") : groupsT("addToGroup")}</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-max min-w-[11rem]">
                          {groups.map((group) => (
                            <DropdownMenuItem
                              key={group.id}
                              className="cursor-pointer"
                              disabled={group.id === projectGroupId}
                              onClick={() => onAddProjectToGroup?.(project.id, group.id)}
                            >
                              {group.name}
                            </DropdownMenuItem>
                          ))}
                          {onCreateGroup ? (
                            <>
                              {groups.length > 0 ? <DropdownMenuSeparator /> : null}
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="cursor-pointer">
                                  <Plus className="size-4" />
                                  <span>{groupsT("create")}</span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent
                                  className="w-56 p-2"
                                  onKeyDown={(event) => event.stopPropagation()}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <GroupNamePopoverForm
                                    mode="create"
                                    onCancel={() => setIsProjectMenuOpen(false)}
                                    onSubmit={async (name) => {
                                      const created = await onCreateGroup(name);
                                      if (created?.id && onAddProjectToGroup) {
                                        onAddProjectToGroup(project.id, created.id);
                                      }
                                      setIsProjectMenuOpen(false);
                                    }}
                                  />
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            </>
                          ) : null}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      {projectGroupId && onRemoveProjectFromGroup ? (
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => onRemoveProjectFromGroup(project.id)}
                        >
                          <FolderMinus className="size-4" />
                          <span>{groupsT("removeFromGroup")}</span>
                        </DropdownMenuItem>
                      ) : null}
                    </>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    className="cursor-pointer"
                    onClick={() => onDelete(project.id)}
                  >
                    <Trash2 className="size-4" />
                    <span>{t("projectItem.deleteProject")}</span>
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
            <SortableContext
              items={
                workspaceSortingDisabled
                  ? []
                  : visibleUnpinnedWorkspaces.map((workspace) => workspace.id)
              }
              strategy={verticalListSortingStrategy}
            >
              {visibleUnpinnedWorkspaces.map((ws) => (
                <WorkspaceItem
                  key={ws.id}
                  workspace={ws}
                  projectId={project.id}
                  projectName={project.name}
                  projectPath={project.mainFilePath}
                  isActive={activeWorkspaceId === ws.id}
                  sortingDisabled={workspaceSortingDisabled}
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
                  groups={groups}
                  onSetWorkspaceGroup={onSetWorkspaceGroup}
                  onCreateGroup={onCreateGroup}
                  onUpdateLabels={(wsId, labels) =>
                    onUpdateWorkspaceLabels(project.id, wsId, labels)
                  }
                  suppressInfoPopover={isProjectMenuOpen}
                />
              ))}
            </SortableContext>
            <WorkspaceListShowMoreLess
              canShowMore={canShowMore}
              canShowLess={canShowLess}
              onShowMore={showMore}
              onShowLess={showLess}
              className="ml-4"
            />
            {project.workspaces.length === 0 && !attentionFilterMode && (
              <div className="py-2 text-[12px] text-muted-foreground italic ml-4">{t("leftSidebarControls.noWorkspaces")}</div>
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
            <DialogTitle>{t("projectItem.logo.setLogo")}</DialogTitle>
            <DialogDescription>
              {t("projectItem.logo.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor={`project-logo-source-${project.id}`}>{t("projectItem.logo.sourceLabel")}</Label>
              <Input
                id={`project-logo-source-${project.id}`}
                value={logoInput}
                onChange={(e) => setLogoInput(e.target.value)}
                placeholder={t("projectItem.logo.sourcePlaceholder")}
              />
              <p className="text-xs text-muted-foreground">
                {t("projectItem.logo.detectedAs", {
                  source: logoInput.trim()
                    ? isRemoteLogoSource(logoInput.trim())
                      ? t("projectItem.logo.detectedSourceRemote")
                      : t("projectItem.logo.detectedSourceLocal")
                    : t("projectItem.logo.detectedSourceUnknown"),
                })}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("projectItem.logo.localFileTitle")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("projectItem.logo.localFileDescription")}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer shrink-0"
                onClick={() => setShowLogoBrowser(true)}
              >
                {t("projectItem.logo.browse")}
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
              {t("projectItem.logo.removeLogo")}
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
              {t("common.cancel")}
            </Button>
            <Button type="button" className="cursor-pointer" onClick={handleSaveLogo}>
              {t("common.save")}
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
              title: t("projectItem.logo.unsupportedLogoFileTitle"),
              description: t("projectItem.logo.unsupportedLogoFileDescription"),
              type: "error",
            });
            return;
          }
          setLogoInput(path);
        }}
        title={t("projectItem.logo.selectLogoImage")}
        selectLabel={t("projectItem.logo.useFile")}
        dirsOnly={false}
      />
    </div>
  );
});
