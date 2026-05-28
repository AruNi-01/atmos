import type {
  AutomationArtifactKind,
  AutomationRunStatus,
  AutomationRunSummary,
  AutomationSummary,
  AutomationTargetInput,
  AutomationTargetKind,
} from "@/features/automations/types";
import type { Project, Workspace } from "@/shared/types/domain";

export function buildTargetInput(
  targetKind: AutomationTargetKind,
  projectGuid: string,
  workspaceGuid: string,
): AutomationTargetInput {
  if (targetKind === "project") {
    return { target_kind: "project", project_guid: projectGuid, workspace_guid: null };
  }
  if (targetKind === "new_workspace") {
    return { target_kind: "new_workspace", project_guid: projectGuid, workspace_guid: null };
  }
  if (targetKind === "workspace") {
    return { target_kind: "workspace", project_guid: null, workspace_guid: workspaceGuid };
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
    return "Standalone";
  }
  if (automation.target_kind === "project") {
    return projects.find((project) => project.id === automation.project_guid)?.name ?? "Project";
  }
  if (automation.target_kind === "new_workspace") {
    const projectName = projects.find((project) => project.id === automation.project_guid)?.name;
    return projectName ? `New workspace in ${projectName}` : "New workspace";
  }
  for (const project of projects) {
    const workspace = project.workspaces.find((item) => item.id === automation.workspace_guid);
    if (workspace) {
      return `${workspace.displayName || workspace.name} / ${project.name}`;
    }
  }
  return "Workspace";
}

export function formatTargetKind(kind: AutomationTargetKind) {
  switch (kind) {
    case "project":
      return "Project";
    case "workspace":
      return "Workspace";
    case "new_workspace":
      return "New Workspace";
    case "standalone":
      return "Standalone";
  }
}

export function formatScheduleLabel(automation: AutomationSummary) {
  if (automation.trigger_kind === "github") {
    return automation.trigger_status === "active"
      ? "GitHub"
      : `GitHub · ${automation.trigger_status.replace(/_/g, " ")}`;
  }
  if (!automation.schedule_enabled || !automation.schedule_kind) {
    return "Manual";
  }
  return automation.schedule_kind === "cron"
    ? `Cron ${automation.schedule_expr ?? ""}`.trim()
    : capitalize(automation.schedule_kind);
}

export function artifactLabel(kind: AutomationArtifactKind) {
  switch (kind) {
    case "final":
      return "Result";
    case "output":
      return "Output Log";
    case "prompt":
      return "Prompt";
    case "run_json":
      return "Run JSON";
  }
}

export function formatDateTime(value: string | null) {
  if (!value) return "None";
  const normalized = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
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
  { value: "UTC", label: "UTC", group: "Universal" },
  { value: "America/Los_Angeles", label: "Los Angeles", group: "Americas" },
  { value: "America/Denver", label: "Denver", group: "Americas" },
  { value: "America/Chicago", label: "Chicago", group: "Americas" },
  { value: "America/New_York", label: "New York", group: "Americas" },
  { value: "America/Toronto", label: "Toronto", group: "Americas" },
  { value: "America/Sao_Paulo", label: "Sao Paulo", group: "Americas" },
  { value: "Europe/London", label: "London", group: "Europe" },
  { value: "Europe/Paris", label: "Paris", group: "Europe" },
  { value: "Europe/Berlin", label: "Berlin", group: "Europe" },
  { value: "Europe/Madrid", label: "Madrid", group: "Europe" },
  { value: "Europe/Amsterdam", label: "Amsterdam", group: "Europe" },
  { value: "Europe/Moscow", label: "Moscow", group: "Europe" },
  { value: "Africa/Cairo", label: "Cairo", group: "Africa" },
  { value: "Africa/Johannesburg", label: "Johannesburg", group: "Africa" },
  { value: "Asia/Dubai", label: "Dubai", group: "Asia" },
  { value: "Asia/Karachi", label: "Karachi", group: "Asia" },
  { value: "Asia/Kolkata", label: "Kolkata", group: "Asia" },
  { value: "Asia/Dhaka", label: "Dhaka", group: "Asia" },
  { value: "Asia/Bangkok", label: "Bangkok", group: "Asia" },
  { value: "Asia/Singapore", label: "Singapore", group: "Asia" },
  { value: "Asia/Shanghai", label: "Shanghai", group: "Asia" },
  { value: "Asia/Hong_Kong", label: "Hong Kong", group: "Asia" },
  { value: "Asia/Taipei", label: "Taipei", group: "Asia" },
  { value: "Asia/Tokyo", label: "Tokyo", group: "Asia" },
  { value: "Asia/Seoul", label: "Seoul", group: "Asia" },
  { value: "Australia/Perth", label: "Perth", group: "Oceania" },
  { value: "Australia/Sydney", label: "Sydney", group: "Oceania" },
  { value: "Pacific/Auckland", label: "Auckland", group: "Oceania" },
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
      group: "Current",
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
