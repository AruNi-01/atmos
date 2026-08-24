"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  CSS,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DndContext,
  DragOverlay,
  Panel,
  PanelGroup,
  PanelResizeHandle,
  SortableContext,
  arrayMove,
  closestCenter,
  cn,
  defaultDropAnimationSideEffects,
  restrictToVerticalAxis,
  restrictToWindowEdges,
  useSortable,
  verticalListSortingStrategy,
  type DragEndEvent,
  type DragStartEvent,
  type ImperativePanelHandle,
} from "@workspace/ui";
import { ChevronRight, GripVertical } from "lucide-react";
import type { Project, Workspace, WorkspaceLabel } from "@/shared/types/domain";
import { ProjectItem, type ProjectItemProps } from "@/app-shell/sidebar/ProjectItem";
import { SortableProject } from "@/app-shell/sidebar/SortableProject";
import { WorkspaceContent } from "@/app-shell/sidebar/WorkspaceContent";
import {
  useWorkspaceListVisibleCount,
  WorkspaceListShowMoreLess,
} from "@/app-shell/sidebar/workspace-list-pagination";
import {
  getWorkspaceAgentGroupMeta,
  getWorkspaceWorkflowStatusMeta,
  type SidebarGroupingMode,
} from "@/app-shell/sidebar/workspace-status";
import { getWorkspacePriorityMeta } from "@/app-shell/sidebar/workspace-metadata-controls";
import type { WorkspaceAgentGroupKey } from "@/features/agent/lib/workspace-agent-status";
import {
  UNTAGGED_WORKSPACE_GROUP_KEY,
  type FlattenedWorkspaceEntry,
  type WorkspaceGroup,
} from "@/app-shell/sidebar/workspace-grouping";
import {
  selectAttentionFilterMode,
  useAgentAttentionStore,
} from "@/features/agent/store/agent-attention-store";
import { LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS } from "@/app-shell/sidebar-layout-constants";
export { LeftSidebarFooter } from "./left-sidebar-tab-footer-controls";

type DndSensors = React.ComponentProps<typeof DndContext>["sensors"];
type PanelGroupStorage = React.ComponentProps<typeof PanelGroup>["storage"];

export function SortableSidebarKanbanCard({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: workspaceId });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: transition || "transform 200ms cubic-bezier(0.2, 0, 0, 1)",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn("relative", isDragging && "z-20 opacity-60")}
    >
      {children}
    </div>
  );
}

export function LeftSidebarSortableProjectList({
  activeId,
  activeProjectId,
  activeWorkspaceId,
  availableLabels,
  className,
  expandedProjectIds,
  flattenedWorkspaces,
  hideWorkspaceList = false,
  isAnyProjectDragging,
  projects,
  selectedProjectId,
  sensors,
  showDragOverlay = false,
  onAddWorkspace,
  onArchiveWorkspace,
  onConfigureScripts,
  onCreateWorkspaceLabel,
  onDeleteProject,
  onDeleteWorkspace,
  onDragEnd,
  onDragStart,
  onPinWorkspace,
  onProjectRowClick,
  onQuickAddWorkspace,
  onSelectMain,
  onSetColor,
  onSetLogo,
  onToggleProject,
  onUnpinWorkspace,
  onUpdateWorkspaceLabel,
  onUpdateWorkspaceLabels,
  onUpdateWorkspaceName,
  onUpdateWorkspacePriority,
  onUpdateWorkspaceWorkflowStatus,
  groups,
  onAddProjectToGroup,
  onRemoveProjectFromGroup,
  onAddWorkspaceToGroup,
  onRemoveWorkspaceFromGroup,
  onSetWorkspaceGroup,
  onCreateGroup,
}: {
  activeId?: string | null;
  activeProjectId: string | null;
  activeWorkspaceId: string | null;
  availableLabels: WorkspaceLabel[];
  className?: string;
  expandedProjectIds: string[];
  flattenedWorkspaces?: FlattenedWorkspaceEntry[];
  hideWorkspaceList?: boolean;
  isAnyProjectDragging: boolean;
  projects: Project[];
  selectedProjectId?: string | null;
  sensors: DndSensors;
  showDragOverlay?: boolean;
  onAddWorkspace: (projectId: string) => void;
  onArchiveWorkspace: ProjectItemProps["onArchiveWorkspace"];
  onConfigureScripts: (projectId: string) => void;
  onCreateWorkspaceLabel: (data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onDeleteProject: (projectId: string) => void;
  onDeleteWorkspace: ProjectItemProps["onDeleteWorkspace"];
  onDragEnd: (event: DragEndEvent) => void | Promise<void>;
  onDragStart: (event: DragStartEvent) => void;
  onPinWorkspace: ProjectItemProps["onPinWorkspace"];
  onProjectRowClick?: (projectId: string) => void;
  onQuickAddWorkspace: (projectId: string) => void | Promise<void>;
  onSelectMain: (projectId: string) => void;
  onSetColor: (projectId: string, color?: string) => void | Promise<void>;
  onSetLogo: (projectId: string, logoPath: string | null) => void | Promise<void>;
  onToggleProject: (projectId: string) => void;
  onUnpinWorkspace: ProjectItemProps["onUnpinWorkspace"];
  onUpdateWorkspaceLabel: (labelId: string, data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateWorkspaceLabels: (projectId: string, workspaceId: string, labels: WorkspaceLabel[]) => Promise<void>;
  onUpdateWorkspaceName: (projectId: string, workspaceId: string, name: string) => Promise<void>;
  onUpdateWorkspacePriority: ProjectItemProps["onUpdateWorkspacePriority"];
  onUpdateWorkspaceWorkflowStatus: ProjectItemProps["onUpdateWorkspaceWorkflowStatus"];
  groups?: ProjectItemProps["groups"];
  onAddProjectToGroup?: ProjectItemProps["onAddProjectToGroup"];
  onRemoveProjectFromGroup?: ProjectItemProps["onRemoveProjectFromGroup"];
  onAddWorkspaceToGroup?: ProjectItemProps["onAddWorkspaceToGroup"];
  onRemoveWorkspaceFromGroup?: ProjectItemProps["onRemoveWorkspaceFromGroup"];
  onSetWorkspaceGroup?: ProjectItemProps["onSetWorkspaceGroup"];
  onCreateGroup?: ProjectItemProps["onCreateGroup"];
}) {
  return (
    <div className={cn("scrollbar-on-hover h-full overflow-y-auto", className)}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
      >
        <SortableContext items={projects.map((project) => project.id)} strategy={verticalListSortingStrategy}>
          {projects.map((project) => (
            <SortableProject
              key={project.id}
              project={project}
              isExpanded={hideWorkspaceList ? false : expandedProjectIds.includes(project.id)}
              hideWorkspaceList={hideWorkspaceList}
              isAnyProjectDragging={isAnyProjectDragging}
              onToggle={onToggleProject}
              onProjectRowClick={onProjectRowClick}
              onAddWorkspace={onAddWorkspace}
              onQuickAddWorkspace={onQuickAddWorkspace}
              onSetColor={onSetColor}
              onSetLogo={onSetLogo}
              onDelete={onDeleteProject}
              onPinWorkspace={onPinWorkspace}
              onUnpinWorkspace={onUnpinWorkspace}
              onArchiveWorkspace={onArchiveWorkspace}
              onDeleteWorkspace={onDeleteWorkspace}
              onUpdateWorkspaceWorkflowStatus={onUpdateWorkspaceWorkflowStatus}
              onUpdateWorkspacePriority={onUpdateWorkspacePriority}
              availableLabels={availableLabels}
              onCreateWorkspaceLabel={onCreateWorkspaceLabel}
              onUpdateWorkspaceLabel={onUpdateWorkspaceLabel}
              onUpdateWorkspaceLabels={onUpdateWorkspaceLabels}
              onUpdateWorkspaceName={onUpdateWorkspaceName}
              onConfigureScripts={onConfigureScripts}
              onSelectMain={onSelectMain}
              isActiveProject={activeProjectId === project.id && !activeWorkspaceId}
              isSelected={selectedProjectId === project.id}
              activeWorkspaceId={activeWorkspaceId}
              groups={groups}
              onAddProjectToGroup={onAddProjectToGroup}
              onRemoveProjectFromGroup={onRemoveProjectFromGroup}
              onAddWorkspaceToGroup={onAddWorkspaceToGroup}
              onRemoveWorkspaceFromGroup={onRemoveWorkspaceFromGroup}
              onSetWorkspaceGroup={onSetWorkspaceGroup}
              onCreateGroup={onCreateGroup}
            />
          ))}
        </SortableContext>

        {showDragOverlay && flattenedWorkspaces ? (
          <LeftSidebarDragOverlay
            activeId={activeId ?? null}
            flattenedWorkspaces={flattenedWorkspaces}
            projects={projects}
            workspaceLabels={availableLabels}
          />
        ) : null}
      </DndContext>
    </div>
  );
}

export function TwoColumnSidebarToggleButton({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("AppShell.chrome");
  const label = collapsed
    ? t("leftSidebarControls.expandFirstColumn")
    : t("leftSidebarControls.collapseFirstColumn");

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
      aria-label={label}
      title={label}
    >
      <ChevronRight
        className={cn(
          "size-3.5 transition-transform",
          collapsed ? "rotate-0" : "rotate-180",
        )}
      />
    </button>
  );
}

export function SidebarColumnResizeHandle({
  onDragging,
}: {
  onDragging?: (dragging: boolean) => void;
}) {
  return (
    <PanelResizeHandle
      onDragging={onDragging}
      className={cn(
        // Invisible by default so the sidebar has no hard divider; show a thin
        // hover affordance so resize remains discoverable.
        "relative flex h-full self-stretch w-px items-center justify-center bg-transparent hover:bg-sidebar-border/50 group touch-none",
        "before:absolute before:inset-y-0 before:left-1/2 before:w-1 before:-translate-x-1/2",
      )}
    />
  );
}

export function LeftSidebarDragOverlay({
  activeId,
  flattenedWorkspaces,
  projects,
  workspaceLabels,
}: {
  activeId: string | null;
  flattenedWorkspaces: FlattenedWorkspaceEntry[];
  projects: Project[];
  workspaceLabels: WorkspaceLabel[];
}) {
  const activeProject = activeId ? projects.find((project) => project.id === activeId) : undefined;
  const activeWorkspaceEntry = activeId
    ? flattenedWorkspaces.find(({ workspace }) => workspace.id === activeId)
    : undefined;

  return (
    <DragOverlay
      dropAnimation={{
        sideEffects: defaultDropAnimationSideEffects({
          styles: {
            active: {
              opacity: "0.4",
            },
          },
        }),
      }}
    >
      {activeProject ? (
        <ProjectItem
          project={activeProject}
          isExpanded={false}
          isDragging={true}
          onToggle={() => {}}
          onAddWorkspace={() => {}}
          onQuickAddWorkspace={() => {}}
          onSetColor={() => {}}
          onSetLogo={() => {}}
          onDelete={() => {}}
          onPinWorkspace={() => {}}
          onUnpinWorkspace={() => {}}
          onArchiveWorkspace={() => {}}
          onDeleteWorkspace={() => {}}
          onUpdateWorkspaceName={async () => {}}
          onUpdateWorkspaceWorkflowStatus={() => {}}
          onUpdateWorkspacePriority={() => {}}
          availableLabels={workspaceLabels}
          onCreateWorkspaceLabel={async (data) => ({
            id: "",
            name: data.name,
            color: data.color,
            source: "manual",
          })}
          onUpdateWorkspaceLabel={async (labelId, data) => ({
            id: labelId,
            name: data.name,
            color: data.color,
            source: "manual",
          })}
          onUpdateWorkspaceLabels={async () => {}}
          onConfigureScripts={() => {}}
          onSelectMain={() => {}}
          isActiveProject={false}
        />
      ) : activeWorkspaceEntry ? (
        <WorkspaceContent
          workspace={activeWorkspaceEntry.workspace}
          projectId={activeWorkspaceEntry.projectId}
          projectName={activeWorkspaceEntry.projectName}
          isDragging={true}
        />
      ) : null}
    </DragOverlay>
  );
}

function WorkspaceGroupMarker({
  group,
  groupingMode,
}: {
  group: WorkspaceGroup;
  groupingMode: SidebarGroupingMode;
}) {
  const statusMeta = groupingMode === "status"
    ? getWorkspaceWorkflowStatusMeta(
        group.key as Parameters<typeof getWorkspaceWorkflowStatusMeta>[0],
      )
    : null;
  const priorityMeta = groupingMode === "priority"
    ? getWorkspacePriorityMeta(
        group.key as Parameters<typeof getWorkspacePriorityMeta>[0],
      )
    : null;
  const agentMeta = groupingMode === "agent"
    ? getWorkspaceAgentGroupMeta(group.key as WorkspaceAgentGroupKey)
    : null;
  const GroupIcon = statusMeta?.icon ?? priorityMeta?.icon ?? agentMeta?.icon;

  if (GroupIcon) {
    return (
      <GroupIcon
        className={cn(
          // size-4 matches Launchpad / outside nav icons for a shared icon column.
          "size-4 shrink-0",
          statusMeta?.className ?? priorityMeta?.className ?? agentMeta?.className,
        )}
      />
    );
  }

  if (groupingMode === "label" && group.color) {
    return (
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: group.color }}
      />
    );
  }

  return null;
}

function SortableWorkspaceGroupSection({
  group,
  groupingMode,
  isCollapsed,
  renderWorkspaceContentRow,
  sortingEnabled,
  toggleWorkspaceGroup,
}: {
  group: WorkspaceGroup;
  groupingMode: SidebarGroupingMode;
  isCollapsed: boolean;
  renderWorkspaceContentRow: (
    entry: FlattenedWorkspaceEntry,
    options?: { showProjectName?: boolean; rightContext?: React.ReactNode },
  ) => React.ReactNode;
  sortingEnabled: boolean;
  toggleWorkspaceGroup: () => void;
}) {
  const isSortableLabel =
    groupingMode === "label" &&
    group.key !== UNTAGGED_WORKSPACE_GROUP_KEY &&
    sortingEnabled;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.key, disabled: !isSortableLabel });
  const {
    visibleCount,
    canShowMore,
    canShowLess,
    showMore,
    showLess,
  } = useWorkspaceListVisibleCount(group.items.length, group.key);
  const visibleItems = group.items.slice(0, visibleCount);
  // Attention filter: dim group chrome so latched workspaces stay the focus.
  const attentionFilterMode = useAgentAttentionStore(selectAttentionFilterMode);

  return (
    <section
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={cn("space-y-1.5", isDragging && "relative z-20 opacity-60")}
    >
      <div
        className={cn(
          "group relative flex items-center rounded-lg hover:bg-sidebar-accent",
          attentionFilterMode && "opacity-45",
        )}
      >
        <button
          type="button"
          onClick={toggleWorkspaceGroup}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pl-3 pr-2 text-left text-[11px] font-semibold tracking-[0.03em] text-muted-foreground hover:text-sidebar-accent-foreground"
        >
          <WorkspaceGroupMarker group={group} groupingMode={groupingMode} />
          <span className="truncate">{group.label}</span>
          <ChevronRight
            className={cn(
              "ml-1 size-3 shrink-0 opacity-0 transition-all duration-200 group-hover:opacity-100",
              !isCollapsed && "rotate-90",
            )}
          />
          <span
            className={cn(
              "ml-auto inline-flex size-6 shrink-0 items-center justify-center text-[10px] font-medium normal-case tracking-normal text-muted-foreground/80 transition-opacity",
              isSortableLabel &&
                "group-hover:opacity-0 group-focus-within:opacity-0",
            )}
          >
            {group.items.length}
          </span>
        </button>
        {isSortableLabel ? (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="pointer-events-none absolute right-2 inline-flex size-6 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:text-sidebar-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 active:cursor-grabbing group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
            aria-label={group.label}
          >
            <GripVertical className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-1 pl-3 pt-0.5">
            {visibleItems.map((entry) =>
              renderWorkspaceContentRow(entry, { showProjectName: true })
            )}
            <WorkspaceListShowMoreLess
              canShowMore={canShowMore}
              canShowLess={canShowLess}
              onShowMore={showMore}
              onShowLess={showLess}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function GroupedWorkspaceOneColumnContent({
  collapsedWorkspaceGroups,
  groupingMode,
  groups,
  onLabelGroupOrderChange,
  renderWorkspaceContentRow,
  sensors,
  toggleWorkspaceGroup,
}: {
  collapsedWorkspaceGroups: Record<string, boolean>;
  groupingMode: SidebarGroupingMode;
  groups: WorkspaceGroup[];
  onLabelGroupOrderChange?: (labelIds: string[]) => void;
  renderWorkspaceContentRow: (
    entry: FlattenedWorkspaceEntry,
    options?: { showProjectName?: boolean; rightContext?: React.ReactNode },
  ) => React.ReactNode;
  sensors: DndSensors;
  toggleWorkspaceGroup: (stateKey: string) => void;
}) {
  const [isAnyGroupDragging, setIsAnyGroupDragging] = React.useState(false);
  const attentionFilterMode = useAgentAttentionStore(selectAttentionFilterMode);
  // Attention list: drop empty status/priority/label buckets so only groups with
  // latched workspaces remain.
  const visibleGroups = attentionFilterMode
    ? groups.filter((group) => group.items.length > 0)
    : groups;
  const sortableLabelGroupIds = visibleGroups
    .filter((group) => group.key !== UNTAGGED_WORKSPACE_GROUP_KEY)
    .map((group) => group.key);

  return (
    <div className="scrollbar-on-hover h-full overflow-y-auto no-scrollbar">
      <DndContext
        collisionDetection={closestCenter}
        sensors={sensors}
        onDragStart={() => setIsAnyGroupDragging(true)}
        onDragCancel={() => setIsAnyGroupDragging(false)}
        onDragEnd={({ active, over }) => {
          setIsAnyGroupDragging(false);
          if (
            groupingMode !== "label" ||
            !onLabelGroupOrderChange ||
            !over ||
            active.id === over.id
          ) return;
          const oldIndex = sortableLabelGroupIds.indexOf(String(active.id));
          const newIndex = sortableLabelGroupIds.indexOf(String(over.id));
          if (oldIndex === -1 || newIndex === -1) return;
          onLabelGroupOrderChange?.(arrayMove(sortableLabelGroupIds, oldIndex, newIndex));
        }}
        modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
      >
        <SortableContext
          items={
            groupingMode === "label" && onLabelGroupOrderChange
              ? sortableLabelGroupIds
              : []
          }
          strategy={verticalListSortingStrategy}
        >
          <div className={cn("space-y-0.5 pl-2", LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS)}>
            {visibleGroups.map((group) => {
              const stateKey = `${groupingMode}:${group.key}`;
              return (
                <SortableWorkspaceGroupSection
                  key={group.key}
                  group={group}
                  groupingMode={groupingMode}
                  isCollapsed={
                    isAnyGroupDragging ||
                    (collapsedWorkspaceGroups[stateKey] ?? false)
                  }
                  renderWorkspaceContentRow={renderWorkspaceContentRow}
                  sortingEnabled={Boolean(onLabelGroupOrderChange)}
                  toggleWorkspaceGroup={() => toggleWorkspaceGroup(stateKey)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export function GroupedWorkspaceTwoColumnLeftContent({
  effectiveSelectedWorkspaceGroupKey,
  groupingMode,
  groups,
  onSelectGroup,
}: {
  effectiveSelectedWorkspaceGroupKey: string | null;
  groupingMode: SidebarGroupingMode;
  groups: WorkspaceGroup[];
  onSelectGroup: (groupKey: string) => void;
}) {
  const attentionFilterMode = useAgentAttentionStore(selectAttentionFilterMode);
  const visibleGroups = attentionFilterMode
    ? groups.filter((group) => group.items.length > 0)
    : groups;

  return (
    <div className="scrollbar-on-hover h-full overflow-y-auto px-2 py-1.5">
      <div className="space-y-1">
        {visibleGroups.map((group) => {
          const isSelected = effectiveSelectedWorkspaceGroupKey === group.key;

          return (
            <button
              key={group.key}
              type="button"
              onClick={() => onSelectGroup(group.key)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-[11px] font-semibold tracking-[0.03em]",
                isSelected
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                // Dim group chrome in attention filter so workspace rows stand out in the right pane.
                attentionFilterMode && "opacity-45",
              )}
            >
              <WorkspaceGroupMarker group={group} groupingMode={groupingMode} />
              <span className="truncate">{group.label}</span>
              <span className="ml-auto text-[10px] font-medium normal-case tracking-normal text-muted-foreground/80">
                {group.items.length}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function GroupedWorkspaceTwoColumnRightContent({
  groupingMode,
  isPrimaryCollapsed,
  selectedGroup,
  secondColumnKanban,
  renderWorkspaceContentRow,
  renderWorkspaceKanbanCard,
  onTogglePrimaryPanel,
}: {
  groupingMode: SidebarGroupingMode;
  isPrimaryCollapsed: boolean;
  selectedGroup: WorkspaceGroup | null;
  secondColumnKanban: boolean;
  renderWorkspaceContentRow: (
    entry: FlattenedWorkspaceEntry,
    options?: { showProjectName?: boolean; rightContext?: React.ReactNode },
  ) => React.ReactNode;
  renderWorkspaceKanbanCard: (entry: FlattenedWorkspaceEntry) => React.ReactNode;
  onTogglePrimaryPanel: () => void;
}) {
  const t = useTranslations("AppShell.chrome");
  const groupItems = selectedGroup?.items ?? [];
  const {
    visibleCount,
    canShowMore,
    canShowLess,
    showMore,
    showLess,
  } = useWorkspaceListVisibleCount(groupItems.length, selectedGroup?.key);
  const visibleItems = groupItems.slice(0, visibleCount);

  // Primary open: pl-3, with the shared divider gutter on the right.
  // Primary collapsed: pl-5 lines up group icon with Launchpad.
  const headerPad = isPrimaryCollapsed
    ? cn("pl-5", LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS)
    : cn("pl-3", LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("flex min-h-10 items-center gap-1", headerPad)}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {selectedGroup ? (
            <WorkspaceGroupMarker group={selectedGroup} groupingMode={groupingMode} />
          ) : null}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-sidebar-foreground">
              {selectedGroup?.label ?? t("leftSidebarControls.selectGroup")}
            </div>
          </div>
        </div>
        <div className="shrink-0">
          <TwoColumnSidebarToggleButton
            collapsed={isPrimaryCollapsed}
            onClick={onTogglePrimaryPanel}
          />
        </div>
      </div>
      <div
        className={cn(
          "scrollbar-on-hover flex-1 overflow-y-auto py-2 pl-3",
          LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS,
        )}
      >
        {!selectedGroup ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">
            {t("leftSidebarControls.selectGroupDescription")}
          </div>
        ) : (
          <div className={cn("space-y-1", secondColumnKanban && "space-y-2")}>
            {visibleItems.map((entry) =>
              secondColumnKanban ? (
                <div key={entry.workspace.id}>
                  {renderWorkspaceKanbanCard(entry)}
                </div>
              ) : (
                renderWorkspaceContentRow(entry, { showProjectName: true })
              ),
            )}
            <WorkspaceListShowMoreLess
              canShowMore={canShowMore}
              canShowLess={canShowLess}
              onShowMore={showMore}
              onShowLess={showLess}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function ProjectWorkspaceTwoColumnRightContent({
  activeProjectId,
  activeWorkspaceId,
  availableLabels,
  isPinnedSortingDisabled,
  isPrimaryCollapsed,
  isPinnedExpanded,
  isWorkspacesExpanded,
  secondColumnKanban,
  selectedProject,
  selectedProjectPinnedEntries,
  selectedProjectUnpinnedWorkspaces,
  sensors,
  showPinnedSection,
  renderWorkspaceItemRow,
  renderWorkspaceKanbanCard,
  onAddWorkspace,
  onArchiveWorkspace,
  onConfigureScripts,
  onCreateWorkspaceLabel,
  onDeleteProject,
  onDeleteWorkspace,
  onDragEnd,
  onDragStart,
  onPinnedExpandedChange,
  onPinWorkspace,
  onQuickAddWorkspace,
  onSelectMain,
  onSetColor,
  onSetLogo,
  onTogglePrimaryPanel,
  onUnpinWorkspace,
  onUpdateWorkspaceLabel,
  onUpdateWorkspaceLabels,
  onUpdateWorkspaceName,
  onUpdateWorkspacePinOrder,
  onUpdateWorkspacePriority,
  onUpdateWorkspaceWorkflowStatus,
  onWorkspacesExpandedChange,
}: {
  activeProjectId: string | null;
  activeWorkspaceId: string | null;
  availableLabels: WorkspaceLabel[];
  isPinnedSortingDisabled: boolean;
  isPrimaryCollapsed: boolean;
  isPinnedExpanded: boolean;
  isWorkspacesExpanded: boolean;
  secondColumnKanban: boolean;
  selectedProject: Project | null;
  selectedProjectPinnedEntries: FlattenedWorkspaceEntry[];
  selectedProjectUnpinnedWorkspaces: Workspace[];
  sensors: DndSensors;
  showPinnedSection: boolean;
  renderWorkspaceItemRow: (
    entry: FlattenedWorkspaceEntry,
    options?: {
      sortingDisabled?: boolean;
      sortingDisabledMessage?: string;
    },
  ) => React.ReactNode;
  renderWorkspaceKanbanCard: (entry: FlattenedWorkspaceEntry) => React.ReactNode;
  onAddWorkspace: (projectId: string) => void;
  onArchiveWorkspace: ProjectItemProps["onArchiveWorkspace"];
  onConfigureScripts: (projectId: string) => void;
  onCreateWorkspaceLabel: (data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onDeleteProject: (projectId: string) => void;
  onDeleteWorkspace: ProjectItemProps["onDeleteWorkspace"];
  onDragEnd: (event: DragEndEvent) => void | Promise<void>;
  onDragStart: (event: DragStartEvent) => void;
  onPinnedExpandedChange: (open: boolean) => void;
  onPinWorkspace: ProjectItemProps["onPinWorkspace"];
  onQuickAddWorkspace: (projectId: string) => void | Promise<void>;
  onSelectMain: (projectId: string) => void;
  onSetColor: (projectId: string, color?: string) => void | Promise<void>;
  onSetLogo: (projectId: string, logoPath: string | null) => void | Promise<void>;
  onTogglePrimaryPanel: () => void;
  onUnpinWorkspace: ProjectItemProps["onUnpinWorkspace"];
  onUpdateWorkspaceLabel: (labelId: string, data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateWorkspaceLabels: (projectId: string, workspaceId: string, labels: WorkspaceLabel[]) => Promise<void>;
  onUpdateWorkspaceName: (projectId: string, workspaceId: string, name: string) => Promise<void>;
  onUpdateWorkspacePinOrder: (workspaceIds: string[]) => void | Promise<void>;
  onUpdateWorkspacePriority: ProjectItemProps["onUpdateWorkspacePriority"];
  onUpdateWorkspaceWorkflowStatus: ProjectItemProps["onUpdateWorkspaceWorkflowStatus"];
  onWorkspacesExpandedChange: (open: boolean) => void;
}) {
  const t = useTranslations("AppShell.chrome");
  const {
    visibleCount,
    canShowMore,
    canShowLess,
    showMore,
    showLess,
  } = useWorkspaceListVisibleCount(
    selectedProjectUnpinnedWorkspaces.length,
    selectedProject?.id,
  );
  const visibleUnpinnedWorkspaces = selectedProjectUnpinnedWorkspaces.slice(0, visibleCount);

  const renderProjectWorkspaceEntry = (workspace: Workspace): FlattenedWorkspaceEntry | null => {
    if (!selectedProject) return null;
    return {
      projectId: selectedProject.id,
      projectName: selectedProject.name,
      projectPath: selectedProject.mainFilePath,
      workspace,
    };
  };

  const unpinnedList = (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
    >
      <SortableContext items={visibleUnpinnedWorkspaces.map((workspace) => workspace.id)} strategy={verticalListSortingStrategy}>
        <div className={cn("space-y-0.5", secondColumnKanban && "space-y-2")}>
          {visibleUnpinnedWorkspaces.map((workspace) => {
            const entry = renderProjectWorkspaceEntry(workspace);
            if (!entry) return null;
            return secondColumnKanban ? (
              <SortableSidebarKanbanCard
                key={workspace.id}
                workspaceId={workspace.id}
              >
                {renderWorkspaceKanbanCard(entry)}
              </SortableSidebarKanbanCard>
            ) : (
              renderWorkspaceItemRow(entry)
            );
          })}
        </div>
      </SortableContext>
      <WorkspaceListShowMoreLess
        canShowMore={canShowMore}
        canShowLess={canShowLess}
        onShowMore={showMore}
        onShowLess={showLess}
      />
    </DndContext>
  );

  // Primary open: pl-3, with the shared divider gutter on the right.
  // Primary collapsed: pl-5 for Launchpad alignment.
  // Only bleed the left so ProjectItem doesn't collide with the toggle.
  const headerPad = isPrimaryCollapsed
    ? cn("pl-5", LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS)
    : cn("pl-3", LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS);
  const projectHeaderBleed = isPrimaryCollapsed ? "-ml-5" : "-ml-3 -mr-1";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="pt-1.5">
        <div className={cn("flex min-h-10 items-center gap-1", headerPad)}>
          <div className="min-w-0 flex-1">
            {selectedProject ? (
              <div className={cn(projectHeaderBleed, "-mb-1")}>
                <ProjectItem
                  project={selectedProject}
                  isExpanded={false}
                  hideWorkspaceList={true}
                  disableRowClick={true}
                  onToggle={() => {}}
                  onAddWorkspace={onAddWorkspace}
                  onQuickAddWorkspace={onQuickAddWorkspace}
                  onSetColor={onSetColor}
                  onSetLogo={onSetLogo}
                  onDelete={onDeleteProject}
                  onPinWorkspace={onPinWorkspace}
                  onUnpinWorkspace={onUnpinWorkspace}
                  onArchiveWorkspace={onArchiveWorkspace}
                  onDeleteWorkspace={onDeleteWorkspace}
                  onUpdateWorkspaceWorkflowStatus={onUpdateWorkspaceWorkflowStatus}
                  onUpdateWorkspacePriority={onUpdateWorkspacePriority}
                  availableLabels={availableLabels}
                  onCreateWorkspaceLabel={onCreateWorkspaceLabel}
                  onUpdateWorkspaceLabel={onUpdateWorkspaceLabel}
                  onUpdateWorkspaceLabels={onUpdateWorkspaceLabels}
                  onUpdateWorkspaceName={onUpdateWorkspaceName}
                  onConfigureScripts={onConfigureScripts}
                  onSelectMain={onSelectMain}
                  isActiveProject={activeProjectId === selectedProject.id && !activeWorkspaceId}
                />
              </div>
            ) : (
              <div className="flex h-full items-center px-3 text-sm text-muted-foreground">
                {t("leftSidebarControls.selectProject")}
              </div>
            )}
          </div>
          <div className="shrink-0">
            <TwoColumnSidebarToggleButton
              collapsed={isPrimaryCollapsed}
              onClick={onTogglePrimaryPanel}
            />
          </div>
        </div>
      </div>
      <div
        className={cn(
          "scrollbar-on-hover flex-1 overflow-y-auto py-2 pl-3",
          LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS,
        )}
      >
        {!selectedProject ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">
            {t("leftSidebarControls.selectProjectDescription")}
          </div>
        ) : (
          <div className="space-y-2">
            {showPinnedSection && selectedProjectPinnedEntries.length > 0 ? (
              <Collapsible
                open={isPinnedExpanded}
                onOpenChange={onPinnedExpandedChange}
                className="space-y-1.5"
              >
                <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-[11px] font-semibold tracking-[0.03em] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                  <span className="truncate">{t("leftSidebarControls.pinned")}</span>
                  <ChevronRight className={cn("ml-1 size-3 shrink-0 opacity-0 transition-all duration-200 group-hover:opacity-100", isPinnedExpanded && "rotate-90")} />
                  <span className="ml-auto text-[10px] text-muted-foreground/80">
                    {selectedProjectPinnedEntries.length}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="overflow-hidden">
                    <div className="space-y-0.5 pl-3 pt-0.5">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => {
                          if (isPinnedSortingDisabled) return;
                          const { active, over } = event;
                          if (!over || active.id === over.id) return;
                          const oldIndex = selectedProjectPinnedEntries.findIndex((entry) => entry.workspace.id === active.id);
                          const newIndex = selectedProjectPinnedEntries.findIndex((entry) => entry.workspace.id === over.id);
                          if (oldIndex === -1 || newIndex === -1) return;
                          const reordered = arrayMove(selectedProjectPinnedEntries, oldIndex, newIndex);
                          void onUpdateWorkspacePinOrder(reordered.map((entry) => entry.workspace.id));
                        }}
                        modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
                      >
                        <SortableContext items={selectedProjectPinnedEntries.map((entry) => entry.workspace.id)} strategy={verticalListSortingStrategy}>
                          <div className={cn("space-y-0.5", secondColumnKanban && "space-y-2")}>
                            {selectedProjectPinnedEntries.map((entry) =>
                              secondColumnKanban ? (
                                isPinnedSortingDisabled ? (
                                  <div key={entry.workspace.id}>
                                    {renderWorkspaceKanbanCard(entry)}
                                  </div>
                                ) : (
                                  <SortableSidebarKanbanCard
                                    key={entry.workspace.id}
                                    workspaceId={entry.workspace.id}
                                  >
                                    {renderWorkspaceKanbanCard(entry)}
                                  </SortableSidebarKanbanCard>
                                )
                              ) : (
                                renderWorkspaceItemRow(entry, {
                                  sortingDisabled: isPinnedSortingDisabled,
                                  sortingDisabledMessage: t("leftSidebarControls.clearWorkspaceFiltersBeforeReordering"),
                                })
                              ),
                            )}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
            {showPinnedSection && selectedProjectPinnedEntries.length > 0 ? (
              <Collapsible
                open={isWorkspacesExpanded}
                onOpenChange={onWorkspacesExpandedChange}
                className="space-y-1.5"
              >
                <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-[11px] font-semibold tracking-[0.03em] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                  <span className="truncate">{t("leftSidebarControls.workspaces")}</span>
                  <ChevronRight className={cn("ml-1 size-3 shrink-0 opacity-0 transition-all duration-200 group-hover:opacity-100", isWorkspacesExpanded && "rotate-90")} />
                  <span className="ml-auto text-[10px] text-muted-foreground/80">
                    {selectedProjectUnpinnedWorkspaces.length}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="overflow-hidden">
                    <div className="pl-3 pt-0.5">
                      {unpinnedList}
                      {selectedProjectUnpinnedWorkspaces.length === 0 ? (
                        <div className="px-1 py-2 text-sm text-muted-foreground">
                          {t("leftSidebarControls.noWorkspaces")}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : (
              <section className="space-y-1.5">
                {unpinnedList}
                {selectedProjectUnpinnedWorkspaces.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground">
                    {t("leftSidebarControls.noWorkspaces")}
                  </div>
                ) : null}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function TwoColumnSidebarContent({
  autoSaveId,
  primaryPanelId,
  secondaryPanelId,
  storage,
  primaryPanelRef,
  isPrimaryCollapsed,
  primarySize,
  pinnedSection,
  leftContent,
  rightContent,
  onPrimaryCollapse,
  onPrimaryExpand,
  onPrimaryResize,
  onDividerDragging,
}: {
  autoSaveId: string;
  primaryPanelId: string;
  secondaryPanelId: string;
  storage: PanelGroupStorage;
  primaryPanelRef: React.RefObject<ImperativePanelHandle | null>;
  isPrimaryCollapsed: boolean;
  primarySize: number;
  pinnedSection: React.ReactNode;
  leftContent: React.ReactNode;
  rightContent: React.ReactNode;
  onPrimaryCollapse: () => void;
  onPrimaryExpand: () => void;
  onPrimaryResize: (size: number) => void;
  onDividerDragging: (dragging: boolean) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-1 min-h-0 min-w-0">
        <PanelGroup
          autoSaveId={autoSaveId}
          direction="horizontal"
          storage={storage}
          className="flex-1"
        >
          <Panel
            ref={primaryPanelRef}
            id={primaryPanelId}
            order={1}
            collapsible
            collapsedSize={0}
            defaultSize={primarySize}
            minSize={14}
            maxSize={76}
            className="min-w-0 overflow-hidden"
            onCollapse={onPrimaryCollapse}
            onExpand={onPrimaryExpand}
            onResize={onPrimaryResize}
          >
            <div className="flex h-full min-h-0 flex-col">
              {pinnedSection ? (
                <div className="pt-1.5">
                  {pinnedSection}
                </div>
              ) : null}
              <div className="flex-1 min-h-0 overflow-hidden">
                {leftContent}
              </div>
            </div>
          </Panel>
          {!isPrimaryCollapsed ? (
            <SidebarColumnResizeHandle onDragging={onDividerDragging} />
          ) : null}
          <Panel
            id={secondaryPanelId}
            order={2}
            defaultSize={100 - primarySize}
            minSize={24}
            maxSize={100}
            className="min-w-0"
          >
            <div data-sidebar-shortcut-scope="secondary" className="h-full min-h-0">
              {rightContent}
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
