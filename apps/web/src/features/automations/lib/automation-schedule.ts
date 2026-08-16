import { createTranslator } from "next-intl";

import type {
  AutomationAgentCapability,
  AutomationScheduleInput,
  AutomationScheduleKind,
  AutomationSummary,
} from "@/features/automations/types";
import { clampNumber } from "@/features/automations/lib/automation-format";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

type AutomationsLocale = "en" | "zh";

let cachedLocale: AutomationsLocale | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedTranslator: any = null;

function automationsT(
  key: string,
  values?: Record<string, string | number>,
): string {
  const locale: AutomationsLocale =
    currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedTranslator || cachedLocale !== locale) {
    cachedLocale = locale;
    cachedTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "automation" as never,
    });
  }

  return cachedTranslator(key as never, values as never);
}

export type TriggerChoice = "manual" | AutomationScheduleKind | "github";

export const SCHEDULE_KINDS = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "cron",
] as const satisfies readonly AutomationScheduleKind[];

export function isScheduleKind(value: string | null | undefined): value is AutomationScheduleKind {
  return SCHEDULE_KINDS.some((kind) => kind === value);
}

export function isTriggerChoice(value: string | null | undefined): value is TriggerChoice {
  return value === "manual" || value === "github" || isScheduleKind(value);
}

export const TRIGGER_OPTIONS: Array<{
  value: TriggerChoice;
  label: string;
  description: string;
}> = [
  {
    value: "manual",
    get label() {
      return automationsT("schedule.triggerOptions.manual.label");
    },
    get description() {
      return automationsT("schedule.triggerOptions.manual.description");
    },
  },
  {
    value: "github",
    get label() {
      return automationsT("schedule.triggerOptions.github.label");
    },
    get description() {
      return automationsT("schedule.triggerOptions.github.description");
    },
  },
  {
    value: "hourly",
    get label() {
      return automationsT("schedule.triggerOptions.hourly.label");
    },
    get description() {
      return automationsT("schedule.triggerOptions.hourly.description");
    },
  },
  {
    value: "daily",
    get label() {
      return automationsT("schedule.triggerOptions.daily.label");
    },
    get description() {
      return automationsT("schedule.triggerOptions.daily.description");
    },
  },
  {
    value: "weekly",
    get label() {
      return automationsT("schedule.triggerOptions.weekly.label");
    },
    get description() {
      return automationsT("schedule.triggerOptions.weekly.description");
    },
  },
  {
    value: "monthly",
    get label() {
      return automationsT("schedule.triggerOptions.monthly.label");
    },
    get description() {
      return automationsT("schedule.triggerOptions.monthly.description");
    },
  },
  {
    value: "cron",
    get label() {
      return automationsT("schedule.triggerOptions.cron.label");
    },
    get description() {
      return automationsT("schedule.triggerOptions.cron.description");
    },
  },
];

export const DAY_OPTIONS = [
  {
    value: 0,
    get label() {
      return automationsT("schedule.days.sunday");
    },
  },
  {
    value: 1,
    get label() {
      return automationsT("schedule.days.monday");
    },
  },
  {
    value: 2,
    get label() {
      return automationsT("schedule.days.tuesday");
    },
  },
  {
    value: 3,
    get label() {
      return automationsT("schedule.days.wednesday");
    },
  },
  {
    value: 4,
    get label() {
      return automationsT("schedule.days.thursday");
    },
  },
  {
    value: 5,
    get label() {
      return automationsT("schedule.days.friday");
    },
  },
  {
    value: 6,
    get label() {
      return automationsT("schedule.days.saturday");
    },
  },
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
  if (!isScheduleKind(trigger)) {
    return null;
  }

  const resolvedTimezone = timezone.trim() || undefined;

  if (trigger === "cron") {
    return {
      kind: "cron",
      expr: cronExpr.trim(),
      timezone: resolvedTimezone,
    };
  }

  const base = {
    kind: trigger,
    timezone: resolvedTimezone,
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
  if (automation.trigger_kind === "github") {
    return { ...fallback, trigger: "github" };
  }
  if (!isScheduleKind(automation.schedule_kind) || !automation.schedule_expr?.trim()) {
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
  if (!displayName.trim()) return automationsT("validation.displayNameRequired");
  if (!instructions.trim()) return automationsT("validation.instructionsRequired");
  if (!selectedAgent?.automation_supported) {
    return automationsT("validation.supportedAgentRequired");
  }
  if (!targetValid) return automationsT("validation.targetRequired");
  if (!scheduleValid) return automationsT("validation.scheduleRequired");
  if (previewError) return previewError;
  return automationsT("validation.completeRequiredFields");
}
