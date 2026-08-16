"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@workspace/ui";
import {
  Ban,
  Braces,
  Calendar,
  CalendarDays,
  CalendarRange,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  Folder,
  FolderGit2,
  FolderPlus,
  Github,
  LoaderCircle,
  Play,
  Terminal,
  Timer,
  XCircle,
} from "lucide-react";

import { PageFilterButton } from "@/shared/components/PageFilterButton";
import type { AutomationRunSummary, AutomationSummary } from "@/features/automations/types";
import {
  EMPTY_AUTOMATION_RUN_FILTERS,
  getActiveAutomationRunFilterCount,
  listAutomationRunFilterOptions,
  resolveRunTriggerFilter,
  type AutomationRunListFilters,
} from "@/features/automations/lib/automation-run-filters";
import type {
  AutomationEnvironmentFilter,
  AutomationRunStatusFilter,
  AutomationTriggerFilter,
} from "@/shared/lib/nuqs/searchParams";

const ENVIRONMENT_OPTIONS: Array<{
  value: AutomationEnvironmentFilter;
  icon: typeof Folder;
  labelKey: "project" | "workspace" | "newWorkspace" | "standalone";
}> = [
  { value: "project", icon: FolderGit2, labelKey: "project" },
  { value: "workspace", icon: Folder, labelKey: "workspace" },
  { value: "new_workspace", icon: FolderPlus, labelKey: "newWorkspace" },
  { value: "standalone", icon: Terminal, labelKey: "standalone" },
];

const TRIGGER_OPTIONS: Array<{
  value: AutomationTriggerFilter;
  icon: typeof Play;
  labelKey: AutomationTriggerFilter;
}> = [
  { value: "manual", icon: Play, labelKey: "manual" },
  { value: "github", icon: Github, labelKey: "github" },
  { value: "hourly", icon: Clock3, labelKey: "hourly" },
  { value: "daily", icon: Calendar, labelKey: "daily" },
  { value: "weekly", icon: CalendarDays, labelKey: "weekly" },
  { value: "monthly", icon: CalendarRange, labelKey: "monthly" },
  { value: "cron", icon: Braces, labelKey: "cron" },
];

const STATUS_OPTIONS: Array<{
  value: AutomationRunStatusFilter;
  icon: typeof Play;
  labelKey: AutomationRunStatusFilter;
}> = [
  { value: "running", icon: LoaderCircle, labelKey: "running" },
  { value: "completed", icon: CheckCircle2, labelKey: "completed" },
  { value: "failed", icon: XCircle, labelKey: "failed" },
  { value: "cancelled", icon: Ban, labelKey: "cancelled" },
  { value: "interrupted", icon: CircleDot, labelKey: "interrupted" },
];

export function AutomationRunFilterMenu({
  filters,
  runs,
  automations,
  onFiltersChange,
}: {
  filters: AutomationRunListFilters;
  runs: AutomationRunSummary[];
  automations: AutomationSummary[];
  onFiltersChange: (filters: AutomationRunListFilters) => void;
}) {
  const t = useTranslations("automation.listPanel.filter");
  const activeFilterCount = getActiveAutomationRunFilterCount(filters);
  const counts = React.useMemo(
    () => countAutomationRunFilterOptions(runs, automations),
    [automations, runs],
  );
  const automationOptions = React.useMemo(
    () => listAutomationRunFilterOptions(runs, automations, filters.automationGuids),
    [automations, filters.automationGuids, runs],
  );

  return (
    <PageFilterButton label={t("trigger")} activeCount={activeFilterCount}>
        {automationOptions.length > 0 ? (
          <FilterSubmenu
            icon={Timer}
            label={t("automation")}
            selectedCount={filters.automationGuids.length}
          >
            {automationOptions.map((option) => (
              <DropdownMenuItem
                key={option.guid}
                onSelect={(event) => {
                  event.preventDefault();
                  onFiltersChange({
                    ...filters,
                    automationGuids: toggleValue(filters.automationGuids, option.guid),
                  });
                }}
                className="cursor-pointer"
              >
                <Timer className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {option.displayName ?? t("unknownAutomation")}
                </span>
                <span className="tabular-nums text-[11px] text-muted-foreground">
                  {option.runCount}
                </span>
                {filters.automationGuids.includes(option.guid) ? (
                  <Check className="size-4" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </FilterSubmenu>
        ) : null}

        <FilterSubmenu
          icon={FolderGit2}
          label={t("environment")}
          selectedCount={filters.environments.length}
        >
          {ENVIRONMENT_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={(event) => {
                event.preventDefault();
                onFiltersChange({
                  ...filters,
                  environments: toggleValue(filters.environments, option.value),
                });
              }}
              className="cursor-pointer"
            >
              <option.icon className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {t(`environments.${option.labelKey}`)}
              </span>
              <span className="tabular-nums text-[11px] text-muted-foreground">
                {counts.environments[option.value]}
              </span>
              {filters.environments.includes(option.value) ? (
                <Check className="size-4" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </FilterSubmenu>

        <FilterSubmenu
          icon={Play}
          label={t("triggerType")}
          selectedCount={filters.triggers.length}
        >
          {TRIGGER_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={(event) => {
                event.preventDefault();
                onFiltersChange({
                  ...filters,
                  triggers: toggleValue(filters.triggers, option.value),
                });
              }}
              className="cursor-pointer"
            >
              <option.icon className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {t(`triggers.${option.labelKey}`)}
              </span>
              <span className="tabular-nums text-[11px] text-muted-foreground">
                {counts.triggers[option.value]}
              </span>
              {filters.triggers.includes(option.value) ? (
                <Check className="size-4" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </FilterSubmenu>

        <FilterSubmenu
          icon={CircleDot}
          label={t("status")}
          selectedCount={filters.statuses.length}
        >
          {STATUS_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={(event) => {
                event.preventDefault();
                onFiltersChange({
                  ...filters,
                  statuses: toggleValue(filters.statuses, option.value),
                });
              }}
              className="cursor-pointer"
            >
              <option.icon className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {t(`statuses.${option.labelKey}`)}
              </span>
              <span className="tabular-nums text-[11px] text-muted-foreground">
                {counts.statuses[option.value]}
              </span>
              {filters.statuses.includes(option.value) ? (
                <Check className="size-4" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </FilterSubmenu>

        {activeFilterCount > 0 ? (
          <>
            <DropdownMenuSeparator className="mx-2" />
            <DropdownMenuItem
              onClick={() => onFiltersChange(EMPTY_AUTOMATION_RUN_FILTERS)}
              className="text-xs font-medium text-muted-foreground"
            >
              {t("clearAll")}
            </DropdownMenuItem>
          </>
        ) : null}
    </PageFilterButton>
  );
}

function FilterSubmenu({
  icon: Icon,
  label,
  selectedCount,
  children,
}: {
  icon: typeof Folder;
  label: string;
  selectedCount: number;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Icon className="size-4" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {selectedCount > 0 ? (
          <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
            {selectedCount}
          </span>
        ) : null}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">{children}</DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function countAutomationRunFilterOptions(
  runs: AutomationRunSummary[],
  automations: AutomationSummary[],
) {
  const automationById = new Map(automations.map((item) => [item.guid, item]));
  const environments = Object.fromEntries(
    ENVIRONMENT_OPTIONS.map((option) => [option.value, 0]),
  ) as Record<AutomationEnvironmentFilter, number>;
  const triggers = Object.fromEntries(
    TRIGGER_OPTIONS.map((option) => [option.value, 0]),
  ) as Record<AutomationTriggerFilter, number>;
  const statuses = Object.fromEntries(
    STATUS_OPTIONS.map((option) => [option.value, 0]),
  ) as Record<AutomationRunStatusFilter, number>;

  for (const run of runs) {
    environments[run.target_kind] += 1;
    const trigger = resolveRunTriggerFilter(run, automationById.get(run.automation_guid));
    if (trigger) {
      triggers[trigger] += 1;
    }
    statuses[run.status] += 1;
  }

  return { environments, triggers, statuses };
}

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}
