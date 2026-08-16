// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  compareRunsByStartedAtDesc,
  EMPTY_AUTOMATION_RUN_FILTERS,
  getActiveAutomationRunFilterCount,
  listAutomationRunFilterOptions,
  matchesAutomationRunFilters,
  runFiltersForAutomation,
} from "@/features/automations/lib/automation-run-filters";
import type { AutomationRunSummary, AutomationSummary } from "@/features/automations/types";

function run(overrides: Partial<AutomationRunSummary> = {}): AutomationRunSummary {
  return {
    guid: "run-1",
    automation_guid: "auto-1",
    agent_id: "claude",
    agent_label: "Claude",
    agent_config_json: null,
    trigger_kind: "scheduled",
    trigger_source_json: null,
    status: "completed",
    failure_kind: null,
    error_message: null,
    target_kind: "project",
    project_guid: "proj-1",
    workspace_guid: null,
    created_workspace_guid: null,
    run_dir: "/tmp/run",
    result_path: "/tmp/run/final.md",
    terminal_display_name: "run",
    tmux_session_name: null,
    tmux_window_name: null,
    tmux_window_index: null,
    started_at: "2026-08-16T10:00:00.000Z",
    completed_at: "2026-08-16T10:01:00.000Z",
    exit_code: 0,
    ...overrides,
  };
}

function automation(overrides: Partial<AutomationSummary> = {}): AutomationSummary {
  return {
    guid: "auto-1",
    display_name: "Nightly",
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
    run_count: 1,
    ...overrides,
  };
}

describe("automation run filters", () => {
  it("sorts by started_at descending", () => {
    const older = run({ guid: "older", started_at: "2026-08-15T10:00:00.000Z" });
    const newer = run({ guid: "newer", started_at: "2026-08-16T12:00:00.000Z" });
    expect([older, newer].sort(compareRunsByStartedAtDesc).map((item) => item.guid)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("filters by environment, scheduled trigger, and status", () => {
    const item = run();
    const parent = automation();
    expect(matchesAutomationRunFilters(item, parent, EMPTY_AUTOMATION_RUN_FILTERS)).toBe(true);
    expect(
      matchesAutomationRunFilters(item, parent, {
        environments: ["project"],
        triggers: ["daily"],
        statuses: ["completed"],
        automationGuids: [],
      }),
    ).toBe(true);
    expect(
      matchesAutomationRunFilters(item, parent, {
        environments: ["workspace"],
        triggers: ["daily"],
        statuses: ["completed"],
        automationGuids: [],
      }),
    ).toBe(false);
    expect(
      matchesAutomationRunFilters(item, parent, {
        environments: ["project"],
        triggers: ["github"],
        statuses: ["completed"],
        automationGuids: [],
      }),
    ).toBe(false);
    expect(
      matchesAutomationRunFilters(item, parent, {
        environments: ["project"],
        triggers: ["daily"],
        statuses: ["failed"],
        automationGuids: [],
      }),
    ).toBe(false);
  });

  it("filters by automation guid", () => {
    const item = run({ automation_guid: "auto-1" });
    const parent = automation();
    expect(
      matchesAutomationRunFilters(item, parent, {
        ...EMPTY_AUTOMATION_RUN_FILTERS,
        automationGuids: ["auto-1"],
      }),
    ).toBe(true);
    expect(
      matchesAutomationRunFilters(item, parent, {
        ...EMPTY_AUTOMATION_RUN_FILTERS,
        automationGuids: ["auto-2"],
      }),
    ).toBe(false);
  });

  it("builds a history jump that pins one automation", () => {
    expect(
      runFiltersForAutomation("auto-9", {
        environments: ["project"],
        triggers: ["daily"],
        statuses: ["failed"],
        automationGuids: ["auto-1"],
      }),
    ).toEqual({
      environments: ["project"],
      triggers: ["daily"],
      statuses: [],
      automationGuids: ["auto-9"],
    });
    expect(getActiveAutomationRunFilterCount(runFiltersForAutomation("auto-9"))).toBe(1);
  });

  it("lists automations from definitions, runs, and the current filter", () => {
    const options = listAutomationRunFilterOptions(
      [run({ automation_guid: "auto-2" }), run({ guid: "run-2", automation_guid: "auto-2" })],
      [automation({ guid: "auto-1", display_name: "Alpha" })],
      ["auto-3"],
    );
    expect(options.map((option) => option.guid)).toEqual(["auto-1", "auto-2", "auto-3"]);
    expect(options.find((option) => option.guid === "auto-2")).toEqual({
      guid: "auto-2",
      displayName: null,
      runCount: 2,
    });
  });
});
