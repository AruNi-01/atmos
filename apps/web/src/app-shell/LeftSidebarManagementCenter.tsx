"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import {
  ArrowRight,
  Bot,
  Command,
  FolderKanban,
  HardDrive,
  Layers,
  Plus,
  Presentation,
  Puzzle,
  SquareKanban,
  SquareTerminal,
  Timer,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import type { Group, Project, WorkspaceLabel } from "@/shared/types/domain";
import { WorkspaceKanbanView } from "@/app-shell/sidebar/WorkspaceKanbanView";
import type { WorkspaceKanbanFilters } from "@/app-shell/sidebar/WorkspaceKanbanFilterMenu";
import type { SidebarGroupingMode } from "@/app-shell/sidebar/workspace-status";
import type {
  ManagementCenterItemId,
  ManagementCenterItems,
  ManagementCenterPlacement,
} from "@/features/settings/store/experiment-settings-store";
import { selectManagementCenterItemsByPlacement } from "@/features/settings/store/experiment-settings-store";

type WorkspaceKanbanViewProps = React.ComponentProps<typeof WorkspaceKanbanView>;

type ManagementCenterItemDef = {
  id: ManagementCenterItemId;
  labelKey: string;
  icon: typeof FolderKanban;
  path?: string;
  kind?: "kanban" | "new-workspace" | "canvas";
};

const MANAGEMENT_CENTER_ITEM_DEFS: ManagementCenterItemDef[] = [
  { id: "workspaces", labelKey: "managementCenter.items.workspaces", icon: FolderKanban, path: "/workspaces" },
  { id: "skills", labelKey: "managementCenter.items.skills", icon: Puzzle, path: "/skills" },
  { id: "terminals", labelKey: "managementCenter.items.terminals", icon: SquareTerminal, path: "/terminals" },
  { id: "agents", labelKey: "managementCenter.items.agents", icon: Bot, path: "/agents" },
  { id: "automations", labelKey: "managementCenter.items.automations", icon: Timer, path: "/automations" },
  { id: "disk-analyzer", labelKey: "managementCenter.items.diskAnalyzer", icon: HardDrive, path: "/disk-analyzer" },
  { id: "canvas", labelKey: "managementCenter.items.canvas", icon: Presentation, kind: "canvas" },
  { id: "kanban", labelKey: "managementCenter.items.kanban", icon: SquareKanban, kind: "kanban" },
  { id: "new-workspace", labelKey: "managementCenter.items.newWorkspace", icon: Plus, kind: "new-workspace" },
];

const ITEM_DEF_BY_ID = Object.fromEntries(
  MANAGEMENT_CENTER_ITEM_DEFS.map((item) => [item.id, item]),
) as Record<ManagementCenterItemId, ManagementCenterItemDef>;

type ManagementCenterSharedProps = {
  currentView: string;
  canvasOpen: boolean;
  projects: Project[];
  availableLabels: WorkspaceLabel[];
  groups?: Group[];
  groupingMode?: SidebarGroupingMode;
  kanbanFilters: WorkspaceKanbanFilters;
  onFiltersChange: (filters: WorkspaceKanbanFilters) => void;
  onGroupingModeChange?: (mode: SidebarGroupingMode) => void;
  onNavigate: (path: string) => void;
  onOpenCanvas: () => void;
  onOpenNewWorkspace: () => void;
  onUpdateWorkflowStatus: WorkspaceKanbanViewProps["onUpdateWorkflowStatus"];
  onUpdatePriority: WorkspaceKanbanViewProps["onUpdatePriority"];
  onSetWorkspaceGroup?: WorkspaceKanbanViewProps["onSetWorkspaceGroup"];
  onCreateGroup?: WorkspaceKanbanViewProps["onCreateGroup"];
  onCreateLabel: WorkspaceKanbanViewProps["onCreateLabel"];
  onUpdateLabel: WorkspaceKanbanViewProps["onUpdateLabel"];
  onUpdateLabels: WorkspaceKanbanViewProps["onUpdateLabels"];
  onPinWorkspace: WorkspaceKanbanViewProps["onPinWorkspace"];
  onUnpinWorkspace: WorkspaceKanbanViewProps["onUnpinWorkspace"];
  onArchiveWorkspace: WorkspaceKanbanViewProps["onArchiveWorkspace"];
  onDeleteWorkspace: WorkspaceKanbanViewProps["onDeleteWorkspace"];
};

interface LeftSidebarManagementCenterProps extends ManagementCenterSharedProps {
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  managementCenterItems: ManagementCenterItems;
}

export function LeftSidebarManagementCenterOutside({
  managementCenterItems,
  ...shared
}: ManagementCenterSharedProps & {
  managementCenterItems: ManagementCenterItems;
}) {
  const items = useMemo(
    () => resolveItemsForPlacement(managementCenterItems, "outside"),
    [managementCenterItems],
  );

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col shrink-0 border-b border-sidebar-border">
      <div className="grid grid-cols-1">
        {items.map((item) => (
          <ManagementCenterCard
            key={item.id}
            item={item}
            index={0}
            totalItems={1}
            isActive={shared.currentView === item.id || (item.kind === "canvas" && shared.canvasOpen)}
            variant="outside"
            {...shared}
          />
        ))}
      </div>
    </div>
  );
}

export function LeftSidebarManagementCenter({
  isExpanded,
  onExpandedChange,
  managementCenterItems,
  ...shared
}: LeftSidebarManagementCenterProps) {
  const t = useTranslations("AppShell.chrome");
  const items = useMemo(
    () => resolveItemsForPlacement(managementCenterItems, "inside"),
    [managementCenterItems],
  );

  // Hide the entire Management Center block when no inside items are enabled.
  if (items.length === 0) return null;

  return (
    <>
      <div
        className="h-10 flex items-center justify-between px-4 text-sm font-medium border-b border-sidebar-border cursor-pointer hover:bg-sidebar-accent/50 transition-colors select-none"
        onClick={() => onExpandedChange(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Layers className="size-4" />
          <span>{t("managementCenter.title")}</span>
        </div>
        <div className={cn("text-muted-foreground transition-transform duration-200", isExpanded ? "rotate-90" : "")}>
          <ArrowRight className="size-3.5" />
        </div>
      </div>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          isExpanded ? "grid-rows-[1fr] border-b border-sidebar-border" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="grid grid-cols-1 @[200px]:grid-cols-2">
            {items.map((item, index) => (
              <ManagementCenterCard
                key={item.id}
                item={item}
                index={index}
                totalItems={items.length}
                isActive={shared.currentView === item.id || (item.kind === "canvas" && shared.canvasOpen)}
                variant="inside"
                {...shared}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function resolveItemsForPlacement(
  configs: ManagementCenterItems,
  placement: ManagementCenterPlacement,
): ManagementCenterItemDef[] {
  return selectManagementCenterItemsByPlacement(configs, placement).map(
    (id) => ITEM_DEF_BY_ID[id],
  );
}

function ManagementCenterCard({
  item,
  index,
  totalItems,
  isActive,
  variant,
  projects,
  availableLabels,
  groups = [],
  groupingMode = "status",
  kanbanFilters,
  onFiltersChange,
  onGroupingModeChange,
  onNavigate,
  onOpenCanvas,
  onOpenNewWorkspace,
  onUpdateWorkflowStatus,
  onUpdatePriority,
  onSetWorkspaceGroup,
  onCreateGroup,
  onCreateLabel,
  onUpdateLabel,
  onUpdateLabels,
  onPinWorkspace,
  onUnpinWorkspace,
  onArchiveWorkspace,
  onDeleteWorkspace,
}: ManagementCenterSharedProps & {
  item: ManagementCenterItemDef;
  index: number;
  totalItems: number;
  isActive: boolean;
  variant: ManagementCenterPlacement;
}) {
  const t = useTranslations("AppShell.chrome");
  const Icon = item.icon;
  const isOutside = variant === "outside";
  const isOddCount = totalItems % 2 === 1;
  const isLeftColumnOnTwoCol = index % 2 === 0;
  const isLastItemAlone = isOddCount && index === totalItems - 1;
  const cardClassName = cn(
    "group relative h-12 cursor-pointer overflow-hidden transition-all duration-300 outline-none",
    // Outside items: each occupies its own full-width slot, no dividers between them.
    isOutside
      ? "w-full"
      : cn(
          "border-b border-b-sidebar-border/30 transition-colors",
          isLastItemAlone
            ? "@[200px]:col-span-2"
            : isLeftColumnOnTwoCol && "@[200px]:border-r @[200px]:border-sidebar-border/30",
        ),
    isActive ? "text-sidebar-foreground" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
  );
  const cardInner = (
    <>
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
                type: "tween",
              },
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
            {t(item.labelKey)}
          </span>
        </div>
      </div>
    </>
  );

  if (item.kind === "kanban") {
    return (
      <WorkspaceKanbanView
        projects={projects}
        availableLabels={availableLabels}
        groups={groups}
        groupingMode={groupingMode}
        onGroupingModeChange={onGroupingModeChange}
        onUpdateWorkflowStatus={onUpdateWorkflowStatus}
        onUpdatePriority={onUpdatePriority}
        onSetWorkspaceGroup={onSetWorkspaceGroup}
        onCreateGroup={onCreateGroup}
        onCreateLabel={onCreateLabel}
        onUpdateLabel={onUpdateLabel}
        onUpdateLabels={onUpdateLabels}
        onPinWorkspace={onPinWorkspace}
        onUnpinWorkspace={onUnpinWorkspace}
        onArchiveWorkspace={onArchiveWorkspace}
        onDeleteWorkspace={onDeleteWorkspace}
        filters={kanbanFilters}
        onFiltersChange={onFiltersChange}
        trigger={<div className={cardClassName}>{cardInner}</div>}
      />
    );
  }

  if (item.kind === "canvas") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div onClick={onOpenCanvas} className={cardClassName}>
            {cardInner}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="flex items-center gap-2">
            <span>{t("managementCenter.items.canvas")}</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
              <Command className="size-3" />
              <span className="text-xs">⇧</span>
              <span className="text-xs">H</span>
            </kbd>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (item.kind === "new-workspace") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div onClick={onOpenNewWorkspace} className={cardClassName}>
            {cardInner}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="flex items-center gap-2">
            <span>{t("managementCenter.items.newWorkspace")}</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
              <Command className="size-3" />
              <span className="text-xs">N</span>
            </kbd>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      onClick={() => item.path && onNavigate(item.path)}
      className={cardClassName}
    >
      {cardInner}
    </div>
  );
}
