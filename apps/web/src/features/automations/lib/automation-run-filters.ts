import {
  resolveAutomationTriggerFilter,
  type AutomationListFilters,
} from "@/features/automations/lib/automation-list-filters";
import type { AutomationRunSummary, AutomationSummary } from "@/features/automations/types";
import type { AutomationRunStatusFilter } from "@/shared/lib/nuqs/searchParams";

export type AutomationRunListFilters = {
  environments: AutomationListFilters["environments"];
  triggers: AutomationListFilters["triggers"];
  statuses: AutomationRunStatusFilter[];
  automationGuids: string[];
};

export const EMPTY_AUTOMATION_RUN_FILTERS: AutomationRunListFilters = {
  environments: [],
  triggers: [],
  statuses: [],
  automationGuids: [],
};

export function getActiveAutomationRunFilterCount(filters: AutomationRunListFilters) {
  return (
    filters.environments.length +
    filters.triggers.length +
    filters.statuses.length +
    filters.automationGuids.length
  );
}

export function runFiltersForAutomation(
  automationGuid: string,
  current: AutomationRunListFilters = EMPTY_AUTOMATION_RUN_FILTERS,
): AutomationRunListFilters {
  return {
    ...current,
    statuses: [],
    automationGuids: [automationGuid],
  };
}

export function resolveRunTriggerFilter(
  run: AutomationRunSummary,
  automation: AutomationSummary | undefined,
) {
  if (run.trigger_kind === "github") {
    return "github" as const;
  }
  if (run.trigger_kind === "scheduled") {
    return automation ? resolveAutomationTriggerFilter(automation) : null;
  }
  return "manual" as const;
}

export function matchesAutomationRunFilters(
  run: AutomationRunSummary,
  automation: AutomationSummary | undefined,
  filters: AutomationRunListFilters,
) {
  if (
    filters.environments.length > 0 &&
    !filters.environments.includes(run.target_kind)
  ) {
    return false;
  }
  if (filters.triggers.length > 0) {
    const trigger = resolveRunTriggerFilter(run, automation);
    if (trigger) {
      if (!filters.triggers.includes(trigger)) return false;
    } else if (
      !filters.triggers.some((value) =>
        value === "hourly" ||
        value === "daily" ||
        value === "weekly" ||
        value === "monthly" ||
        value === "cron",
      )
    ) {
      return false;
    }
  }
  if (filters.statuses.length > 0 && !filters.statuses.includes(run.status)) {
    return false;
  }
  if (
    filters.automationGuids.length > 0 &&
    !filters.automationGuids.includes(run.automation_guid)
  ) {
    return false;
  }
  return true;
}

export function listAutomationRunFilterOptions(
  runs: AutomationRunSummary[],
  automations: AutomationSummary[],
  selectedGuids: string[] = [],
) {
  const automationById = new Map(automations.map((item) => [item.guid, item]));
  const counts = new Map<string, number>();
  for (const run of runs) {
    counts.set(run.automation_guid, (counts.get(run.automation_guid) ?? 0) + 1);
  }

  const guids = new Set<string>([
    ...automations.map((item) => item.guid),
    ...counts.keys(),
    ...selectedGuids,
  ]);

  return [...guids]
    .map((guid) => ({
      guid,
      displayName: automationById.get(guid)?.display_name ?? null,
      runCount: counts.get(guid) ?? 0,
    }))
    .sort((left, right) => {
      if (left.displayName && right.displayName) {
        const byName = left.displayName.localeCompare(right.displayName);
        if (byName !== 0) return byName;
      } else if (left.displayName) {
        return -1;
      } else if (right.displayName) {
        return 1;
      }
      return left.guid.localeCompare(right.guid);
    });
}

export function compareRunsByStartedAtDesc(
  left: AutomationRunSummary,
  right: AutomationRunSummary,
) {
  const leftTime = Date.parse(left.started_at) || 0;
  const rightTime = Date.parse(right.started_at) || 0;
  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }
  return right.guid.localeCompare(left.guid);
}
