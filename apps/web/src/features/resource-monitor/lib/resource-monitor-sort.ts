import type {
  ResourceProcessMetrics,
  ResourceProjectMetrics,
  ResourceSessionMetrics,
  ResourceUsage,
  ResourceWorkspaceMetrics,
} from "@atmos/api-types/ws/dto/resource-monitor";
import type { DesktopShellGroupMetrics } from "@/features/resource-monitor/lib/desktop-shell-metrics";
import { processBasename } from "@/features/resource-monitor/lib/resource-monitor-format";

export type ResourceMonitorSortKey = "name" | "cpu" | "memory";
export type ResourceMonitorSortDirection = "ascending" | "descending";

export const RESOURCE_MONITOR_SORT_KEYS = [
  "name",
  "cpu",
  "memory",
] as const satisfies readonly ResourceMonitorSortKey[];

export function defaultResourceMonitorSortDirection(
  key: ResourceMonitorSortKey,
): ResourceMonitorSortDirection {
  return key === "name" ? "ascending" : "descending";
}

function compareNameAndId(
  leftName: string,
  leftId: string,
  rightName: string,
  rightId: string,
  direction: ResourceMonitorSortDirection,
): number {
  const byName = leftName.localeCompare(rightName, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  const result = byName !== 0 ? byName : leftId.localeCompare(rightId);
  return direction === "ascending" ? result : -result;
}

function compareUsage(
  key: ResourceMonitorSortKey,
  direction: ResourceMonitorSortDirection,
  left: { name: string; id: string; usage: ResourceUsage },
  right: { name: string; id: string; usage: ResourceUsage },
): number {
  if (key === "name") {
    return compareNameAndId(left.name, left.id, right.name, right.id, direction);
  }
  const usageResult =
    key === "cpu"
      ? left.usage.cpu_percent - right.usage.cpu_percent
      : left.usage.memory_rss_bytes - right.usage.memory_rss_bytes;
  if (usageResult !== 0) {
    return direction === "ascending" ? usageResult : -usageResult;
  }
  return compareNameAndId(left.name, left.id, right.name, right.id, "ascending");
}

export type ResourceMonitorSessionNameResolver = (
  session: ResourceSessionMetrics,
) => string;

function sessionSortName(
  session: ResourceSessionMetrics,
  resolveName?: ResourceMonitorSessionNameResolver,
): string {
  return resolveName?.(session) ?? session.name ?? "";
}

export function sortResourceMonitorProcesses(
  processes: readonly ResourceProcessMetrics[],
  key: ResourceMonitorSortKey,
  direction = defaultResourceMonitorSortDirection(key),
): ResourceProcessMetrics[] {
  return [...processes].sort((left, right) =>
    compareUsage(
      key,
      direction,
      {
        name: processBasename(left.name),
        id: left.name,
        usage: left.usage,
      },
      {
        name: processBasename(right.name),
        id: right.name,
        usage: right.usage,
      },
    ),
  );
}

function sortSessionWithProcesses(
  session: ResourceSessionMetrics,
  key: ResourceMonitorSortKey,
  direction: ResourceMonitorSortDirection,
): ResourceSessionMetrics {
  return {
    ...session,
    processes: sortResourceMonitorProcesses(session.processes, key, direction),
  };
}

export function sortResourceMonitorSessions(
  sessions: readonly ResourceSessionMetrics[],
  key: ResourceMonitorSortKey,
  resolveName?: ResourceMonitorSessionNameResolver,
  direction = defaultResourceMonitorSortDirection(key),
): ResourceSessionMetrics[] {
  return [...sessions]
    .sort((left, right) =>
      compareUsage(
        key,
        direction,
        {
          name: sessionSortName(left, resolveName),
          id: left.session_id,
          usage: left.usage,
        },
        {
          name: sessionSortName(right, resolveName),
          id: right.session_id,
          usage: right.usage,
        },
      ),
    )
    .map((session) => sortSessionWithProcesses(session, key, direction));
}

export function sortResourceMonitorWorkspaces(
  workspaces: readonly ResourceWorkspaceMetrics[],
  key: ResourceMonitorSortKey,
  resolveName?: ResourceMonitorSessionNameResolver,
  direction = defaultResourceMonitorSortDirection(key),
): ResourceWorkspaceMetrics[] {
  return [...workspaces]
    .sort((left, right) =>
      compareUsage(
        key,
        direction,
        { name: left.name, id: left.workspace_id, usage: left.usage },
        { name: right.name, id: right.workspace_id, usage: right.usage },
      ),
    )
    .map((workspace) => ({
      ...workspace,
      sessions: sortResourceMonitorSessions(
        workspace.sessions,
        key,
        resolveName,
        direction,
      ),
      other_processes: sortResourceMonitorProcesses(
        workspace.other_processes,
        key,
        direction,
      ),
    }));
}

export function sortResourceMonitorProjects(
  projects: readonly ResourceProjectMetrics[],
  key: ResourceMonitorSortKey,
  resolveName?: ResourceMonitorSessionNameResolver,
  direction = defaultResourceMonitorSortDirection(key),
): ResourceProjectMetrics[] {
  return [...projects]
    .sort((left, right) =>
      compareUsage(
        key,
        direction,
        { name: left.name, id: left.project_id, usage: left.usage },
        { name: right.name, id: right.project_id, usage: right.usage },
      ),
    )
    .map((project) => ({
      ...project,
      sessions: sortResourceMonitorSessions(
        project.sessions,
        key,
        resolveName,
        direction,
      ),
      other_processes: sortResourceMonitorProcesses(
        project.other_processes,
        key,
        direction,
      ),
      workspaces: sortResourceMonitorWorkspaces(
        project.workspaces,
        key,
        resolveName,
        direction,
      ),
    }));
}

export function sortDesktopShellGroups(
  groups: readonly DesktopShellGroupMetrics[],
  key: ResourceMonitorSortKey,
  direction = defaultResourceMonitorSortDirection(key),
): DesktopShellGroupMetrics[] {
  return [...groups].sort((left, right) =>
    compareUsage(
      key,
      direction,
      { name: left.kind, id: left.kind, usage: left.usage },
      { name: right.kind, id: right.kind, usage: right.usage },
    ),
  );
}
