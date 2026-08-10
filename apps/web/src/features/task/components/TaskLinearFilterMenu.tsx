"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  cn,
} from "@workspace/ui";
import {
  Check,
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  FolderKanban,
  Layers,
  LayoutList,
  ListFilter,
  Tag,
  User,
  Users,
  XCircle,
} from "lucide-react";
import type { Project } from "@/shared/types/domain";

export type LinearIssuePreset = "active" | "backlog" | "all";

/** Linear workflow state types (status filter). */
export type LinearStateType =
  | "backlog"
  | "unstarted"
  | "started"
  | "completed"
  | "canceled";

export const LINEAR_STATE_TYPES: LinearStateType[] = [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
];

export type TaskLinearFilters = {
  preset: LinearIssuePreset;
  /** Multi-select workflow status (state type). Empty = any. */
  stateTypes: LinearStateType[];
  /** Multi-select assignee user ids. Empty = any. */
  assigneeIds: string[];
  /** Multi-select label ids (OR). Empty = any. */
  labelIds: string[];
  teamId: string;
  projectId: string;
  /** Atmos project used when creating a workspace from an issue. */
  atmosProjectId: string;
};

export const DEFAULT_TASK_LINEAR_FILTERS: TaskLinearFilters = {
  preset: "all",
  stateTypes: [],
  assigneeIds: [],
  labelIds: [],
  teamId: "",
  projectId: "",
  atmosProjectId: "",
};

export function getActiveTaskLinearFilterCount(filters: TaskLinearFilters) {
  return (
    (filters.preset !== "all" ? 1 : 0) +
    (filters.stateTypes.length > 0 ? 1 : 0) +
    (filters.assigneeIds.length > 0 ? 1 : 0) +
    (filters.labelIds.length > 0 ? 1 : 0) +
    (filters.teamId ? 1 : 0) +
    (filters.projectId ? 1 : 0)
  );
}

type TeamOption = { id: string; name: string; key: string };
type ProjectOption = { id: string; name: string };
type UserOption = { id: string; name: string; avatar_url?: string | null };
type LabelOption = { id: string; name: string; color?: string | null };

type TaskLinearFilterMenuProps = {
  filters: TaskLinearFilters;
  onFiltersChange: (filters: TaskLinearFilters) => void;
  teams: TeamOption[];
  linearProjects: ProjectOption[];
  users: UserOption[];
  labels: LabelOption[];
  atmosProjects: Project[];
};

const PRESET_VALUES: LinearIssuePreset[] = ["active", "backlog", "all"];

function StatusTypeIcon({ type }: { type: LinearStateType }) {
  const base = "size-3.5 shrink-0";
  switch (type) {
    case "completed":
      return <CheckCircle2 className={cn(base, "text-indigo-400")} aria-hidden />;
    case "canceled":
      return (
        <XCircle className={cn(base, "text-muted-foreground/70")} aria-hidden />
      );
    case "started":
      return (
        <span className="relative inline-flex size-3.5 shrink-0 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-[1.5px] border-yellow-500/90" />
          <span
            className="absolute inset-0 overflow-hidden rounded-full"
            style={{ clipPath: "inset(0 50% 0 0)" }}
          >
            <span className="absolute inset-0 rounded-full bg-yellow-500/90" />
          </span>
        </span>
      );
    case "backlog":
      return (
        <CircleDashed className={cn(base, "text-muted-foreground")} aria-hidden />
      );
    case "unstarted":
    default:
      return <Circle className={cn(base, "text-muted-foreground")} aria-hidden />;
  }
}

/**
 * Compact Filter control for the Linear task list.
 * View (Active / Backlog / All), Status (workflow state type), Team, Project, Atmos project.
 */
export function TaskLinearFilterMenu({
  filters,
  onFiltersChange,
  teams,
  linearProjects,
  users,
  labels,
  atmosProjects,
}: TaskLinearFilterMenuProps) {
  const t = useTranslations("appShell.task.linear");
  const [open, setOpen] = React.useState(false);
  const activeCount = getActiveTaskLinearFilterCount(filters);

  const presetLabel = t(`presets.${filters.preset}`);
  const statusLabel =
    filters.stateTypes.length === 0
      ? t("filter.allStatuses")
      : filters.stateTypes.length === 1
        ? t(`statusTypes.${filters.stateTypes[0]!}`)
        : t("filter.statusCount", { count: filters.stateTypes.length });
  const assigneeLabel =
    filters.assigneeIds.length === 0
      ? t("filter.allAssignees")
      : filters.assigneeIds.length === 1
        ? (users.find((u) => u.id === filters.assigneeIds[0])?.name ??
          filters.assigneeIds[0]!)
        : t("filter.assigneeCount", { count: filters.assigneeIds.length });
  const labelsLabel =
    filters.labelIds.length === 0
      ? t("filter.allLabels")
      : filters.labelIds.length === 1
        ? (labels.find((l) => l.id === filters.labelIds[0])?.name ??
          filters.labelIds[0]!)
        : t("filter.labelCount", { count: filters.labelIds.length });
  const teamLabel = filters.teamId
    ? (teams.find((team) => team.id === filters.teamId)?.name ?? filters.teamId)
    : t("filter.allTeams");
  const projectLabel = filters.projectId
    ? (linearProjects.find((p) => p.id === filters.projectId)?.name ?? filters.projectId)
    : t("filter.allProjects");
  const atmosLabel =
    atmosProjects.find((p) => p.id === filters.atmosProjectId)?.name ??
    t("filter.atmosProject");

  const toggleStateType = (type: LinearStateType) => {
    const has = filters.stateTypes.includes(type);
    const next = has
      ? filters.stateTypes.filter((s) => s !== type)
      : [...filters.stateTypes, type];
    onFiltersChange({ ...filters, stateTypes: next });
  };

  const toggleId = (key: "assigneeIds" | "labelIds", id: string) => {
    const current = filters[key];
    const has = current.includes(id);
    const next = has ? current.filter((x) => x !== id) : [...current, id];
    onFiltersChange({ ...filters, [key]: next });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 border-border/70 px-2 text-[11px] font-medium text-muted-foreground shadow-none sm:h-8",
            activeCount > 0 && "border-foreground/25 bg-muted text-foreground",
          )}
          aria-label={t("filter.trigger")}
        >
          <ListFilter className="size-3.5 shrink-0" />
          <span>{t("filter.trigger")}</span>
          {activeCount > 0 ? (
            <span className="min-w-3 tabular-nums text-foreground">{activeCount}</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[10px] font-medium text-muted-foreground">
          {t("filter.sectionLabel")}
        </DropdownMenuLabel>

        {/* View preset: Active / Backlog / All */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 text-xs">
            <LayoutList className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{t("filter.view")}</span>
            <span className="max-w-[5.5rem] truncate text-[10px] text-muted-foreground">
              {presetLabel}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[9.5rem]">
            {PRESET_VALUES.map((value) => {
              const selected = filters.preset === value;
              return (
                <DropdownMenuItem
                  key={value}
                  className="gap-2 text-xs"
                  onSelect={(e) => {
                    e.preventDefault();
                    onFiltersChange({ ...filters, preset: value });
                  }}
                >
                  <span className="min-w-0 flex-1">{t(`presets.${value}`)}</span>
                  <Check
                    className={cn(
                      "ml-auto size-3.5 shrink-0",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Status (workflow state type) — multi-select */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 text-xs">
            <CircleDot className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{t("filter.status")}</span>
            <span className="max-w-[5.5rem] truncate text-[10px] text-muted-foreground">
              {statusLabel}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[11rem]">
            <DropdownMenuItem
              className="gap-2 text-xs"
              onSelect={(e) => {
                e.preventDefault();
                onFiltersChange({ ...filters, stateTypes: [] });
              }}
            >
              <span className="min-w-0 flex-1">{t("filter.allStatuses")}</span>
              <Check
                className={cn(
                  "ml-auto size-3.5 shrink-0",
                  filters.stateTypes.length === 0 ? "opacity-100" : "opacity-0",
                )}
              />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {LINEAR_STATE_TYPES.map((type) => {
              const selected = filters.stateTypes.includes(type);
              return (
                <DropdownMenuItem
                  key={type}
                  className="gap-2 text-xs"
                  onSelect={(e) => {
                    e.preventDefault();
                    toggleStateType(type);
                  }}
                >
                  <StatusTypeIcon type={type} />
                  <span className="min-w-0 flex-1">{t(`statusTypes.${type}`)}</span>
                  <Check
                    className={cn(
                      "ml-auto size-3.5 shrink-0",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Assignee — multi-select */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 text-xs">
            <User className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{t("filter.assignee")}</span>
            <span className="max-w-[5.5rem] truncate text-[10px] text-muted-foreground">
              {assigneeLabel}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64 p-0" sideOffset={4}>
            <Command>
              <CommandInput
                placeholder={t("filter.searchAssignees")}
                className="h-8 text-xs"
              />
              <CommandEmpty className="py-4 text-xs">
                {t("filter.noMatchingAssignees")}
              </CommandEmpty>
              <CommandGroup className="max-h-56 overflow-y-auto">
                <CommandItem
                  value="__all_assignees__"
                  onSelect={() => onFiltersChange({ ...filters, assigneeIds: [] })}
                  className="gap-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">{t("filter.allAssignees")}</span>
                  {filters.assigneeIds.length === 0 ? (
                    <Check className="size-3.5 shrink-0" />
                  ) : null}
                </CommandItem>
                {users.map((user) => {
                  const selected = filters.assigneeIds.includes(user.id);
                  return (
                    <CommandItem
                      key={user.id}
                      value={user.name}
                      onSelect={() => toggleId("assigneeIds", user.id)}
                      className="gap-2 text-xs"
                    >
                      {user.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.avatar_url}
                          alt=""
                          className="size-4 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] text-muted-foreground">
                          {user.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{user.name}</span>
                      {selected ? <Check className="size-3.5 shrink-0" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </Command>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Labels — multi-select (OR) */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 text-xs">
            <Tag className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{t("filter.labels")}</span>
            <span className="max-w-[5.5rem] truncate text-[10px] text-muted-foreground">
              {labelsLabel}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64 p-0" sideOffset={4}>
            <Command>
              <CommandInput
                placeholder={t("filter.searchLabels")}
                className="h-8 text-xs"
              />
              <CommandEmpty className="py-4 text-xs">
                {t("filter.noMatchingLabels")}
              </CommandEmpty>
              <CommandGroup className="max-h-56 overflow-y-auto">
                <CommandItem
                  value="__all_labels__"
                  onSelect={() => onFiltersChange({ ...filters, labelIds: [] })}
                  className="gap-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">{t("filter.allLabels")}</span>
                  {filters.labelIds.length === 0 ? (
                    <Check className="size-3.5 shrink-0" />
                  ) : null}
                </CommandItem>
                {labels.map((label) => {
                  const selected = filters.labelIds.includes(label.id);
                  const hex = label.color?.trim()
                    ? label.color.startsWith("#")
                      ? label.color
                      : `#${label.color}`
                    : null;
                  return (
                    <CommandItem
                      key={label.id}
                      value={label.name}
                      onSelect={() => toggleId("labelIds", label.id)}
                      className="gap-2 text-xs"
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: hex ?? "hsl(var(--muted-foreground))",
                        }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{label.name}</span>
                      {selected ? <Check className="size-3.5 shrink-0" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </Command>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Team */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 text-xs">
            <Users className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{t("filter.team")}</span>
            <span className="max-w-[5.5rem] truncate text-[10px] text-muted-foreground">
              {teamLabel}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64 p-0" sideOffset={4}>
            <Command>
              <CommandInput placeholder={t("filter.searchTeams")} className="h-8 text-xs" />
              <CommandEmpty className="py-4 text-xs">{t("filter.noMatchingTeams")}</CommandEmpty>
              <CommandGroup className="max-h-56 overflow-y-auto">
                <CommandItem
                  value="__all_teams__"
                  onSelect={() => onFiltersChange({ ...filters, teamId: "" })}
                  className="gap-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">{t("filter.allTeams")}</span>
                  {!filters.teamId ? <Check className="size-3.5 shrink-0" /> : null}
                </CommandItem>
                {teams.map((team) => {
                  const selected = filters.teamId === team.id;
                  return (
                    <CommandItem
                      key={team.id}
                      value={`${team.key} ${team.name}`}
                      onSelect={() =>
                        onFiltersChange({ ...filters, teamId: team.id })
                      }
                      className="gap-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{team.name}</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {team.key}
                        </div>
                      </div>
                      {selected ? <Check className="size-3.5 shrink-0" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </Command>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Linear project */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 text-xs">
            <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{t("filter.project")}</span>
            <span className="max-w-[5.5rem] truncate text-[10px] text-muted-foreground">
              {projectLabel}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64 p-0" sideOffset={4}>
            <Command>
              <CommandInput
                placeholder={t("filter.searchProjects")}
                className="h-8 text-xs"
              />
              <CommandEmpty className="py-4 text-xs">
                {t("filter.noMatchingProjects")}
              </CommandEmpty>
              <CommandGroup className="max-h-56 overflow-y-auto">
                <CommandItem
                  value="__all_projects__"
                  onSelect={() => onFiltersChange({ ...filters, projectId: "" })}
                  className="gap-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">{t("filter.allProjects")}</span>
                  {!filters.projectId ? <Check className="size-3.5 shrink-0" /> : null}
                </CommandItem>
                {linearProjects.map((project) => {
                  const selected = filters.projectId === project.id;
                  return (
                    <CommandItem
                      key={project.id}
                      value={project.name}
                      onSelect={() =>
                        onFiltersChange({ ...filters, projectId: project.id })
                      }
                      className="gap-2 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      {selected ? <Check className="size-3.5 shrink-0" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </Command>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Atmos project (create-target) */}
        {atmosProjects.length > 0 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2 text-xs">
              <Layers className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{t("filter.atmosProject")}</span>
              <span className="max-w-[5.5rem] truncate text-[10px] text-muted-foreground">
                {atmosLabel}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64 p-0" sideOffset={4}>
              <Command>
                <CommandInput
                  placeholder={t("filter.searchAtmosProjects")}
                  className="h-8 text-xs"
                />
                <CommandEmpty className="py-4 text-xs">
                  {t("filter.noMatchingAtmosProjects")}
                </CommandEmpty>
                <CommandGroup className="max-h-56 overflow-y-auto">
                  {atmosProjects.map((project) => {
                    const selected = filters.atmosProjectId === project.id;
                    return (
                      <CommandItem
                        key={project.id}
                        value={project.name}
                        onSelect={() =>
                          onFiltersChange({
                            ...filters,
                            atmosProjectId: project.id,
                          })
                        }
                        className="gap-2 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                        {selected ? <Check className="size-3.5 shrink-0" /> : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </Command>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}

        {activeCount > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs text-muted-foreground"
              onSelect={() =>
                onFiltersChange({
                  ...filters,
                  preset: "all",
                  stateTypes: [],
                  assigneeIds: [],
                  labelIds: [],
                  teamId: "",
                  projectId: "",
                })
              }
            >
              {t("filter.clearAll")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
