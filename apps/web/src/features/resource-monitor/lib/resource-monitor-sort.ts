import type {
  ResourceProjectMetrics,
  ResourceSessionMetrics,
  ResourceUsage,
  ResourceWorkspaceMetrics,
} from "@atmos/api-types/ws/dto/resource-monitor";
import type { DesktopShellGroupMetrics } from "@/features/resource-monitor/lib/desktop-shell-metrics";

export type ResourceMonitorSortKey = "name" | "cpu" | "memory";

export const RESOURCE_MONITOR_SORT_KEYS = [
  "name",
  "cpu",
  "memory",
] as const satisfies readonly ResourceMonitorSortKey[];

function compareNameAndId(leftName: string, leftId: string, rightName: string, rightId: string): number {
  const byName = leftName.localeCompare(rightName, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (byName !== 0) return byName;
  return leftId.localeCompare(rightId);
}

function compareUsage(
  key: ResourceMonitorSortKey,
  left: { name: string; id: string; usage: ResourceUsage },
  right: { name: string; id: string; usage: ResourceUsage },
): number {
  if (key === "cpu") {
    const byCpu = right.usage.cpu_percent - left.usage.cpu_percent;
    if (byCpu !== 0) return byCpu;
  } else if (key === "memory") {
    const byMemory = right.usage.memory_rss_bytes - left.usage.memory_rss_bytes;
    if (byMemory !== 0) return byMemory;
  }
  return compareNameAndId(left.name, left.id, right.name, right.id);
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

export function sortResourceMonitorSessions(
  sessions: readonly ResourceSessionMetrics[],
  key: ResourceMonitorSortKey,
  resolveName?: ResourceMonitorSessionNameResolver,
): ResourceSessionMetrics[] {
  return [...sessions].sort((left, right) =>
    compareUsage(
      key,
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
  );
}

export function sortResourceMonitorWorkspaces(
  workspaces: readonly ResourceWorkspaceMetrics[],
  key: ResourceMonitorSortKey,
  resolveName?: ResourceMonitorSessionNameResolver,
): ResourceWorkspaceMetrics[] {
  return [...workspaces]
    .sort((left, right) =>
      compareUsage(
        key,
        { name: left.name, id: left.workspace_id, usage: left.usage },
        { name: right.name, id: right.workspace_id, usage: right.usage },
      ),
    )
    .map((workspace) => ({
      ...workspace,
      sessions: sortResourceMonitorSessions(workspace.sessions, key, resolveName),
    }));
}

export function sortResourceMonitorProjects(
  projects: readonly ResourceProjectMetrics[],
  key: ResourceMonitorSortKey,
  resolveName?: ResourceMonitorSessionNameResolver,
): ResourceProjectMetrics[] {
  return [...projects]
    .sort((left, right) =>
      compareUsage(
        key,
        { name: left.name, id: left.project_id, usage: left.usage },
        { name: right.name, id: right.project_id, usage: right.usage },
      ),
    )
    .map((project) => ({
      ...project,
      sessions: sortResourceMonitorSessions(project.sessions, key, resolveName),
      workspaces: sortResourceMonitorWorkspaces(project.workspaces, key, resolveName),
    }));
}

export function sortDesktopShellGroups(
  groups: readonly DesktopShellGroupMetrics[],
  key: ResourceMonitorSortKey,
): DesktopShellGroupMetrics[] {
  return [...groups].sort((left, right) =>
    compareUsage(
      key,
      { name: left.kind, id: left.kind, usage: left.usage },
      { name: right.kind, id: right.kind, usage: right.usage },
    ),
  );
}
