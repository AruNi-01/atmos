// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  EMPTY_AUTOMATION_LIST_FILTERS,
  getActiveAutomationFilterCount,
  matchesAutomationListFilters,
  resolveAutomationTriggerFilter,
} from "@/features/automations/lib/automation-list-filters";
import type { AutomationSummary } from "@/features/automations/types";

function summary(overrides: Partial<AutomationSummary> = {}): AutomationSummary {
  return {
    guid: "auto-1",
    display_name: "Nightly review",
    agent_id: "claude",
    agent_config_json: null,
    target_kind: "project",
    project_guid: "proj-1",
    workspace_guid: null,
    schedule_enabled: true,
    schedule_paused: false,
    schedule_kind: "daily",
    schedule_expr: "0 9 * * *",
    schedule_timezone: "UTC",
    next_run_at: null,
    trigger_kind: "scheduled",
    trigger_enabled: true,
    trigger_status: "active",
    trigger_config_json: null,
    last_run_guid: null,
    last_status: null,
    run_count: 0,
    ...overrides,
  };
}

describe("automation list filters", () => {
  it("treats empty arrays as match-all", () => {
    expect(matchesAutomationListFilters(summary(), EMPTY_AUTOMATION_LIST_FILTERS)).toBe(true);
    expect(getActiveAutomationFilterCount(EMPTY_AUTOMATION_LIST_FILTERS)).toBe(0);
  });

  it("filters by environment, trigger, and state together", () => {
    const automation = summary({
      target_kind: "workspace",
      workspace_guid: "ws-1",
      project_guid: null,
      trigger_kind: "github",
      schedule_kind: null,
      schedule_enabled: false,
      trigger_enabled: true,
      trigger_status: "active",
    });

    expect(resolveAutomationTriggerFilter(automation)).toBe("github");
    expect(
      matchesAutomationListFilters(automation, {
        environments: ["workspace"],
        triggers: ["github"],
        states: ["enabled"],
      }),
    ).toBe(true);
    expect(
      matchesAutomationListFilters(automation, {
        environments: ["project"],
        triggers: ["github"],
        states: ["enabled"],
      }),
    ).toBe(false);
    expect(
      matchesAutomationListFilters(automation, {
        environments: ["workspace"],
        triggers: ["manual"],
        states: ["enabled"],
      }),
    ).toBe(false);
    expect(
      matchesAutomationListFilters(automation, {
        environments: ["workspace"],
        triggers: ["github"],
        states: ["paused"],
      }),
    ).toBe(false);
  });

  it("maps scheduled automations to their schedule kind", () => {
    expect(resolveAutomationTriggerFilter(summary({ schedule_kind: "weekly" }))).toBe("weekly");
    expect(resolveAutomationTriggerFilter(summary({ trigger_kind: "manual", schedule_kind: null }))).toBe(
      "manual",
    );
  });
});
