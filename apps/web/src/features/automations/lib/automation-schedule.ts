import type {
  AutomationAgentCapability,
  AutomationScheduleInput,
  AutomationScheduleKind,
  AutomationSummary,
} from "@/features/automations/types";
import { clampNumber } from "@/features/automations/lib/automation-format";

export type TriggerChoice = "manual" | AutomationScheduleKind;

export const TRIGGER_OPTIONS: Array<{
  value: TriggerChoice;
  label: string;
  description: string;
}> = [
  { value: "manual", label: "Manual", description: "Run only when started" },
  { value: "hourly", label: "Hourly", description: "At a minute each hour" },
  { value: "daily", label: "Daily", description: "At a time each day" },
  { value: "weekly", label: "Weekly", description: "On a weekday" },
  { value: "monthly", label: "Monthly", description: "On a day of month" },
  { value: "cron", label: "Cron", description: "Five-field expression" },
];

export const DAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export function buildScheduleInput(
  trigger: TriggerChoice,
  timezone: string,
  hour: number,
  minute: number,
  dayOfWeek: number,
  dayOfMonth: number,
  cronExpr: string,
): AutomationScheduleInput | null {
  if (trigger === "manual") {
    return null;
  }
  if (trigger === "cron") {
    return {
      kind: "cron",
      expr: cronExpr.trim(),
      timezone,
    };
  }

  const base = {
    kind: trigger,
    timezone,
    minute: clampNumber(minute, 0, 59),
  };

  if (trigger === "hourly") {
    return base;
  }
  if (trigger === "daily") {
    return { ...base, hour: clampNumber(hour, 0, 23) };
  }
  if (trigger === "weekly") {
    return {
      ...base,
      hour: clampNumber(hour, 0, 23),
      day_of_week: clampNumber(dayOfWeek, 0, 6),
    };
  }
  return {
    ...base,
    hour: clampNumber(hour, 0, 23),
    day_of_month: clampNumber(dayOfMonth, 1, 31),
  };
}

export function parseSchedule(automation: AutomationSummary): {
  trigger: TriggerChoice;
  timezone: string;
  hour: number;
  minute: number;
  dayOfWeek: number;
  dayOfMonth: number;
  cronExpr: string;
} {
  const fallback = {
    trigger: "manual" as TriggerChoice,
    timezone: automation.schedule_timezone,
    hour: 9,
    minute: 0,
    dayOfWeek: 1,
    dayOfMonth: 1,
    cronExpr: automation.schedule_expr ?? "0 9 * * *",
  };
  if (!automation.schedule_kind || !automation.schedule_expr) {
    return fallback;
  }
  const parts = automation.schedule_expr.split(/\s+/);
  const minute = parseInt(parts[0] ?? "0", 10);
  const hour = parseInt(parts[1] ?? "9", 10);
  const dayOfMonth = parseInt(parts[2] ?? "1", 10);
  const dayOfWeek = parseInt(parts[4] ?? "1", 10);

  return {
    trigger: automation.schedule_kind,
    timezone: automation.schedule_timezone,
    hour: Number.isFinite(hour) ? hour : fallback.hour,
    minute: Number.isFinite(minute) ? minute : fallback.minute,
    dayOfWeek: Number.isFinite(dayOfWeek) ? dayOfWeek : fallback.dayOfWeek,
    dayOfMonth: Number.isFinite(dayOfMonth) ? dayOfMonth : fallback.dayOfMonth,
    cronExpr: automation.schedule_expr,
  };
}

export function validationMessage({
  displayName,
  instructions,
  selectedAgent,
  targetValid,
  scheduleValid,
  previewError,
}: {
  displayName: string;
  instructions: string;
  selectedAgent: AutomationAgentCapability | null;
  targetValid: boolean;
  scheduleValid: boolean;
  previewError: string | null;
}) {
  if (!displayName.trim()) return "Display name is required.";
  if (!instructions.trim()) return "Agent Instructions are required.";
  if (!selectedAgent?.automation_supported) return "Select a supported non-interactive agent.";
  if (!targetValid) return "Choose a valid run environment.";
  if (!scheduleValid) return "Choose a valid trigger schedule.";
  if (previewError) return previewError;
  return "Complete the required setup fields.";
}
