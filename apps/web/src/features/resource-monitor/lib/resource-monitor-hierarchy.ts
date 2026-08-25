import type {
  ResourceProcessMetrics,
  ResourceProjectMetrics,
  ResourceSessionMetrics,
  ResourceUsage,
} from "@atmos/api-types/ws/dto/resource-monitor";
import { isUsageVisible } from "@/features/resource-monitor/lib/resource-monitor-format";

export const EMPTY_RESOURCE_USAGE: ResourceUsage = Object.freeze({
  cpu_percent: 0,
  memory_rss_bytes: 0,
  process_count: 0,
});

export type ResourceMonitorScopeSection =
  | { kind: "sessions"; sessions: ResourceSessionMetrics[] }
  | {
      kind: "other-processes";
      processes: ResourceProcessMetrics[];
      residual: boolean;
      residualUsage: ResourceUsage;
    }
  | { kind: "empty" };

export type ResourceMonitorProjectChildKind = "project-resources" | "workspace";

export function shouldShowOtherProcessesResidual(
  otherUsage: ResourceUsage,
  otherProcesses: readonly ResourceProcessMetrics[],
): boolean {
  return otherProcesses.length === 0 && isUsageVisible(otherUsage);
}

export function shouldShowProjectResources(project: ResourceProjectMetrics): boolean {
  return (
    isUsageVisible(project.direct_usage) ||
    project.sessions.length > 0 ||
    project.other_processes.length > 0 ||
    isUsageVisible(project.other_usage)
  );
}

export function buildResourceMonitorScopeSections(
  sessions: readonly ResourceSessionMetrics[],
  otherUsage: ResourceUsage,
  otherProcesses: readonly ResourceProcessMetrics[],
): ResourceMonitorScopeSection[] {
  const residual = shouldShowOtherProcessesResidual(otherUsage, otherProcesses);
  const hasOther = otherProcesses.length > 0 || residual;
  if (sessions.length === 0 && !hasOther) {
    return [{ kind: "empty" }];
  }
  const sections: ResourceMonitorScopeSection[] = [];
  if (sessions.length > 0) {
    sections.push({ kind: "sessions", sessions: [...sessions] });
  }
  if (hasOther) {
    sections.push({
      kind: "other-processes",
      processes: [...otherProcesses],
      residual,
      residualUsage: otherUsage,
    });
  }
  return sections;
}

export function projectChildKinds(
  project: ResourceProjectMetrics,
): ResourceMonitorProjectChildKind[] {
  return [
    ...(shouldShowProjectResources(project) ? (["project-resources"] as const) : []),
    ...project.workspaces.map(() => "workspace" as const),
  ];
}

export function projectResourcesDefaultOpen(project: ResourceProjectMetrics): boolean {
  return project.sessions.length > 0;
}

export function workspaceDefaultOpen(): boolean {
  return false;
}

export function hostDefaultOpen(): boolean {
  return false;
}

export function atmosDefaultOpen(): boolean {
  return false;
}
