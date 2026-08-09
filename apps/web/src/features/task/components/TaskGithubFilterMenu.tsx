"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Checkbox,
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
  CircleDot,
  FolderGit2,
  ListFilter,
  Tag,
  User,
  XCircle,
} from "lucide-react";
import type { ProjectGithubRepo } from "@/features/task/hooks/use-project-github-repos";

export type TaskGithubStateFilter = "all" | "open" | "closed";

function StatusFilterIcon({
  state,
  className,
}: {
  state: TaskGithubStateFilter;
  className?: string;
}) {
  if (state === "open") {
    return <CircleDot className={cn("size-3.5 shrink-0 text-emerald-500", className)} />;
  }
  if (state === "closed") {
    return <XCircle className={cn("size-3.5 shrink-0 text-purple-500", className)} />;
  }
  // All — neutral open-style glyph
  return <Circle className={cn("size-3.5 shrink-0 text-muted-foreground", className)} />;
}

export type TaskGithubFilters = {
  /** Empty = all repos */
  repoFullNames: string[];
  assignees: string[];
  labels: string[];
  state: TaskGithubStateFilter;
};

export const EMPTY_TASK_GITHUB_FILTERS: TaskGithubFilters = {
  repoFullNames: [],
  assignees: [],
  labels: [],
  state: "open",
};

export function getActiveTaskGithubFilterCount(filters: TaskGithubFilters) {
  return (
    filters.repoFullNames.length +
    filters.assignees.length +
    filters.labels.length +
    (filters.state !== "open" ? 1 : 0)
  );
}

type TaskGithubFilterMenuProps = {
  repos: ProjectGithubRepo[];
  filters: TaskGithubFilters;
  onFiltersChange: (filters: TaskGithubFilters) => void;
  /** Union of assignee logins from loaded items / repo metadata. */
  assigneeOptions: string[];
  /** Union of label names from loaded items / repo metadata. */
  labelOptions: Array<{ name: string; color?: string | null }>;
};

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const STATE_VALUES: TaskGithubStateFilter[] = ["all", "open", "closed"];

/**
 * Compact Filter control: primary menu → Status / Repos / Assignees / Labels submenus.
 * Sort stays outside (owned by the parent header).
 */
export function TaskGithubFilterMenu({
  repos,
  filters,
  onFiltersChange,
  assigneeOptions,
  labelOptions,
}: TaskGithubFilterMenuProps) {
  const t = useTranslations("appShell.task.github");
  const [open, setOpen] = React.useState(false);
  const activeCount = getActiveTaskGithubFilterCount(filters);

  const stateLabel =
    filters.state === "all"
      ? t("filter.all")
      : filters.state === "closed"
        ? t("filter.closed")
        : t("filter.open");

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            // Match Sort SelectTrigger (size=sm → h-8) and search input height.
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
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[10px] font-medium text-muted-foreground">
          {t("filter.sectionLabel")}
        </DropdownMenuLabel>

        {/* Status */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 text-xs">
            <StatusFilterIcon state={filters.state} />
            <span className="min-w-0 flex-1 truncate">{t("filter.status")}</span>
            <span className="max-w-[5.5rem] truncate text-[10px] text-muted-foreground">
              {stateLabel}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[9.5rem]">
            {STATE_VALUES.map((value) => {
              const selected = filters.state === value;
              const label =
                value === "all"
                  ? t("filter.all")
                  : value === "closed"
                    ? t("filter.closed")
                    : t("filter.open");
              return (
                <DropdownMenuItem
                  key={value}
                  className="gap-2 text-xs"
                  onSelect={(e) => {
                    e.preventDefault();
                    onFiltersChange({ ...filters, state: value });
                  }}
                >
                  <StatusFilterIcon state={value} />
                  <span className="min-w-0 flex-1">{label}</span>
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

        {/* Repositories */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 text-xs">
            <FolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{t("filter.repos")}</span>
            {filters.repoFullNames.length > 0 ? (
              <span className="tabular-nums text-[10px] text-muted-foreground">
                {filters.repoFullNames.length}
              </span>
            ) : null}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-72 p-0" sideOffset={4}>
            <Command>
              <CommandInput placeholder={t("filter.searchRepos")} className="h-8 text-xs" />
              <CommandEmpty className="py-4 text-xs">{t("filter.noMatchingRepos")}</CommandEmpty>
              <CommandGroup className="max-h-56 overflow-y-auto">
                <CommandItem
                  value="__all__"
                  onSelect={() => onFiltersChange({ ...filters, repoFullNames: [] })}
                  className="gap-2 text-xs"
                >
                  <Checkbox
                    checked={filters.repoFullNames.length === 0}
                    className="size-3.5"
                  />
                  <span className="min-w-0 flex-1 truncate">{t("filter.allRepos")}</span>
                  {filters.repoFullNames.length === 0 ? (
                    <Check className="size-3.5 shrink-0" />
                  ) : null}
                </CommandItem>
                {repos.map((repo) => {
                  const isExplicit = filters.repoFullNames.includes(repo.fullName);
                  const selected = filters.repoFullNames.length === 0 || isExplicit;
                  return (
                    <CommandItem
                      key={repo.fullName}
                      value={`${repo.fullName} ${repo.projectName}`}
                      onSelect={() => {
                        if (filters.repoFullNames.length === 0) {
                          onFiltersChange({
                            ...filters,
                            repoFullNames: [repo.fullName],
                          });
                          return;
                        }
                        onFiltersChange({
                          ...filters,
                          repoFullNames: toggleInList(filters.repoFullNames, repo.fullName),
                        });
                      }}
                      className="gap-2 text-xs"
                    >
                      <Checkbox
                        checked={
                          selected && (filters.repoFullNames.length === 0 || isExplicit)
                        }
                        className="size-3.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{repo.fullName}</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {repo.projectName}
                        </div>
                      </div>
                      {isExplicit ? <Check className="size-3.5 shrink-0" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </Command>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Assignees */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 text-xs">
            <User className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{t("filter.assignees")}</span>
            {filters.assignees.length > 0 ? (
              <span className="tabular-nums text-[10px] text-muted-foreground">
                {filters.assignees.length}
              </span>
            ) : null}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64 p-0" sideOffset={4}>
            <Command>
              <CommandInput placeholder={t("filter.searchAssignees")} className="h-8 text-xs" />
              <CommandEmpty className="py-4 text-xs">
                {t("filter.noMatchingAssignees")}
              </CommandEmpty>
              <CommandGroup className="max-h-56 overflow-y-auto">
                {assigneeOptions.map((login) => {
                  const selected = filters.assignees.includes(login);
                  return (
                    <CommandItem
                      key={login}
                      value={login}
                      onSelect={() =>
                        onFiltersChange({
                          ...filters,
                          assignees: toggleInList(filters.assignees, login),
                        })
                      }
                      className="gap-2 text-xs"
                    >
                      <Checkbox checked={selected} className="size-3.5" />
                      <span className="min-w-0 flex-1 truncate">{login}</span>
                      {selected ? <Check className="size-3.5 shrink-0" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </Command>
            {filters.assignees.length > 0 ? (
              <div className="border-t border-border/50 p-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full text-[11px] text-muted-foreground"
                  onClick={() => onFiltersChange({ ...filters, assignees: [] })}
                >
                  {t("filter.clearAll")}
                </Button>
              </div>
            ) : null}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Labels */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 text-xs">
            <Tag className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{t("filter.labels")}</span>
            {filters.labels.length > 0 ? (
              <span className="tabular-nums text-[10px] text-muted-foreground">
                {filters.labels.length}
              </span>
            ) : null}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64 p-0" sideOffset={4}>
            <Command>
              <CommandInput placeholder={t("filter.searchLabels")} className="h-8 text-xs" />
              <CommandEmpty className="py-4 text-xs">
                {t("filter.noMatchingLabels")}
              </CommandEmpty>
              <CommandGroup className="max-h-56 overflow-y-auto">
                {labelOptions.map((label) => {
                  const selected = filters.labels.includes(label.name);
                  return (
                    <CommandItem
                      key={label.name}
                      value={label.name}
                      onSelect={() =>
                        onFiltersChange({
                          ...filters,
                          labels: toggleInList(filters.labels, label.name),
                        })
                      }
                      className="gap-2 text-xs"
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full border border-black/10"
                        style={{
                          backgroundColor: label.color
                            ? `#${label.color.replace(/^#/, "")}`
                            : "var(--muted-foreground)",
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate">{label.name}</span>
                      {selected ? <Check className="size-3.5 shrink-0" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </Command>
            {filters.labels.length > 0 ? (
              <div className="border-t border-border/50 p-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full text-[11px] text-muted-foreground"
                  onClick={() => onFiltersChange({ ...filters, labels: [] })}
                >
                  {t("filter.clearAll")}
                </Button>
              </div>
            ) : null}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {activeCount > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs text-muted-foreground"
              onSelect={() =>
                onFiltersChange({
                  ...filters,
                  state: "open",
                  repoFullNames: [],
                  assignees: [],
                  labels: [],
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
