"use client";

import React from "react";
import { TabsList, TabsTab, cn } from "@workspace/ui";
import { Folder, FolderKanban, FolderPlus, Plus, SquareKanban } from "lucide-react";
import type { LeftSidebarTab } from "@/shared/lib/nuqs/searchParams";
import type { Project, WorkspaceLabel } from "@/shared/types/domain";
import { WorkspaceKanbanView } from "@/app-shell/sidebar/WorkspaceKanbanView";
import {
  WorkspaceKanbanFilterMenu,
  type WorkspaceKanbanFilters,
} from "@/app-shell/sidebar/WorkspaceKanbanFilterMenu";
import type { SidebarGroupingMode } from "@/app-shell/sidebar/workspace-status";

type WorkspaceKanbanViewProps = React.ComponentProps<typeof WorkspaceKanbanView>;

export function LeftSidebarTabsHeader({
  activeTab,
  filesOnRight,
  isAddProjectReady,
  layoutLoaded,
  onAddProject,
  onTabChange,
}: {
  activeTab: LeftSidebarTab;
  filesOnRight: boolean;
  isAddProjectReady: boolean;
  layoutLoaded: boolean;
  onAddProject: () => void;
  onTabChange: (value: string) => void;
}) {
  return (
    <div className={cn("h-10 flex border-b border-sidebar-border", (filesOnRight || !layoutLoaded) && "hidden")}>
      <TabsList variant="underline" className="w-full h-full gap-0 items-stretch py-0!">
        <TabsTab
          value="projects"
          className="flex-1 h-full! text-[12px] p-0 overflow-hidden relative rounded-none border-0!"
        >
          <div
            className="w-full h-full flex items-center justify-center group cursor-pointer"
            onClick={(event) => {
              if (activeTab !== "projects" || !isAddProjectReady) return;
              event.stopPropagation();
              onAddProject();
            }}
          >
            <div className="flex items-center justify-center gap-0.5">
              <div className="relative size-3.5 shrink-0">
                <FolderKanban
                  className={cn(
                    "absolute inset-0 size-3.5 transition-transform duration-300",
                    activeTab === "projects" && isAddProjectReady && "group-hover:-translate-y-8",
                  )}
                />
                <Plus
                  className={cn(
                    "absolute inset-0 size-3.5 -translate-x-8 opacity-0 transition-all duration-300",
                    activeTab === "projects" && isAddProjectReady && "group-hover:translate-x-0 group-hover:opacity-100",
                  )}
                />
              </div>

              <div className="flex items-center whitespace-nowrap">
                <span
                  className={cn(
                    "inline-block overflow-hidden max-w-0 opacity-0 transition-all duration-300 ease-out text-left",
                    activeTab === "projects" && isAddProjectReady && "group-hover:max-w-[40px] group-hover:opacity-100",
                  )}
                >
                  Add&nbsp;
                </span>
                <span>Project</span>
                <span
                  className={cn(
                    "inline-block overflow-hidden transition-all duration-300 max-w-[10px]",
                    activeTab === "projects" &&
                      isAddProjectReady &&
                      "group-hover:max-w-0 group-hover:opacity-0 group-hover:translate-x-2",
                  )}
                >
                  s
                </span>
              </div>
            </div>
          </div>
        </TabsTab>
        <TabsTab
          value="files"
          className="flex-1 h-full! text-[12px] gap-1.5 rounded-none border-0!"
          onClick={() => onTabChange("files")}
        >
          <Folder className="size-3.5" />
          <span>Files</span>
        </TabsTab>
      </TabsList>
    </div>
  );
}

export function LeftSidebarFooter({
  activeTab,
  availableLabels,
  filesOnRight,
  filters,
  groupingMode,
  isKanbanExpanded,
  projects,
  onAddProject,
  onArchiveWorkspace,
  onCreateLabel,
  onDeleteWorkspace,
  onFiltersChange,
  onGroupingModeChange,
  onPinWorkspace,
  onUnpinWorkspace,
  onUpdateLabel,
  onUpdateLabels,
  onUpdatePriority,
  onUpdateWorkflowStatus,
}: {
  activeTab: LeftSidebarTab;
  availableLabels: WorkspaceLabel[];
  filesOnRight: boolean;
  filters: WorkspaceKanbanFilters;
  groupingMode: SidebarGroupingMode;
  isKanbanExpanded: boolean;
  projects: Project[];
  onAddProject: () => void;
  onArchiveWorkspace: WorkspaceKanbanViewProps["onArchiveWorkspace"];
  onCreateLabel: WorkspaceKanbanViewProps["onCreateLabel"];
  onDeleteWorkspace: WorkspaceKanbanViewProps["onDeleteWorkspace"];
  onFiltersChange: (filters: WorkspaceKanbanFilters) => void;
  onGroupingModeChange: (mode: SidebarGroupingMode) => void;
  onPinWorkspace: WorkspaceKanbanViewProps["onPinWorkspace"];
  onUnpinWorkspace: WorkspaceKanbanViewProps["onUnpinWorkspace"];
  onUpdateLabel: WorkspaceKanbanViewProps["onUpdateLabel"];
  onUpdateLabels: WorkspaceKanbanViewProps["onUpdateLabels"];
  onUpdatePriority: WorkspaceKanbanViewProps["onUpdatePriority"];
  onUpdateWorkflowStatus: WorkspaceKanbanViewProps["onUpdateWorkflowStatus"];
}) {
  if (activeTab !== "projects" && !filesOnRight) return null;

  return (
    <div className="relative shrink-0 border-t border-sidebar-border bg-transparent">
      <div className="relative flex items-center justify-between gap-1 px-1.5 py-0.5">
        <div className="flex items-center gap-0">
          <button
            type="button"
            title="Add Project"
            onClick={onAddProject}
            className="group inline-flex h-8 items-center gap-1 rounded-lg bg-transparent px-0.5 text-[11px] text-muted-foreground/90 transition-colors hover:text-sidebar-foreground"
          >
            <span className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover:text-sidebar-foreground">
              <FolderPlus className="size-3.5" />
            </span>
          </button>
        </div>
        <div className="flex items-center gap-0">
          <WorkspaceKanbanFilterMenu
            projects={projects}
            availableLabels={availableLabels}
            filters={filters}
            onFiltersChange={onFiltersChange}
            triggerVariant="icon"
            align="end"
            side="top"
            showGrouping={!isKanbanExpanded}
            groupingMode={groupingMode}
            onGroupingModeChange={onGroupingModeChange}
          />
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
            filters={filters}
            onFiltersChange={onFiltersChange}
            trigger={(
              <button
                type="button"
                className="group inline-flex h-8 items-center gap-1 rounded-lg bg-transparent px-0.5 text-[11px] text-muted-foreground/90 transition-colors hover:text-sidebar-foreground"
              >
                <span className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover:text-sidebar-foreground">
                  <SquareKanban className="size-3.5" />
                </span>
              </button>
            )}
          />
        </div>
      </div>
    </div>
  );
}
