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
  Braces,
  Calendar,
  CalendarDays,
  CalendarRange,
  Check,
  Clock3,
  Folder,
  FolderGit2,
  FolderPlus,
  Pause,
  Play,
  Terminal,
} from "lucide-react";
import { Github } from "@workspace/ui/components/icons/lucide-brand-icons";

import { PageFilterButton } from "@/shared/components/PageFilterButton";
import type { AutomationSummary } from "@/features/automations/types";
import {
  EMPTY_AUTOMATION_LIST_FILTERS,
  getActiveAutomationFilterCount,
  resolveAutomationTriggerFilter,
  type AutomationListFilters,
} from "@/features/automations/lib/automation-list-filters";
import { isAutomationEnabled } from "@/features/automations/lib/automation-format";
import type {
  AutomationEnvironmentFilter,
  AutomationStateFilter,
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

const STATE_OPTIONS: Array<{
  value: AutomationStateFilter;
  icon: typeof Play;
  labelKey: AutomationStateFilter;
}> = [
  { value: "enabled", icon: Play, labelKey: "enabled" },
  { value: "paused", icon: Pause, labelKey: "paused" },
];

function countAutomationListFilterOptions(automations: AutomationSummary[]) {
  const environments = Object.fromEntries(
    ENVIRONMENT_OPTIONS.map((option) => [option.value, 0]),
  ) as Record<AutomationEnvironmentFilter, number>;
  const triggers = Object.fromEntries(
    TRIGGER_OPTIONS.map((option) => [option.value, 0]),
  ) as Record<AutomationTriggerFilter, number>;
  const states = Object.fromEntries(
    STATE_OPTIONS.map((option) => [option.value, 0]),
  ) as Record<AutomationStateFilter, number>;

  for (const automation of automations) {
    environments[automation.target_kind] += 1;
    triggers[resolveAutomationTriggerFilter(automation)] += 1;
    if (isAutomationEnabled(automation)) {
      states.enabled += 1;
    } else {
      states.paused += 1;
    }
  }

  return { environments, triggers, states };
}

export function AutomationListFilterMenu({
  filters,
  automations,
  onFiltersChange,
}: {
  filters: AutomationListFilters;
  automations: AutomationSummary[];
  onFiltersChange: (filters: AutomationListFilters) => void;
}) {
  const t = useTranslations("automation.listPanel.filter");
  const activeFilterCount = getActiveAutomationFilterCount(filters);
  const counts = React.useMemo(
    () => countAutomationListFilterOptions(automations),
    [automations],
  );

  const toggleEnvironment = (value: AutomationEnvironmentFilter) =>
    onFiltersChange({
      ...filters,
      environments: toggleValue(filters.environments, value),
    });

  const toggleTrigger = (value: AutomationTriggerFilter) =>
    onFiltersChange({
      ...filters,
      triggers: toggleValue(filters.triggers, value),
    });

  const toggleState = (value: AutomationStateFilter) =>
    onFiltersChange({
      ...filters,
      states: toggleValue(filters.states, value),
    });

  return (
    <PageFilterButton label={t("trigger")} activeCount={activeFilterCount}>
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
                toggleEnvironment(option.value);
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
                toggleTrigger(option.value);
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
          icon={Pause}
          label={t("state")}
          selectedCount={filters.states.length}
        >
          {STATE_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={(event) => {
                event.preventDefault();
                toggleState(option.value);
              }}
              className="cursor-pointer"
            >
              <option.icon className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {t(`states.${option.labelKey}`)}
              </span>
              <span className="tabular-nums text-[11px] text-muted-foreground">
                {counts.states[option.value]}
              </span>
              {filters.states.includes(option.value) ? (
                <Check className="size-4" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </FilterSubmenu>

        {activeFilterCount > 0 ? (
          <>
            <DropdownMenuSeparator className="mx-2" />
            <DropdownMenuItem
              onClick={() => onFiltersChange(EMPTY_AUTOMATION_LIST_FILTERS)}
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
      <DropdownMenuSubContent className="w-56">{children}</DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}
