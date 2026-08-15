import { isAutomationEnabled } from "@/features/automations/lib/automation-format";
import type { AutomationSummary } from "@/features/automations/types";
import type {
  AutomationEnvironmentFilter,
  AutomationStateFilter,
  AutomationTriggerFilter,
} from "@/shared/lib/nuqs/searchParams";

export type AutomationListFilters = {
  environments: AutomationEnvironmentFilter[];
  triggers: AutomationTriggerFilter[];
  states: AutomationStateFilter[];
};

export const EMPTY_AUTOMATION_LIST_FILTERS: AutomationListFilters = {
  environments: [],
  triggers: [],
  states: [],
};

export function getActiveAutomationFilterCount(filters: AutomationListFilters) {
  return filters.environments.length + filters.triggers.length + filters.states.length;
}

export function resolveAutomationTriggerFilter(
  automation: AutomationSummary,
): AutomationTriggerFilter {
  if (automation.trigger_kind === "github") {
    return "github";
  }
  if (automation.trigger_kind === "scheduled" && automation.schedule_kind) {
    return automation.schedule_kind;
  }
  return "manual";
}

export function matchesAutomationListFilters(
  automation: AutomationSummary,
  filters: AutomationListFilters,
) {
  if (
    filters.environments.length > 0 &&
    !filters.environments.includes(automation.target_kind)
  ) {
    return false;
  }
  if (filters.triggers.length > 0) {
    if (!filters.triggers.includes(resolveAutomationTriggerFilter(automation))) {
      return false;
    }
  }
  if (filters.states.length > 0) {
    const enabled = isAutomationEnabled(automation);
    if (enabled && !filters.states.includes("enabled")) return false;
    if (!enabled && !filters.states.includes("paused")) return false;
  }
  return true;
}
