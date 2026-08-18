"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  Switch,
  cn,
} from "@workspace/ui";
import type {
  Group,
  Project,
  WorkspaceCreateSource,
  WorkspaceLabel,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";
import {
  SIDEBAR_GROUPING_OPTIONS,
  WORKSPACE_WORKFLOW_STATUS_OPTIONS,
  type SidebarGroupingMode,
} from "@/app-shell/sidebar/workspace-status";
import {
  WORKSPACE_PRIORITY_OPTIONS,
} from "@/app-shell/sidebar/workspace-metadata-controls";
import {
  Check,
  Folders,
  ListFilter,
  Timer,
} from "lucide-react";
import { resolveBoardColor, resolveWorkspaceGroupId } from "@/app-shell/sidebar/kanban-columns";
import { UNGROUPED_USER_GROUP_KEY } from "@/app-shell/sidebar/user-groups";

export type WorkspaceKanbanFilters = {
  statuses: WorkspaceWorkflowStatus[];
  priorities: WorkspacePriority[];
  labelIds: string[];
  projectIds: string[];
  /** Group ids, or `__ungrouped__` for no group membership. */
  groupIds: string[];
  showAutomationWorkspaces: boolean;
};

export const EMPTY_WORKSPACE_KANBAN_FILTERS: WorkspaceKanbanFilters = {
  statuses: [],
  priorities: [],
  labelIds: [],
  projectIds: [],
  groupIds: [],
  showAutomationWorkspaces: false,
};

export function getActiveWorkspaceKanbanFilterCount(filters: WorkspaceKanbanFilters) {
  return (
    filters.statuses.length +
    filters.priorities.length +
    filters.labelIds.length +
    filters.projectIds.length +
    filters.groupIds.length
  );
}

export function shouldApplyWorkspaceKanbanVisibilityFilter(filters: WorkspaceKanbanFilters) {
  return getActiveWorkspaceKanbanFilterCount(filters) > 0 || !filters.showAutomationWorkspaces;
}

export function filterWorkspaceKanbanEntries<T extends {
  projectId: string;
  workspace: {
    id: string;
    workflowStatus: WorkspaceWorkflowStatus;
    priority: WorkspacePriority;
    labels: WorkspaceLabel[];
    createSource?: WorkspaceCreateSource;
  };
}>(items: T[], filters: WorkspaceKanbanFilters, groups: Group[] = []): T[] {
  return items.filter((item) => {
    if (!filters.showAutomationWorkspaces && item.workspace.createSource === "automation") return false;
    if (filters.projectIds.length > 0 && !filters.projectIds.includes(item.projectId)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(item.workspace.workflowStatus)) return false;
    if (filters.priorities.length > 0 && !filters.priorities.includes(item.workspace.priority)) return false;
    if (
      filters.labelIds.length > 0 &&
      !item.workspace.labels.some((label) => filters.labelIds.includes(label.id))
    ) return false;
    if (filters.groupIds.length > 0) {
      const groupId = resolveWorkspaceGroupId(groups, item.projectId, item.workspace.id);
      const key = groupId ?? UNGROUPED_USER_GROUP_KEY;
      if (!filters.groupIds.includes(key)) return false;
    }

    return true;
  });
}

type WorkspaceKanbanFilterMenuProps = {
  projects: Project[];
  availableLabels: WorkspaceLabel[];
  groups?: Group[];
  filters: WorkspaceKanbanFilters;
  onFiltersChange: (filters: WorkspaceKanbanFilters) => void;
  triggerVariant?: "button" | "icon";
  align?: "start" | "end" | "center";
  side?: "top" | "right" | "bottom" | "left";
  showLabel?: boolean;
  /** Sidebar list view only — hidden in expanded Kanban dialog */
  showGrouping?: boolean;
  groupingMode?: SidebarGroupingMode;
  onGroupingModeChange?: (mode: SidebarGroupingMode) => void;
  triggerClassName?: string;
};

/** Icons aligned with SIDEBAR_GROUPING_OPTIONS for Group By + Filter. */
const GROUPING_ICON_BY_MODE = Object.fromEntries(
  SIDEBAR_GROUPING_OPTIONS.map((option) => [option.value, option.icon]),
) as Record<SidebarGroupingMode, React.ComponentType<{ className?: string }>>;

export function WorkspaceKanbanFilterMenu({
  projects,
  availableLabels,
  groups = [],
  filters,
  onFiltersChange,
  triggerVariant = "button",
  align = "start",
  side,
  showLabel = triggerVariant === "button",
  showGrouping = false,
  groupingMode = "project",
  onGroupingModeChange,
  triggerClassName,
}: WorkspaceKanbanFilterMenuProps) {
  const t = useTranslations("appShell.task");
  const groupsT = useTranslations("appShell.groups");
  const [labelFilterQuery, setLabelFilterQuery] = React.useState("");
  const [projectFilterQuery, setProjectFilterQuery] = React.useState("");
  const [groupFilterQuery, setGroupFilterQuery] = React.useState("");
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

  const filteredGroupOptions = React.useMemo(() => {
    const ordered = groups.slice().sort((a, b) => a.sidebarOrder - b.sidebarOrder);
    const q = groupFilterQuery.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((group) => group.name.toLowerCase().includes(q));
  }, [groupFilterQuery, groups]);

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

  const toggleGroup = (value: string) =>
    onFiltersChange({
      ...filters,
      groupIds: filters.groupIds.includes(value)
        ? filters.groupIds.filter((item) => item !== value)
        : [...filters.groupIds, value],
    });

  const toggleAutomationWorkspaces = (value: boolean) =>
    onFiltersChange({
      ...filters,
      showAutomationWorkspaces: value,
    });

  const clearAllFilters = () => onFiltersChange(EMPTY_WORKSPACE_KANBAN_FILTERS);

  const ProjectIcon = GROUPING_ICON_BY_MODE.project;
  const GroupIcon = GROUPING_ICON_BY_MODE.group;
  const StatusIcon = GROUPING_ICON_BY_MODE.status;
  const PriorityIcon = GROUPING_ICON_BY_MODE.priority;
  const LabelIcon = GROUPING_ICON_BY_MODE.label;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {triggerVariant === "icon" ? (
          <button
            type="button"
            className={cn(
              "group relative inline-flex h-8 items-center gap-1 rounded-lg bg-transparent px-2 text-[11px] text-muted-foreground/90 transition-colors hover:text-sidebar-foreground",
              triggerClassName,
            )}
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
          <Button
            size="xs"
            variant="secondary"
            // Match Task source tabs + trailing tools (h-7). size=xs defaults to sm:h-6.
            className="relative h-7 gap-1 px-2.5 text-xs sm:h-7"
          >
            {activeFilterCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            ) : null}
            <ListFilter className={cn("size-3.5", showLabel && "mr-1")} />
            {showLabel ? t("filter.trigger") : null}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-64 p-1">
        {showGrouping && onGroupingModeChange ? (
          <>
            <DropdownMenuLabel className="px-2 py-1 text-xs font-medium text-muted-foreground">
              {t("grouping.sectionLabel")}
            </DropdownMenuLabel>
            {SIDEBAR_GROUPING_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onSelect={(e) => {
                  e.preventDefault();
                  onGroupingModeChange(option.value);
                }}
                className="cursor-pointer"
              >
                <option.icon className="size-4 text-muted-foreground" />
                <span>{t(option.labelKey)}</span>
                {groupingMode === option.value ? <Check className="ml-auto size-4" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="mx-2" />
            <DropdownMenuLabel className="px-2 py-1 text-xs font-medium text-muted-foreground">
              {t("filter.sectionLabel")}
            </DropdownMenuLabel>
          </>
        ) : null}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ProjectIcon className="size-4" />
            <span className="min-w-0 flex-1 truncate">{t("filter.project")}</span>
            {filters.projectIds.length > 0 ? (
              <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                {filters.projectIds.length}
              </span>
            ) : null}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <div className="p-2">
              <Input
                value={projectFilterQuery}
                onChange={(e) => setProjectFilterQuery(e.target.value)}
                placeholder={t("filter.searchProjects")}
                className="h-7 text-xs"
              />
            </div>
            {filteredProjectOptions.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("filter.noMatchingProjects")}</div>
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
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: resolveBoardColor(project.borderColor) }}
                  />
                  <span className="truncate">{project.name}</span>
                  {filters.projectIds.includes(project.id) ? <Check className="ml-auto size-4" /> : null}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <GroupIcon className="size-4" />
            <span className="min-w-0 flex-1 truncate">{t("filter.group")}</span>
            {filters.groupIds.length > 0 ? (
              <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                {filters.groupIds.length}
              </span>
            ) : null}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <div className="p-2">
              <Input
                value={groupFilterQuery}
                onChange={(e) => setGroupFilterQuery(e.target.value)}
                placeholder={t("filter.searchGroups")}
                className="h-7 text-xs"
              />
            </div>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                toggleGroup(UNGROUPED_USER_GROUP_KEY);
              }}
              className="cursor-pointer"
            >
              <Folders className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{groupsT("ungrouped")}</span>
              {filters.groupIds.includes(UNGROUPED_USER_GROUP_KEY) ? (
                <Check className="ml-auto size-4" />
              ) : null}
            </DropdownMenuItem>
            {filteredGroupOptions.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("filter.noMatchingGroups")}</div>
            ) : (
              filteredGroupOptions.map((group) => (
                <DropdownMenuItem
                  key={group.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    toggleGroup(group.id);
                  }}
                  className="cursor-pointer"
                >
                  <Folders className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{group.name}</span>
                  {filters.groupIds.includes(group.id) ? <Check className="ml-auto size-4" /> : null}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <StatusIcon className="size-4" />
            <span className="min-w-0 flex-1 truncate">{t("filter.status")}</span>
            {filters.statuses.length > 0 ? (
              <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                {filters.statuses.length}
              </span>
            ) : null}
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
                <span>{t(option.labelKey)}</span>
                {filters.statuses.includes(option.value) ? <Check className="ml-auto size-4" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <PriorityIcon className="size-4" />
            <span className="min-w-0 flex-1 truncate">{t("filter.priority")}</span>
            {filters.priorities.length > 0 ? (
              <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                {filters.priorities.length}
              </span>
            ) : null}
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
                <span>{t(option.labelKey)}</span>
                {filters.priorities.includes(option.value) ? <Check className="ml-auto size-4" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <LabelIcon className="size-4" />
            <span className="min-w-0 flex-1 truncate">{t("filter.labels")}</span>
            {filters.labelIds.length > 0 ? (
              <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                {filters.labelIds.length}
              </span>
            ) : null}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <div className="p-2">
              <Input
                value={labelFilterQuery}
                onChange={(e) => setLabelFilterQuery(e.target.value)}
                placeholder={t("filter.searchLabels")}
                className="h-7 text-xs"
              />
            </div>
            {filteredLabelOptions.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("filter.noMatchingLabels")}</div>
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
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: resolveBoardColor(label.color) }}
                  />
                  <span className="truncate">{label.name}</span>
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
              {t("filter.clearAll")}
            </DropdownMenuItem>
          </>
        ) : null}

        <DropdownMenuCheckboxItem
          checked={filters.showAutomationWorkspaces}
          onCheckedChange={(checked) => toggleAutomationWorkspaces(Boolean(checked))}
          onSelect={(e) => e.preventDefault()}
          className="cursor-pointer pl-2 [&>span:first-child]:hidden"
        >
          <Timer className="size-4 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{t("filter.automationWorkspace")}</span>
          <Switch
            checked={filters.showAutomationWorkspaces}
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none ml-auto"
          />
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
