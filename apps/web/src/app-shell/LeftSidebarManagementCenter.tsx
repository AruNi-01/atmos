"use client";

import React, { useMemo } from "react";
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
  Layers,
  Plus,
  Presentation,
  Puzzle,
  SquareKanban,
  SquareTerminal,
  Timer,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import type { Project, WorkspaceLabel } from "@/shared/types/domain";
import { WorkspaceKanbanView } from "@/app-shell/sidebar/WorkspaceKanbanView";
import type { WorkspaceKanbanFilters } from "@/app-shell/sidebar/WorkspaceKanbanFilterMenu";

type WorkspaceKanbanViewProps = React.ComponentProps<typeof WorkspaceKanbanView>;

type ManagementCenterItem = {
  id: string;
  label: string;
  icon: typeof FolderKanban;
  path?: string;
  kind?: "kanban" | "new-workspace" | "canvas";
};

interface LeftSidebarManagementCenterProps {
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  currentView: string;
  canvasOpen: boolean;
  managementTerminalsEnabled: boolean;
  managementAgentsEnabled: boolean;
  projects: Project[];
  availableLabels: WorkspaceLabel[];
  kanbanFilters: WorkspaceKanbanFilters;
  onFiltersChange: (filters: WorkspaceKanbanFilters) => void;
  onNavigate: (path: string) => void;
  onOpenCanvas: () => void;
  onOpenNewWorkspace: () => void;
  onUpdateWorkflowStatus: WorkspaceKanbanViewProps["onUpdateWorkflowStatus"];
  onUpdatePriority: WorkspaceKanbanViewProps["onUpdatePriority"];
  onCreateLabel: WorkspaceKanbanViewProps["onCreateLabel"];
  onUpdateLabel: WorkspaceKanbanViewProps["onUpdateLabel"];
  onUpdateLabels: WorkspaceKanbanViewProps["onUpdateLabels"];
  onPinWorkspace: WorkspaceKanbanViewProps["onPinWorkspace"];
  onUnpinWorkspace: WorkspaceKanbanViewProps["onUnpinWorkspace"];
  onArchiveWorkspace: WorkspaceKanbanViewProps["onArchiveWorkspace"];
  onDeleteWorkspace: WorkspaceKanbanViewProps["onDeleteWorkspace"];
}

export function LeftSidebarManagementCenter({
  isExpanded,
  onExpandedChange,
  currentView,
  canvasOpen,
  managementTerminalsEnabled,
  managementAgentsEnabled,
  projects,
  availableLabels,
  kanbanFilters,
  onFiltersChange,
  onNavigate,
  onOpenCanvas,
  onOpenNewWorkspace,
  onUpdateWorkflowStatus,
  onUpdatePriority,
  onCreateLabel,
  onUpdateLabel,
  onUpdateLabels,
  onPinWorkspace,
  onUnpinWorkspace,
  onArchiveWorkspace,
  onDeleteWorkspace,
}: LeftSidebarManagementCenterProps) {
  const managementCenterItems = useMemo<ManagementCenterItem[]>(() => {
    const all: ManagementCenterItem[] = [
      { id: "workspaces", label: "Workspaces", icon: FolderKanban, path: "/workspaces" },
      { id: "skills", label: "Skills", icon: Puzzle, path: "/skills" },
      { id: "terminals", label: "Terminals", icon: SquareTerminal, path: "/terminals" },
      { id: "agents", label: "Agents", icon: Bot, path: "/agents" },
      { id: "automations", label: "Automations", icon: Timer, path: "/automations" },
      { id: "canvas", label: "Canvas", icon: Presentation, kind: "canvas" },
      { id: "kanban", label: "Kanban", icon: SquareKanban, kind: "kanban" },
      { id: "new-workspace", label: "New Workspace", icon: Plus, kind: "new-workspace" },
    ];

    return all.filter((item) => {
      if (item.id === "terminals" && !managementTerminalsEnabled) return false;
      if (item.id === "agents" && !managementAgentsEnabled) return false;
      return true;
    });
  }, [managementAgentsEnabled, managementTerminalsEnabled]);

  return (
    <>
      <div
        className="h-10 flex items-center justify-between px-4 text-sm font-medium border-b border-sidebar-border cursor-pointer hover:bg-sidebar-accent/50 transition-colors select-none"
        onClick={() => onExpandedChange(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Layers className="size-4" />
          <span>Management Center</span>
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
            {managementCenterItems.map((item, index) => (
              <ManagementCenterCard
                key={item.id}
                item={item}
                index={index}
                totalItems={managementCenterItems.length}
                isActive={currentView === item.id || (item.kind === "canvas" && canvasOpen)}
                projects={projects}
                availableLabels={availableLabels}
                kanbanFilters={kanbanFilters}
                onFiltersChange={onFiltersChange}
                onNavigate={onNavigate}
                onOpenCanvas={onOpenCanvas}
                onOpenNewWorkspace={onOpenNewWorkspace}
                onUpdateWorkflowStatus={onUpdateWorkflowStatus}
                onUpdatePriority={onUpdatePriority}
                onCreateLabel={onCreateLabel}
                onUpdateLabel={onUpdateLabel}
                onUpdateLabels={onUpdateLabels}
                onPinWorkspace={onPinWorkspace}
                onUnpinWorkspace={onUnpinWorkspace}
                onArchiveWorkspace={onArchiveWorkspace}
                onDeleteWorkspace={onDeleteWorkspace}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function ManagementCenterCard({
  item,
  index,
  totalItems,
  isActive,
  projects,
  availableLabels,
  kanbanFilters,
  onFiltersChange,
  onNavigate,
  onOpenCanvas,
  onOpenNewWorkspace,
  onUpdateWorkflowStatus,
  onUpdatePriority,
  onCreateLabel,
  onUpdateLabel,
  onUpdateLabels,
  onPinWorkspace,
  onUnpinWorkspace,
  onArchiveWorkspace,
  onDeleteWorkspace,
}: {
  item: ManagementCenterItem;
  index: number;
  totalItems: number;
  isActive: boolean;
  projects: Project[];
  availableLabels: WorkspaceLabel[];
  kanbanFilters: WorkspaceKanbanFilters;
  onFiltersChange: (filters: WorkspaceKanbanFilters) => void;
  onNavigate: (path: string) => void;
  onOpenCanvas: () => void;
  onOpenNewWorkspace: () => void;
  onUpdateWorkflowStatus: WorkspaceKanbanViewProps["onUpdateWorkflowStatus"];
  onUpdatePriority: WorkspaceKanbanViewProps["onUpdatePriority"];
  onCreateLabel: WorkspaceKanbanViewProps["onCreateLabel"];
  onUpdateLabel: WorkspaceKanbanViewProps["onUpdateLabel"];
  onUpdateLabels: WorkspaceKanbanViewProps["onUpdateLabels"];
  onPinWorkspace: WorkspaceKanbanViewProps["onPinWorkspace"];
  onUnpinWorkspace: WorkspaceKanbanViewProps["onUnpinWorkspace"];
  onArchiveWorkspace: WorkspaceKanbanViewProps["onArchiveWorkspace"];
  onDeleteWorkspace: WorkspaceKanbanViewProps["onDeleteWorkspace"];
}) {
  const Icon = item.icon;
  const isOddCount = totalItems % 2 === 1;
  const isLeftColumnOnTwoCol = index % 2 === 0;
  const isLastItemAlone = isOddCount && index === totalItems - 1;
  const cardClassName = cn(
    "group relative h-12 cursor-pointer overflow-hidden transition-all duration-300 outline-none",
    "border-b border-b-sidebar-border/30 transition-colors",
    isLastItemAlone
      ? "@[200px]:col-span-2"
      : isLeftColumnOnTwoCol && "@[200px]:border-r @[200px]:border-sidebar-border/30",
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
            {item.label}
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
        onUpdateWorkflowStatus={onUpdateWorkflowStatus}
        onUpdatePriority={onUpdatePriority}
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
            <span>Canvas</span>
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
            <span>New Workspace</span>
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
