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
  Circle,
  FolderKanban,
  Layers,
  ListFilter,
  Users,
} from "lucide-react";
import type { Project } from "@/shared/types/domain";

export type LinearIssuePreset = "active" | "backlog" | "all";

export type TaskLinearFilters = {
  preset: LinearIssuePreset;
  teamId: string;
  projectId: string;
  /** Atmos project used when creating a workspace from an issue. */
  atmosProjectId: string;
};

export const DEFAULT_TASK_LINEAR_FILTERS: TaskLinearFilters = {
  preset: "all",
  teamId: "",
  projectId: "",
  atmosProjectId: "",
};

export function getActiveTaskLinearFilterCount(filters: TaskLinearFilters) {
  return (
    (filters.preset !== "all" ? 1 : 0) +
    (filters.teamId ? 1 : 0) +
    (filters.projectId ? 1 : 0)
  );
}

type TeamOption = { id: string; name: string; key: string };
type ProjectOption = { id: string; name: string };

type TaskLinearFilterMenuProps = {
  filters: TaskLinearFilters;
  onFiltersChange: (filters: TaskLinearFilters) => void;
  teams: TeamOption[];
  linearProjects: ProjectOption[];
  atmosProjects: Project[];
};

const PRESET_VALUES: LinearIssuePreset[] = ["active", "backlog", "all"];

/**
 * Compact Filter control for the Linear task list.
 * Status (Active / Backlog / All), Team, Linear project, and Atmos project
 * live here — not as loose toolbar chips.
 */
export function TaskLinearFilterMenu({
  filters,
  onFiltersChange,
  teams,
  linearProjects,
  atmosProjects,
}: TaskLinearFilterMenuProps) {
  const t = useTranslations("appShell.task.linear");
  const [open, setOpen] = React.useState(false);
  const activeCount = getActiveTaskLinearFilterCount(filters);

  const presetLabel = t(`presets.${filters.preset}`);
  const teamLabel = filters.teamId
    ? (teams.find((team) => team.id === filters.teamId)?.name ?? filters.teamId)
    : t("filter.allTeams");
  const projectLabel = filters.projectId
    ? (linearProjects.find((p) => p.id === filters.projectId)?.name ?? filters.projectId)
    : t("filter.allProjects");
  const atmosLabel =
    atmosProjects.find((p) => p.id === filters.atmosProjectId)?.name ??
    t("filter.atmosProject");

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

        {/* Status preset: Active / Backlog / All */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 text-xs">
            <Circle className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{t("filter.status")}</span>
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
