// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  buildScheduleInput,
  parseSchedule,
} from "@/features/automations/lib/automation-schedule";
import type { AutomationSummary } from "@/features/automations/types";

function summary(overrides: Partial<AutomationSummary> = {}): AutomationSummary {
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
    schedule_expr: "3 23 * * *",
    schedule_timezone: "Asia/Shanghai",
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

describe("parseSchedule", () => {
  it("maps a stored daily schedule back onto the form", () => {
    const parsed = parseSchedule(summary());
    expect(parsed.trigger).toBe("daily");
    expect(parsed.timezone).toBe("Asia/Shanghai");
    expect(parsed.minute).toBe(3);
    expect(parsed.hour).toBe(23);
  });

  it("treats missing or empty schedule kinds as manual", () => {
    expect(
      parseSchedule(
        summary({
          trigger_kind: "manual",
          schedule_enabled: false,
          schedule_kind: null,
          schedule_expr: null,
          schedule_timezone: "UTC",
        }),
      ).trigger,
    ).toBe("manual");
    expect(
      parseSchedule(
        summary({
          trigger_kind: "scheduled",
          schedule_kind: "" as never,
          schedule_expr: "0 9 * * *",
        }),
      ).trigger,
    ).toBe("manual");
    expect(
      parseSchedule(
        summary({
          trigger_kind: "scheduled",
          schedule_kind: "scheduled" as never,
          schedule_expr: "0 9 * * *",
        }),
      ).trigger,
    ).toBe("manual");
  });

  it("keeps github triggers on the github form even if a leftover schedule exists", () => {
    expect(
      parseSchedule(
        summary({
          trigger_kind: "github",
          schedule_kind: "daily",
          schedule_expr: "0 9 * * *",
        }),
      ).trigger,
    ).toBe("github");
  });
});

describe("buildScheduleInput", () => {
  it("builds a daily payload without an empty kind", () => {
    expect(buildScheduleInput("daily", "Asia/Shanghai", 23, 3, 1, 1, "0 9 * * *")).toEqual({
      kind: "daily",
      timezone: "Asia/Shanghai",
      minute: 3,
      hour: 23,
    });
  });

  it("does not emit a schedule for manual, github, or unknown kinds", () => {
    expect(buildScheduleInput("manual", "UTC", 9, 0, 1, 1, "0 9 * * *")).toBeNull();
    expect(buildScheduleInput("github", "UTC", 9, 0, 1, 1, "0 9 * * *")).toBeNull();
    expect(buildScheduleInput("" as never, "UTC", 9, 0, 1, 1, "0 9 * * *")).toBeNull();
    expect(buildScheduleInput("scheduled" as never, "UTC", 9, 0, 1, 1, "0 9 * * *")).toBeNull();
  });
});
