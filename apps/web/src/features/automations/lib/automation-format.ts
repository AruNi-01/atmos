import { createTranslator } from "next-intl";

import type {
  AutomationArtifactKind,
  AutomationRunStatus,
  AutomationRunSummary,
  AutomationSummary,
  AutomationTargetInput,
  AutomationTargetKind,
} from "@/features/automations/types";
import type { Project, Workspace } from "@/shared/types/domain";
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

function formatTriggerStatus(status: string) {
  switch (status) {
    case "active":
      return automationsT("format.triggerStatus.active");
    case "needs_setup":
      return automationsT("format.triggerStatus.needsSetup");
    case "paused":
      return automationsT("format.triggerStatus.paused");
    case "error":
      return automationsT("format.triggerStatus.error");
    default:
      return status.replace(/_/g, " ");
  }
}

export function buildTargetInput(
  targetKind: AutomationTargetKind,
  projectGuid: string,
  workspaceGuid: string,
): AutomationTargetInput {
  const project = projectGuid.trim() || null;
  const workspace = workspaceGuid.trim() || null;
  if (targetKind === "project") {
    return { target_kind: "project", project_guid: project, workspace_guid: null };
  }
  if (targetKind === "new_workspace") {
    return { target_kind: "new_workspace", project_guid: project, workspace_guid: null };
  }
  if (targetKind === "workspace") {
    return { target_kind: "workspace", project_guid: null, workspace_guid: workspace };
  }
  return { target_kind: "standalone", project_guid: null, workspace_guid: null };
}

export function flattenWorkspaces(projects: Project[]) {
  return projects.flatMap((project) =>
    project.workspaces.map((workspace) => ({
      project,
      workspace,
    })),
  ) satisfies Array<{ project: Project; workspace: Workspace }>;
}

export function formatTarget(automation: AutomationSummary, projects: Project[]) {
  if (automation.target_kind === "standalone") {
    return automationsT("format.target.standalone");
  }
  if (automation.target_kind === "project") {
    return (
      projects.find((project) => project.id === automation.project_guid)?.name ??
      automationsT("format.target.projectFallback")
    );
  }
  if (automation.target_kind === "new_workspace") {
    const projectName = projects.find((project) => project.id === automation.project_guid)?.name;
    return projectName
      ? automationsT("format.target.newWorkspaceInProject", { projectName })
      : automationsT("format.target.newWorkspace");
  }
  for (const project of projects) {
    const workspace = project.workspaces.find((item) => item.id === automation.workspace_guid);
    if (workspace) {
      return `${workspace.displayName || workspace.name} / ${project.name}`;
    }
  }
  return automationsT("format.target.workspaceFallback");
}

export function formatTargetKind(kind: AutomationTargetKind) {
  switch (kind) {
    case "project":
      return automationsT("format.targetKind.project");
    case "workspace":
      return automationsT("format.targetKind.workspace");
    case "new_workspace":
      return automationsT("format.targetKind.newWorkspace");
    case "standalone":
      return automationsT("format.targetKind.standalone");
  }
}

export function formatScheduleLabel(automation: AutomationSummary) {
  if (automation.trigger_kind === "github") {
    return automation.trigger_status === "active"
      ? automationsT("format.schedule.github")
      : automationsT("format.schedule.githubWithStatus", {
          status: formatTriggerStatus(automation.trigger_status),
        });
  }
  if (!automation.schedule_enabled || !automation.schedule_kind) {
    return automationsT("format.schedule.manual");
  }
  return automation.schedule_kind === "cron"
    ? automationsT("format.schedule.cron", {
        expr: automation.schedule_expr ?? "",
      }).trim()
    : automationsT(`format.scheduleKinds.${automation.schedule_kind}`);
}

export function supportsAutomationEnabledToggle(automation: AutomationSummary) {
  return automation.trigger_kind === "github" || automation.schedule_enabled;
}

export function isAutomationEnabled(automation: AutomationSummary) {
  if (automation.trigger_kind === "github") {
    return automation.trigger_enabled && automation.trigger_status === "active";
  }
  if (automation.schedule_enabled) {
    return !automation.schedule_paused;
  }
  return true;
}

export function isAutomationPaused(automation: AutomationSummary) {
  return automation.schedule_paused || automation.trigger_status === "paused";
}

export function artifactLabel(kind: AutomationArtifactKind) {
  switch (kind) {
    case "final":
      return automationsT("format.artifact.final");
    case "prompt":
      return automationsT("format.artifact.prompt");
    case "run_json":
      return automationsT("format.artifact.runJson");
  }
}

export function formatDateTime(value: string | null) {
  if (!value) return automationsT("format.none");
  const normalized = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(currentAppLocale("en"), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatShortId(value: string) {
  return value.length > 8 ? value.slice(0, 8) : value;
}

export function statusMeta(status: AutomationRunStatus | null): { status: AutomationRunStatus } | null {
  return status ? { status } : null;
}

export function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatAutomationReasoningLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (/^[a-z0-9]+$/.test(trimmed)) {
    return capitalize(trimmed);
  }
  return trimmed;
}

type AgentConfigLike = {
  model?: string | null;
  reasoning?: { value?: string | null } | null;
};

function readAgentRunConfig(
  value: AgentConfigLike | string | null | undefined,
): { model: string | null; reasoning: string | null } | null {
  if (!value) {
    return null;
  }
  let parsed: AgentConfigLike | null = null;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as AgentConfigLike;
    } catch {
      return null;
    }
  } else {
    parsed = value;
  }
  const model = parsed.model?.trim() || null;
  const reasoning = parsed.reasoning?.value?.trim() || null;
  if (!model && !reasoning) {
    return null;
  }
  return { model, reasoning };
}

export function formatAutomationAgentConfigSuffix(
  value: AgentConfigLike | string | null | undefined,
): string | null {
  const config = readAgentRunConfig(value);
  if (!config) {
    return null;
  }
  const parts: string[] = [];
  if (config.model) {
    parts.push(config.model);
  }
  if (config.reasoning) {
    parts.push(formatAutomationReasoningLabel(config.reasoning));
  }
  return parts.length > 0 ? parts.join(" - ") : null;
}

export function formatAutomationAgentDisplayName(
  agentLabel: string,
  value: AgentConfigLike | string | null | undefined,
): string {
  const suffix = formatAutomationAgentConfigSuffix(value);
  return suffix ? `${agentLabel} - ${suffix}` : agentLabel;
}

export function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

export interface TimezoneOption {
  value: string;
  label: string;
  group: string;
}

export const COMMON_TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: "UTC", label: "UTC", get group() { return automationsT("format.timezoneGroups.universal"); } },
  { value: "America/Los_Angeles", get label() { return automationsT("format.timezones.losAngeles"); }, get group() { return automationsT("format.timezoneGroups.americas"); } },
  { value: "America/Denver", get label() { return automationsT("format.timezones.denver"); }, get group() { return automationsT("format.timezoneGroups.americas"); } },
  { value: "America/Chicago", get label() { return automationsT("format.timezones.chicago"); }, get group() { return automationsT("format.timezoneGroups.americas"); } },
  { value: "America/New_York", get label() { return automationsT("format.timezones.newYork"); }, get group() { return automationsT("format.timezoneGroups.americas"); } },
  { value: "America/Toronto", get label() { return automationsT("format.timezones.toronto"); }, get group() { return automationsT("format.timezoneGroups.americas"); } },
  { value: "America/Sao_Paulo", get label() { return automationsT("format.timezones.saoPaulo"); }, get group() { return automationsT("format.timezoneGroups.americas"); } },
  { value: "Europe/London", get label() { return automationsT("format.timezones.london"); }, get group() { return automationsT("format.timezoneGroups.europe"); } },
  { value: "Europe/Paris", get label() { return automationsT("format.timezones.paris"); }, get group() { return automationsT("format.timezoneGroups.europe"); } },
  { value: "Europe/Berlin", get label() { return automationsT("format.timezones.berlin"); }, get group() { return automationsT("format.timezoneGroups.europe"); } },
  { value: "Europe/Madrid", get label() { return automationsT("format.timezones.madrid"); }, get group() { return automationsT("format.timezoneGroups.europe"); } },
  { value: "Europe/Amsterdam", get label() { return automationsT("format.timezones.amsterdam"); }, get group() { return automationsT("format.timezoneGroups.europe"); } },
  { value: "Europe/Moscow", get label() { return automationsT("format.timezones.moscow"); }, get group() { return automationsT("format.timezoneGroups.europe"); } },
  { value: "Africa/Cairo", get label() { return automationsT("format.timezones.cairo"); }, get group() { return automationsT("format.timezoneGroups.africa"); } },
  { value: "Africa/Johannesburg", get label() { return automationsT("format.timezones.johannesburg"); }, get group() { return automationsT("format.timezoneGroups.africa"); } },
  { value: "Asia/Dubai", get label() { return automationsT("format.timezones.dubai"); }, get group() { return automationsT("format.timezoneGroups.asia"); } },
  { value: "Asia/Karachi", get label() { return automationsT("format.timezones.karachi"); }, get group() { return automationsT("format.timezoneGroups.asia"); } },
  { value: "Asia/Kolkata", get label() { return automationsT("format.timezones.kolkata"); }, get group() { return automationsT("format.timezoneGroups.asia"); } },
  { value: "Asia/Dhaka", get label() { return automationsT("format.timezones.dhaka"); }, get group() { return automationsT("format.timezoneGroups.asia"); } },
  { value: "Asia/Bangkok", get label() { return automationsT("format.timezones.bangkok"); }, get group() { return automationsT("format.timezoneGroups.asia"); } },
  { value: "Asia/Singapore", get label() { return automationsT("format.timezones.singapore"); }, get group() { return automationsT("format.timezoneGroups.asia"); } },
  { value: "Asia/Shanghai", get label() { return automationsT("format.timezones.shanghai"); }, get group() { return automationsT("format.timezoneGroups.asia"); } },
  { value: "Asia/Hong_Kong", get label() { return automationsT("format.timezones.hongKong"); }, get group() { return automationsT("format.timezoneGroups.asia"); } },
  { value: "Asia/Taipei", get label() { return automationsT("format.timezones.taipei"); }, get group() { return automationsT("format.timezoneGroups.asia"); } },
  { value: "Asia/Tokyo", get label() { return automationsT("format.timezones.tokyo"); }, get group() { return automationsT("format.timezoneGroups.asia"); } },
  { value: "Asia/Seoul", get label() { return automationsT("format.timezones.seoul"); }, get group() { return automationsT("format.timezoneGroups.asia"); } },
  { value: "Australia/Perth", get label() { return automationsT("format.timezones.perth"); }, get group() { return automationsT("format.timezoneGroups.oceania"); } },
  { value: "Australia/Sydney", get label() { return automationsT("format.timezones.sydney"); }, get group() { return automationsT("format.timezoneGroups.oceania"); } },
  { value: "Pacific/Auckland", get label() { return automationsT("format.timezones.auckland"); }, get group() { return automationsT("format.timezoneGroups.oceania"); } },
];

export function timezoneOptionsWithCurrent(timezone: string): TimezoneOption[] {
  const selectedTimezone = timezone.trim();
  if (
    !selectedTimezone ||
    COMMON_TIMEZONE_OPTIONS.some((option) => option.value === selectedTimezone)
  ) {
    return COMMON_TIMEZONE_OPTIONS;
  }
  return [
    {
      value: selectedTimezone,
      label: selectedTimezone,
      group: automationsT("format.timezoneGroups.current"),
    },
    ...COMMON_TIMEZONE_OPTIONS,
  ];
}

export function resolveTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export interface GithubRunSourceSummary {
  repository: string | null;
  event: string | null;
  sourceUrl: string | null;
}

export function parseGithubRunSource(run: AutomationRunSummary): GithubRunSourceSummary | null {
  if (run.trigger_kind !== "github" || !run.trigger_source_json) {
    return null;
  }
  try {
    const parsed = JSON.parse(run.trigger_source_json) as {
      repository_full_name?: unknown;
      event_name?: unknown;
      action?: unknown;
      source_url?: unknown;
    };
    const eventName = typeof parsed.event_name === "string" ? parsed.event_name : null;
    const action = typeof parsed.action === "string" ? parsed.action : null;
    return {
      repository:
        typeof parsed.repository_full_name === "string" ? parsed.repository_full_name : null,
      event: eventName ? [eventName, action].filter(Boolean).join(".") : action,
      sourceUrl: typeof parsed.source_url === "string" ? parsed.source_url : null,
    };
  } catch {
    return null;
  }
}
