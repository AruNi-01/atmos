import { describe, expect, test } from "bun:test";
import type {
  ResourceProcessMetrics,
  ResourceProjectMetrics,
  ResourceSessionMetrics,
  ResourceUsage,
  ResourceWorkspaceMetrics,
} from "@atmos/api-types/ws/dto/resource-monitor";
import {
  buildResourceMonitorScopeSections,
  EMPTY_RESOURCE_USAGE,
  projectChildKinds,
  atmosDefaultOpen,
  hostDefaultOpen,
  projectResourcesDefaultOpen,
  shouldShowOtherProcessesResidual,
  shouldShowProjectResources,
  workspaceDefaultOpen,
} from "@/features/resource-monitor/lib/resource-monitor-hierarchy";

const usage = (cpu: number, memory: number, count = 1): ResourceUsage => ({
  cpu_percent: cpu,
  memory_rss_bytes: memory,
  process_count: count,
});

function processRow(
  name: string,
  cpu = 1,
  memory = 10,
  ports: number[] = [],
): ResourceProcessMetrics {
  return { name, usage: usage(cpu, memory), ports };
}

function session(
  id: string,
  name: string | null = id,
): ResourceSessionMetrics {
  return {
    session_id: id,
    name,
    terminal_kind: "simple",
    usage: usage(1, 10),
    processes: [],
  };
}

function workspace(
  id: string,
  overrides: Partial<ResourceWorkspaceMetrics> = {},
): ResourceWorkspaceMetrics {
  return {
    workspace_id: id,
    name: id,
    usage: usage(2, 20),
    sessions: [],
    other_usage: EMPTY_RESOURCE_USAGE,
    other_processes: [],
    ...overrides,
  };
}

function project(
  overrides: Partial<ResourceProjectMetrics> = {},
): ResourceProjectMetrics {
  return {
    project_id: "p1",
    name: "Atmos",
    usage: usage(4, 40),
    direct_usage: EMPTY_RESOURCE_USAGE,
    workspaces: [],
    sessions: [],
    other_usage: EMPTY_RESOURCE_USAGE,
    other_processes: [],
    ...overrides,
  };
}

describe("projectChildKinds", () => {
  test("places Project resources before every Workspace", () => {
    const tree = project({
      direct_usage: usage(1, 8),
      sessions: [session("s-direct")],
      workspaces: [workspace("w-z"), workspace("w-a")],
    });
    expect(projectChildKinds(tree)).toEqual([
      "project-resources",
      "workspace",
      "workspace",
    ]);
    expect(shouldShowProjectResources(tree)).toBe(true);
    expect(projectResourcesDefaultOpen(tree)).toBe(true);
    expect(workspaceDefaultOpen()).toBe(false);
    expect(hostDefaultOpen()).toBe(false);
    expect(atmosDefaultOpen()).toBe(false);
  });

  test("hides Project resources when direct usage, sessions, and processes are empty", () => {
    const tree = project({
      workspaces: [workspace("w1", { sessions: [session("s-w")] })],
    });
    expect(shouldShowProjectResources(tree)).toBe(false);
    expect(projectChildKinds(tree)).toEqual(["workspace"]);
  });

  test("shows Project resources for other processes even without sessions", () => {
    const tree = project({
      other_usage: usage(1, 12),
      other_processes: [processRow("eslint")],
      workspaces: [workspace("w1")],
    });
    expect(projectChildKinds(tree)).toEqual(["project-resources", "workspace"]);
    expect(projectResourcesDefaultOpen(tree)).toBe(false);
  });
});

describe("buildResourceMonitorScopeSections", () => {
  test("keeps Sessions before Other processes and uses an empty copy when both are absent", () => {
    expect(
      buildResourceMonitorScopeSections(
        [session("s1"), session("s2")],
        usage(2, 20),
        [processRow("node")],
      ).map((section) => section.kind),
    ).toEqual(["sessions", "other-processes"]);
    expect(
      buildResourceMonitorScopeSections([], EMPTY_RESOURCE_USAGE, []).map(
        (section) => section.kind,
      ),
    ).toEqual(["empty"]);
  });

  test("emits a residual Other processes row when usage exists without a process list", () => {
    const otherUsage = usage(3, 90, 2);
    expect(shouldShowOtherProcessesResidual(otherUsage, [])).toBe(true);
    const sections = buildResourceMonitorScopeSections([], otherUsage, []);
    expect(sections).toEqual([
      {
        kind: "other-processes",
        processes: [],
        residual: true,
        residualUsage: otherUsage,
      },
    ]);
    expect(shouldShowOtherProcessesResidual(EMPTY_RESOURCE_USAGE, [])).toBe(false);
    expect(
      shouldShowOtherProcessesResidual(otherUsage, [processRow("vite")]),
    ).toBe(false);
  });
});
