"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { TabsList, TabsTab, cn } from "@workspace/ui";
import { Folder, FolderKanban, FolderPlus } from "lucide-react";
import type { LeftSidebarTab } from "@/shared/lib/nuqs/searchParams";
import type { Project, WorkspaceLabel } from "@/shared/types/domain";
import {
  WorkspaceKanbanFilterMenu,
  type WorkspaceKanbanFilters,
} from "@/app-shell/sidebar/WorkspaceKanbanFilterMenu";
import type { SidebarGroupingMode } from "@/app-shell/sidebar/workspace-status";
import type { Group } from "@/shared/types/domain";

export function LeftSidebarTabsHeader({
  filesOnRight,
  layoutLoaded,
  onTabChange,
}: {
  filesOnRight: boolean;
  layoutLoaded: boolean;
  onTabChange: (value: string) => void;
}) {
  const t = useTranslations("AppShell.chrome");

  return (
    <div className={cn("h-10 flex border-b border-sidebar-border", (filesOnRight || !layoutLoaded) && "hidden")}>
      <TabsList variant="underline" className="w-full h-full gap-0 items-stretch py-0!">
        <TabsTab
          value="projects"
          className="flex-1 h-full! text-[12px] p-0 overflow-hidden relative rounded-none border-0!"
        >
          <div className="flex h-full w-full cursor-pointer items-center justify-center gap-0.5">
            <FolderKanban className="size-3.5 shrink-0" />
            <span className="whitespace-nowrap">{t("leftSidebarTabsHeader.projects")}</span>
          </div>
        </TabsTab>
        <TabsTab
          value="files"
          className="flex-1 h-full! text-[12px] gap-1.5 rounded-none border-0!"
          onClick={() => onTabChange("files")}
        >
          <Folder className="size-3.5" />
          <span>{t("common.files")}</span>
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
  groups = [],
  projects,
  onAddProject,
  onFiltersChange,
  onGroupingModeChange,
}: {
  activeTab: LeftSidebarTab;
  availableLabels: WorkspaceLabel[];
  filesOnRight: boolean;
  filters: WorkspaceKanbanFilters;
  groupingMode: SidebarGroupingMode;
  groups?: Group[];
  projects: Project[];
  onAddProject: () => void;
  onFiltersChange: (filters: WorkspaceKanbanFilters) => void;
  onGroupingModeChange: (mode: SidebarGroupingMode) => void;
}) {
  const t = useTranslations("AppShell.chrome");

  if (activeTab !== "projects" && !filesOnRight) return null;

  return (
    <div className="relative shrink-0 border-t border-sidebar-border bg-transparent">
      <div className="relative flex items-center justify-between gap-1 px-1.5 py-0.5">
        <div className="flex items-center gap-0">
          <button
            type="button"
            title={t("leftSidebarFooter.addProject")}
            aria-label={t("leftSidebarFooter.addProject")}
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
            groups={groups}
            filters={filters}
            onFiltersChange={onFiltersChange}
            triggerVariant="icon"
            align="end"
            side="top"
            showGrouping
            groupingMode={groupingMode}
            onGroupingModeChange={onGroupingModeChange}
          />
        </div>
      </div>
    </div>
  );
}
