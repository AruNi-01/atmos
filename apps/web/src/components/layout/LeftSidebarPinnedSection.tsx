"use client";

import React from "react";
import {
  DndContext,
  SortableContext,
  arrayMove,
  closestCenter,
  cn,
  restrictToVerticalAxis,
  restrictToWindowEdges,
  verticalListSortingStrategy,
} from "@workspace/ui";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FlattenedWorkspaceEntry } from "@/components/layout/sidebar/workspace-grouping";
import {
  getWorkspaceTimeGroupLabel,
} from "@/components/layout/sidebar/workspace-grouping";
import {
  getWorkspaceWorkflowStatusMeta,
  type SidebarGroupingMode,
} from "@/components/layout/sidebar/workspace-status";

type DndSensors = React.ComponentProps<typeof DndContext>["sensors"];

export function LeftSidebarPinnedSection({
  groupingMode,
  isCollapsed,
  isDividerHovered,
  isSortingDisabled,
  pinnedWorkspaces,
  renderWorkspaceItemRow,
  sensors,
  onCollapsedChange,
  onDividerHoverChange,
  onUpdatePinOrder,
}: {
  groupingMode: SidebarGroupingMode;
  isCollapsed: boolean;
  isDividerHovered: boolean;
  isSortingDisabled: boolean;
  pinnedWorkspaces: FlattenedWorkspaceEntry[];
  renderWorkspaceItemRow: (
    entry: FlattenedWorkspaceEntry,
    options?: {
      showProjectName?: boolean;
      rightContext?: React.ReactNode;
      suppressInfoPopover?: boolean;
      sortingDisabled?: boolean;
      sortingDisabledMessage?: string;
    },
  ) => React.ReactNode;
  sensors: DndSensors;
  onCollapsedChange: (collapsed: boolean) => void;
  onDividerHoverChange: (hovered: boolean) => void;
  onUpdatePinOrder: (workspaceIds: string[]) => void | Promise<void>;
}) {
  if (pinnedWorkspaces.length === 0) {
    return null;
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event) => {
          if (isSortingDisabled) return;
          const { active, over } = event;
          if (!over || active.id === over.id) return;

          const oldIndex = pinnedWorkspaces.findIndex(e => e.workspace.id === active.id);
          const newIndex = pinnedWorkspaces.findIndex(e => e.workspace.id === over.id);
          if (oldIndex === -1 || newIndex === -1) return;

          const reordered = arrayMove(pinnedWorkspaces, oldIndex, newIndex);
          void onUpdatePinOrder(reordered.map(e => e.workspace.id));
        }}
        modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
      >
        <SortableContext items={pinnedWorkspaces.map(e => e.workspace.id)} strategy={verticalListSortingStrategy}>
          <div className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-in-out",
            isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
          )}>
            <div className="overflow-hidden">
              <div className="space-y-0.5 px-2 pb-1">
                {pinnedWorkspaces.map((entry) => {
                  const statusMeta = getWorkspaceWorkflowStatusMeta(entry.workspace.workflowStatus);
                  const StatusIcon = statusMeta.icon;
                  const rightContext = groupingMode === "status" ? (
                    <StatusIcon className={cn("size-3.5 shrink-0", statusMeta.className)} />
                  ) : groupingMode === "time" ? (
                    <span className="truncate">{getWorkspaceTimeGroupLabel(entry.workspace)}</span>
                  ) : undefined;

                  return renderWorkspaceItemRow(entry, {
                    showProjectName: true,
                    rightContext,
                    sortingDisabled: isSortingDisabled,
                    sortingDisabledMessage: "Clear workspace filters before reordering pinned workspaces.",
                  });
                })}
              </div>
            </div>
          </div>
        </SortableContext>
      </DndContext>
      <div
        onClick={() => onCollapsedChange(!isCollapsed)}
        className="group/divider relative mx-4 my-1.5 flex items-center cursor-pointer"
      >
        <div className="flex-1 border-t border-dashed border-sidebar-border" />
        <div
          onMouseEnter={() => onDividerHoverChange(true)}
          onMouseLeave={() => onDividerHoverChange(false)}
          className={cn(
            "relative flex items-center gap-1 cursor-pointer pl-2 transition-colors duration-200",
            isDividerHovered ? "text-sidebar-foreground" : "text-muted-foreground",
          )}
        >
          {isCollapsed ? (
            <ChevronDown className="size-3.5 shrink-0" />
          ) : (
            <ChevronUp className="size-3.5 shrink-0" />
          )}
          {isCollapsed ? (
            <span className="text-[11px] relative pr-1">
              <span className={cn("transition-opacity duration-200", isDividerHovered ? "opacity-0" : "opacity-100")}>Pinned</span>
              <span className={cn("absolute left-0 top-0 transition-opacity duration-200", isDividerHovered ? "opacity-100" : "opacity-0")}>Expand</span>
            </span>
          ) : (
            <span className="text-[11px] overflow-hidden max-w-0 opacity-0 group-hover/divider:max-w-[60px] group-hover/divider:opacity-100 group-hover/divider:pr-1 transition-all duration-300 whitespace-nowrap">
              Collapse
            </span>
          )}
        </div>
        <div className="flex-1 border-t border-dashed border-sidebar-border" />
      </div>
    </>
  );
}
