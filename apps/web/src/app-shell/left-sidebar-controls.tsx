"use client";

import React from "react";
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
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Project, Workspace, WorkspaceLabel } from "@/shared/types/domain";
import { ProjectItem, type ProjectItemProps } from "@/app-shell/sidebar/ProjectItem";
import { SortableProject } from "@/app-shell/sidebar/SortableProject";
import { WorkspaceContent } from "@/app-shell/sidebar/WorkspaceContent";
import {
  getWorkspaceWorkflowStatusMeta,
  type SidebarGroupingMode,
} from "@/app-shell/sidebar/workspace-status";
import type { FlattenedWorkspaceEntry } from "@/app-shell/sidebar/workspace-grouping";
export { LeftSidebarFooter, LeftSidebarTabsHeader } from "./left-sidebar-tab-footer-controls";

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
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label={collapsed ? "Expand first column" : "Collapse first column"}
      title={collapsed ? "Expand first column" : "Collapse first column"}
    >
      {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
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
        "relative flex h-full self-stretch w-px items-center justify-center bg-sidebar-border/70 transition-colors duration-200 hover:bg-sidebar-border group touch-none",
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

export type WorkspaceGroup = {
  key: string;
  label: string;
  items: FlattenedWorkspaceEntry[];
};

export function GroupedWorkspaceOneColumnContent({
  collapsedWorkspaceGroups,
  groupingMode,
  groups,
  renderWorkspaceContentRow,
  toggleWorkspaceGroup,
}: {
  collapsedWorkspaceGroups: Record<string, boolean>;
  groupingMode: SidebarGroupingMode;
  groups: WorkspaceGroup[];
  renderWorkspaceContentRow: (
    entry: FlattenedWorkspaceEntry,
    options?: { showProjectName?: boolean; rightContext?: React.ReactNode },
  ) => React.ReactNode;
  toggleWorkspaceGroup: (stateKey: string) => void;
}) {
  return (
    <div className="scrollbar-on-hover h-full overflow-y-auto no-scrollbar">
      <div className="space-y-0.5 px-2">
        {groups.map((group) => {
          const stateKey = `${groupingMode}:${group.key}`;
          const isCollapsed = collapsedWorkspaceGroups[stateKey] ?? false;
          const statusMeta = groupingMode === "status"
            ? getWorkspaceWorkflowStatusMeta(group.key as Parameters<typeof getWorkspaceWorkflowStatusMeta>[0])
            : null;
          const StatusIcon = statusMeta?.icon;

          return (
            <section key={group.key} className="space-y-1.5">
              <button
                type="button"
                onClick={() => toggleWorkspaceGroup(stateKey)}
                className="group flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-[11px] font-semibold tracking-[0.03em] text-muted-foreground transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
              >
                {StatusIcon ? (
                  <StatusIcon className={cn("size-3.5 shrink-0", statusMeta?.className)} />
                ) : null}
                <span className="truncate">{group.label}</span>
                <ChevronRight
                  className={cn(
                    "ml-1 size-3 shrink-0 opacity-0 transition-all duration-200 group-hover:opacity-100",
                    !isCollapsed && "rotate-90",
                  )}
                />
                <span className="ml-auto text-[10px] font-medium normal-case tracking-normal text-muted-foreground/80">
                  {group.items.length}
                </span>
              </button>
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-300 ease-out",
                  isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
                )}
              >
                <div className="overflow-hidden">
                  <div className="space-y-1 pl-3 pt-0.5">
                    {group.items.map((entry) => renderWorkspaceContentRow(entry, { showProjectName: true }))}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
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
  return (
    <div className="scrollbar-on-hover h-full overflow-y-auto px-2 py-1.5">
      <div className="space-y-1">
        {groups.map((group) => {
          const statusMeta = groupingMode === "status"
            ? getWorkspaceWorkflowStatusMeta(group.key as Parameters<typeof getWorkspaceWorkflowStatusMeta>[0])
            : null;
          const StatusIcon = statusMeta?.icon;
          const isSelected = effectiveSelectedWorkspaceGroupKey === group.key;

          return (
            <button
              key={group.key}
              type="button"
              onClick={() => onSelectGroup(group.key)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-[11px] font-semibold tracking-[0.03em] transition-colors",
                isSelected
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
              )}
            >
              {StatusIcon ? (
                <StatusIcon className={cn("size-3.5 shrink-0", statusMeta?.className)} />
              ) : null}
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
  isPrimaryCollapsed,
  selectedGroup,
  secondColumnKanban,
  renderWorkspaceContentRow,
  renderWorkspaceKanbanCard,
  onTogglePrimaryPanel,
}: {
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
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-sidebar-border">
        <div className="flex min-h-10 items-center gap-1 px-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-sidebar-foreground">
                {selectedGroup?.label ?? "Select a group"}
              </div>
            </div>
          </div>
          <div className="shrink-0 pr-0.5">
            <TwoColumnSidebarToggleButton
              collapsed={isPrimaryCollapsed}
              onClick={onTogglePrimaryPanel}
            />
          </div>
        </div>
      </div>
      <div className="scrollbar-on-hover flex-1 overflow-y-auto px-2 py-2">
        {!selectedGroup ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">
            Select a group to browse its workspaces.
          </div>
        ) : (
          <div className={cn("space-y-1", secondColumnKanban && "space-y-2")}>
            {selectedGroup.items.map((entry) =>
              secondColumnKanban ? (
                <div key={entry.workspace.id}>
                  {renderWorkspaceKanbanCard(entry)}
                </div>
              ) : (
                renderWorkspaceContentRow(entry, { showProjectName: true })
              ),
            )}
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
      <SortableContext items={selectedProjectUnpinnedWorkspaces.map((workspace) => workspace.id)} strategy={verticalListSortingStrategy}>
        <div className={cn("space-y-0.5", secondColumnKanban && "space-y-2")}>
          {selectedProjectUnpinnedWorkspaces.map((workspace) => {
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
    </DndContext>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-sidebar-border">
        <div className="flex min-h-10 items-center gap-1 px-2">
          <div className="min-w-0 flex-1">
            {selectedProject ? (
              <div className="-mx-2 -mb-1">
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
                Select a project
              </div>
            )}
          </div>
          <div className="shrink-0 pr-0.5">
            <TwoColumnSidebarToggleButton
              collapsed={isPrimaryCollapsed}
              onClick={onTogglePrimaryPanel}
            />
          </div>
        </div>
      </div>
      <div className="scrollbar-on-hover flex-1 overflow-y-auto px-2 py-2">
        {!selectedProject ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">
            Select a project to browse its workspaces.
          </div>
        ) : (
          <div className="space-y-2">
            {showPinnedSection && selectedProjectPinnedEntries.length > 0 ? (
              <Collapsible
                open={isPinnedExpanded}
                onOpenChange={onPinnedExpandedChange}
                className="space-y-1.5"
              >
                <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-[11px] font-semibold tracking-[0.03em] text-muted-foreground transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground">
                  <span className="truncate">Pinned</span>
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
                                  sortingDisabledMessage: "Clear workspace filters before reordering pinned workspaces.",
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
                <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-[11px] font-semibold tracking-[0.03em] text-muted-foreground transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground">
                  <span className="truncate">Workspaces</span>
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
                          No workspaces.
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
                    No workspaces.
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
            {rightContent}
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
