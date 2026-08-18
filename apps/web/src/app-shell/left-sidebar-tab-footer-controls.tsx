"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FolderPlus, Settings } from "lucide-react";
import type { Group, Project, WorkspaceLabel } from "@/shared/types/domain";
import {
  WorkspaceKanbanFilterMenu,
  type WorkspaceKanbanFilters,
} from "@/app-shell/sidebar/WorkspaceKanbanFilterMenu";
import type { SidebarGroupingMode } from "@/app-shell/sidebar/workspace-status";
import { useOpenSettings } from "@/features/settings/lib/open-settings";
import { APP_FOOTER_HEIGHT_CLASS } from "@/app-shell/sidebar-layout-constants";
import { cn } from "@/shared/lib/utils";



function LeftSidebarSettingsButton() {
  const t = useTranslations("AppShell.chrome");
  const openSettings = useOpenSettings();
  const label = t("leftSidebarFooter.openSettings");

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => openSettings()}
      className="group relative inline-flex h-8 items-center gap-1 rounded-lg bg-transparent pl-0.5 pr-2 text-[11px] text-muted-foreground/90 transition-colors hover:text-sidebar-foreground"
    >
      <span className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover:text-sidebar-foreground">
        <Settings className="size-3.5" />
      </span>
    </button>
  );
}

export function LeftSidebarFooter({
  availableLabels,
  filters,
  groupingMode,
  groups = [],
  projects,
  onAddProject,
  onFiltersChange,
  onGroupingModeChange,
}: {
  availableLabels: WorkspaceLabel[];
  filters: WorkspaceKanbanFilters;
  groupingMode: SidebarGroupingMode;
  groups?: Group[];
  projects: Project[];
  onAddProject: () => void;
  onFiltersChange: (filters: WorkspaceKanbanFilters) => void;
  onGroupingModeChange: (mode: SidebarGroupingMode) => void;
}) {
  const t = useTranslations("AppShell.chrome");

  return (
    <div className={cn("relative shrink-0 bg-transparent", APP_FOOTER_HEIGHT_CLASS)}>
      <div className="relative flex h-full items-center justify-between gap-1 px-1.5">
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
        <div className="flex items-center">
          <WorkspaceKanbanFilterMenu
            projects={projects}
            availableLabels={availableLabels}
            groups={groups}
            filters={filters}
            onFiltersChange={onFiltersChange}
            triggerVariant="icon"
            triggerClassName="pr-0.5"
            align="end"
            side="top"
            showGrouping
            groupingMode={groupingMode}
            onGroupingModeChange={onGroupingModeChange}
          />
          <LeftSidebarSettingsButton />
        </div>
      </div>
    </div>
  );
}
