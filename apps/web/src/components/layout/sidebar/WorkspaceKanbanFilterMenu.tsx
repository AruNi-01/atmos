"use client";

import React from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  cn,
} from "@workspace/ui";
import type {
  Project,
  WorkspaceLabel,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/types/types";
import {
  WORKSPACE_WORKFLOW_STATUS_OPTIONS,
} from "@/components/layout/sidebar/workspace-status";
import {
  WORKSPACE_PRIORITY_OPTIONS,
} from "@/components/layout/sidebar/workspace-metadata-controls";
import {
  Check,
  CircleCheck,
  Flag,
  Folder,
  ListFilter,
  Tags,
} from "lucide-react";

export type WorkspaceKanbanFilters = {
  statuses: WorkspaceWorkflowStatus[];
  priorities: WorkspacePriority[];
  labelIds: string[];
  projectIds: string[];
};

export const EMPTY_WORKSPACE_KANBAN_FILTERS: WorkspaceKanbanFilters = {
  statuses: [],
  priorities: [],
  labelIds: [],
  projectIds: [],
};

export function getActiveWorkspaceKanbanFilterCount(filters: WorkspaceKanbanFilters) {
  return filters.statuses.length + filters.priorities.length + filters.labelIds.length + filters.projectIds.length;
}

export function filterWorkspaceKanbanEntries<T extends {
  projectId: string;
  workspace: {
    workflowStatus: WorkspaceWorkflowStatus;
    priority: WorkspacePriority;
    labels: WorkspaceLabel[];
  };
}>(items: T[], filters: WorkspaceKanbanFilters): T[] {
  return items.filter((item) => {
    if (filters.projectIds.length > 0 && !filters.projectIds.includes(item.projectId)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(item.workspace.workflowStatus)) return false;
    if (filters.priorities.length > 0 && !filters.priorities.includes(item.workspace.priority)) return false;
    if (
      filters.labelIds.length > 0 &&
      !item.workspace.labels.some((label) => filters.labelIds.includes(label.id))
    ) return false;

    return true;
  });
}

type WorkspaceKanbanFilterMenuProps = {
  projects: Project[];
  availableLabels: WorkspaceLabel[];
  filters: WorkspaceKanbanFilters;
  onFiltersChange: (filters: WorkspaceKanbanFilters) => void;
  triggerVariant?: "button" | "icon";
  align?: "start" | "end" | "center";
  side?: "top" | "right" | "bottom" | "left";
  showLabel?: boolean;
};

export function WorkspaceKanbanFilterMenu({
  projects,
  availableLabels,
  filters,
  onFiltersChange,
  triggerVariant = "button",
  align = "start",
  side,
  showLabel = triggerVariant === "button",
}: WorkspaceKanbanFilterMenuProps) {
  const [labelFilterQuery, setLabelFilterQuery] = React.useState("");
  const [projectFilterQuery, setProjectFilterQuery] = React.useState("");
  const activeFilterCount = getActiveWorkspaceKanbanFilterCount(filters);

  const filteredLabelOptions = React.useMemo(() => {
    const q = labelFilterQuery.trim().toLowerCase();
    if (!q) return availableLabels;
    return availableLabels.filter((label) => label.name.toLowerCase().includes(q));
  }, [availableLabels, labelFilterQuery]);

  const filteredProjectOptions = React.useMemo(() => {
    const q = projectFilterQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) => project.name.toLowerCase().includes(q));
  }, [projectFilterQuery, projects]);

  const toggleStatus = (value: WorkspaceWorkflowStatus) =>
    onFiltersChange({
      ...filters,
      statuses: filters.statuses.includes(value)
        ? filters.statuses.filter((item) => item !== value)
        : [...filters.statuses, value],
    });

  const togglePriority = (value: WorkspacePriority) =>
    onFiltersChange({
      ...filters,
      priorities: filters.priorities.includes(value)
        ? filters.priorities.filter((item) => item !== value)
        : [...filters.priorities, value],
    });

  const toggleLabel = (value: string) =>
    onFiltersChange({
      ...filters,
      labelIds: filters.labelIds.includes(value)
        ? filters.labelIds.filter((item) => item !== value)
        : [...filters.labelIds, value],
    });

  const toggleProject = (value: string) =>
    onFiltersChange({
      ...filters,
      projectIds: filters.projectIds.includes(value)
        ? filters.projectIds.filter((item) => item !== value)
        : [...filters.projectIds, value],
    });

  const clearAllFilters = () => onFiltersChange(EMPTY_WORKSPACE_KANBAN_FILTERS);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {triggerVariant === "icon" ? (
          <button
            type="button"
            className="group relative inline-flex h-8 items-center gap-1 rounded-lg bg-transparent px-2 text-[11px] text-muted-foreground/90 transition-colors hover:text-sidebar-foreground"
          >
            {activeFilterCount > 0 ? (
              <span className="absolute right-0 top-0 inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            ) : null}
            <span className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover:text-sidebar-foreground">
              <ListFilter className="size-3.5" />
            </span>
          </button>
        ) : (
          <Button size="xs" variant="secondary" className="relative">
            {activeFilterCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            ) : null}
            <ListFilter className={cn("size-4", showLabel && "mr-1")} />
            {showLabel ? "Filter" : null}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-64 p-1">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Folder className="size-4" />
            Project
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <div className="p-2">
              <Input
                value={projectFilterQuery}
                onChange={(e) => setProjectFilterQuery(e.target.value)}
                placeholder="Search projects..."
                className="h-7 text-xs"
              />
            </div>
            {filteredProjectOptions.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No matching projects</div>
            ) : (
              filteredProjectOptions.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    toggleProject(project.id);
                  }}
                  className="cursor-pointer"
                >
                  <span>{project.name}</span>
                  {filters.projectIds.includes(project.id) ? <Check className="ml-auto size-4" /> : null}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CircleCheck className="size-4" />
            Status
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            {WORKSPACE_WORKFLOW_STATUS_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onSelect={(e) => {
                  e.preventDefault();
                  toggleStatus(option.value);
                }}
                className="cursor-pointer"
              >
                <option.icon className={cn("size-4", option.className)} />
                <span>{option.label}</span>
                {filters.statuses.includes(option.value) ? <Check className="ml-auto size-4" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Flag className="size-4" />
            Priority
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            {WORKSPACE_PRIORITY_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onSelect={(e) => {
                  e.preventDefault();
                  togglePriority(option.value);
                }}
                className="cursor-pointer"
              >
                <option.icon className={cn("size-4", option.className)} />
                <span>{option.label}</span>
                {filters.priorities.includes(option.value) ? <Check className="ml-auto size-4" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Tags className="size-4" />
            Labels
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <div className="p-2">
              <Input
                value={labelFilterQuery}
                onChange={(e) => setLabelFilterQuery(e.target.value)}
                placeholder="Search labels..."
                className="h-7 text-xs"
              />
            </div>
            {filteredLabelOptions.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No matching labels</div>
            ) : (
              filteredLabelOptions.map((label) => (
                <DropdownMenuItem
                  key={label.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    toggleLabel(label.id);
                  }}
                  className="cursor-pointer"
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} />
                  <span>{label.name}</span>
                  {filters.labelIds.includes(label.id) ? <Check className="ml-auto size-4" /> : null}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {activeFilterCount > 0 ? (
          <>
            <DropdownMenuSeparator className="mx-2" />
            <DropdownMenuItem
              onClick={clearAllFilters}
              className="text-xs font-medium text-muted-foreground"
            >
              Clear All Filters
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
