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
import { useTranslations } from "next-intl";
import type { FlattenedWorkspaceEntry } from "@/app-shell/sidebar/workspace-grouping";
import type { WorkspaceLabel } from "@/shared/types/domain";
import {
  getWorkspaceLabelGroupKey,
  getWorkspaceTimeGroupLabel,
  UNTAGGED_WORKSPACE_GROUP_KEY,
} from "@/app-shell/sidebar/workspace-grouping";
import {
  getWorkspacePriorityMeta,
  WorkspaceLabelDots,
} from "@/app-shell/sidebar/workspace-metadata-controls";
import {
  getWorkspaceAgentGroupMeta,
  getWorkspaceWorkflowStatusMeta,
  type SidebarGroupingMode,
} from "@/app-shell/sidebar/workspace-status";
import {
  parseWorkspaceAgentGroupKey,
  type WorkspaceAgentGroupKey,
} from "@/features/agent/lib/workspace-agent-status";

type DndSensors = React.ComponentProps<typeof DndContext>["sensors"];

export function LeftSidebarPinnedSection({
  availableLabels,
  groupingMode,
  labelGroupOrder,
  agentGroupKeyByWorkspaceId,
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
  availableLabels: WorkspaceLabel[];
  groupingMode: SidebarGroupingMode;
  labelGroupOrder: string[];
  agentGroupKeyByWorkspaceId?: Readonly<Record<string, WorkspaceAgentGroupKey>>;
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
  const t = useTranslations("appShell");

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
                  const priorityMeta = getWorkspacePriorityMeta(entry.workspace.priority);
                  const PriorityIcon = priorityMeta.icon;
                  const labelGroupKey = getWorkspaceLabelGroupKey(
                    entry.workspace,
                    labelGroupOrder,
                    availableLabels,
                  );
                  const agentMeta = getWorkspaceAgentGroupMeta(
                    parseWorkspaceAgentGroupKey(
                      agentGroupKeyByWorkspaceId?.[entry.workspace.id],
                    ),
                  );
                  const AgentIcon = agentMeta.icon;
                  // Only show right-side context when there is a real value (no "No label" / no priority).
                  const rightContext =
                    groupingMode === "status" ? (
                      <StatusIcon className={cn("size-3.5 shrink-0", statusMeta.className)} />
                    ) : groupingMode === "time" ? (
                      <span className="truncate">{getWorkspaceTimeGroupLabel(entry.workspace)}</span>
                    ) : groupingMode === "priority" &&
                      entry.workspace.priority !== "no_priority" ? (
                      <PriorityIcon className={cn("size-3.5 shrink-0", priorityMeta.className)} />
                    ) : groupingMode === "label" &&
                      labelGroupKey !== UNTAGGED_WORKSPACE_GROUP_KEY &&
                      entry.workspace.labels.length > 0 ? (
                      <WorkspaceLabelDots labels={entry.workspace.labels} overlap />
                    ) : groupingMode === "agent" ? (
                      <AgentIcon className={cn("size-3.5 shrink-0", agentMeta.className)} />
                    ) : undefined;

                  return renderWorkspaceItemRow(entry, {
                    showProjectName: true,
                    rightContext,
                    sortingDisabled: isSortingDisabled,
                    sortingDisabledMessage: t("leftPinnedSection.sortingDisabledMessage"),
                  });
                })}
              </div>
            </div>
          </div>
        </SortableContext>
      </DndContext>
      <div
        onClick={() => onCollapsedChange(!isCollapsed)}
        className="group/divider relative mx-4 my-1.5 flex items-center justify-center cursor-pointer"
      >
        <div
          onMouseEnter={() => onDividerHoverChange(true)}
          onMouseLeave={() => onDividerHoverChange(false)}
          className={cn(
            "relative flex items-center gap-1 cursor-pointer transition-colors duration-200",
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
              <span className={cn("transition-opacity duration-200", isDividerHovered ? "opacity-0" : "opacity-100")}>{t("leftPinnedSection.pinned")}</span>
              <span className={cn("absolute left-0 top-0 transition-opacity duration-200", isDividerHovered ? "opacity-100" : "opacity-0")}>{t("leftPinnedSection.expand")}</span>
            </span>
          ) : (
            <span className="text-[11px] overflow-hidden max-w-0 opacity-0 group-hover/divider:max-w-[60px] group-hover/divider:opacity-100 group-hover/divider:pr-1 transition-all duration-300 whitespace-nowrap">
              {t("leftPinnedSection.collapse")}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
