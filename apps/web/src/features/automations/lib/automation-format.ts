import type {
  AutomationArtifactKind,
  AutomationRunStatus,
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

export function resolveTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
