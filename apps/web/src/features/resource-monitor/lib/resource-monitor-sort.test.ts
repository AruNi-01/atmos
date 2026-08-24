import { describe, expect, test } from "bun:test";
import type {
  ResourceProjectMetrics,
  ResourceSessionMetrics,
  ResourceUsage,
  ResourceWorkspaceMetrics,
} from "@atmos/api-types/ws/dto/resource-monitor";
import {
  sortDesktopShellGroups,
  sortResourceMonitorProjects,
  sortResourceMonitorSessions,
} from "@/features/resource-monitor/lib/resource-monitor-sort";

const usage = (cpu: number, memory: number): ResourceUsage => ({
  cpu_percent: cpu,
  memory_rss_bytes: memory,
  process_count: 1,
});

function session(
  id: string,
  name: string | null,
  cpu: number,
  memory: number,
): ResourceSessionMetrics {
  return { session_id: id, name, terminal_kind: "tmux", usage: usage(cpu, memory) };
}

function workspace(
  id: string,
  name: string,
  cpu: number,
  memory: number,
  sessions: ResourceSessionMetrics[],
): ResourceWorkspaceMetrics {
  return { workspace_id: id, name, usage: usage(cpu, memory), sessions };
}

function project(
  id: string,
  name: string,
  cpu: number,
  memory: number,
  workspaces: ResourceWorkspaceMetrics[],
  sessions: ResourceSessionMetrics[] = [],
): ResourceProjectMetrics {
  return {
    project_id: id,
    name,
    usage: usage(cpu, memory),
    direct_usage: usage(0, 0),
    workspaces,
    sessions,
  };
}

describe("sortResourceMonitorProjects", () => {
  const tree = [
    project(
      "p-beta",
      "Beta",
      10,
      200,
      [
        workspace("w-2", "Zed", 4, 40, [
          session("s-low", "alpha", 1, 10),
          session("s-high", "zeta", 9, 10),
        ]),
        workspace("w-1", "Ada", 8, 20, [session("s-ada", "Ada term", 2, 2)]),
      ],
      [session("s-direct-b", "Direct B", 3, 30), session("s-direct-a", "Direct A", 3, 50)],
    ),
    project("p-alpha", "Alpha", 10, 100, [], [session("s-only", "Only", 1, 1)]),
  ];

  test("sorts each hierarchy layer by name without flattening", () => {
    const sorted = sortResourceMonitorProjects(tree, "name");
    expect(sorted.map((item) => item.project_id)).toEqual(["p-alpha", "p-beta"]);
    expect(sorted[1]?.workspaces.map((item) => item.workspace_id)).toEqual(["w-1", "w-2"]);
    expect(sorted[1]?.workspaces[1]?.sessions.map((item) => item.session_id)).toEqual([
      "s-low",
      "s-high",
    ]);
    expect(sorted[1]?.sessions.map((item) => item.session_id)).toEqual([
      "s-direct-a",
      "s-direct-b",
    ]);
    expect(sorted[0]?.workspaces).toEqual([]);
  });

  test("sorts CPU descending with name then id as the tie-break", () => {
    const sorted = sortResourceMonitorProjects(tree, "cpu");
    expect(sorted.map((item) => item.project_id)).toEqual(["p-alpha", "p-beta"]);
    expect(sorted[1]?.workspaces.map((item) => item.workspace_id)).toEqual(["w-1", "w-2"]);
    expect(sorted[1]?.workspaces[1]?.sessions.map((item) => item.session_id)).toEqual([
      "s-high",
      "s-low",
    ]);
    expect(sorted[1]?.sessions.map((item) => item.session_id)).toEqual([
      "s-direct-a",
      "s-direct-b",
    ]);
  });

  test("sorts memory descending and keeps children under their parent", () => {
    const sorted = sortResourceMonitorProjects(tree, "memory");
    expect(sorted.map((item) => item.project_id)).toEqual(["p-beta", "p-alpha"]);
    expect(sorted[0]?.workspaces.map((item) => item.workspace_id)).toEqual(["w-2", "w-1"]);
    expect(sorted[0]?.sessions.map((item) => item.session_id)).toEqual([
      "s-direct-a",
      "s-direct-b",
    ]);
    expect(sorted[0]?.workspaces[0]?.sessions.map((item) => item.session_id)).toEqual([
      "s-low",
      "s-high",
    ]);
  });

  test("name sort uses a display-title resolver instead of the server name", () => {
    const numbered = [
      session("s-1", "1", 1, 1),
      session("s-2", "2", 1, 1),
    ];
    expect(sortResourceMonitorSessions(numbered, "name").map((item) => item.session_id)).toEqual([
      "s-1",
      "s-2",
    ]);

    const resolveName = (item: ResourceSessionMetrics) =>
      item.session_id === "s-1" ? "Zebra app" : "Alpha app";
    expect(
      sortResourceMonitorSessions(numbered, "name", resolveName).map((item) => item.session_id),
    ).toEqual(["s-2", "s-1"]);

    const tree = [
      project("p", "P", 1, 1, [
        workspace("w", "W", 1, 1, [session("s-1", "1", 1, 1), session("s-2", "2", 1, 1)]),
      ]),
    ];
    expect(
      sortResourceMonitorProjects(tree, "name")[0]?.workspaces[0]?.sessions.map(
        (item) => item.session_id,
      ),
    ).toEqual(["s-1", "s-2"]);
    expect(
      sortResourceMonitorProjects(tree, "name", resolveName)[0]?.workspaces[0]?.sessions.map(
        (item) => item.session_id,
      ),
    ).toEqual(["s-2", "s-1"]);
  });

  test("uses id when names are equal", () => {
    const twins = [
      project("p-b", "Same", 1, 1, []),
      project("p-a", "Same", 1, 1, []),
    ];
    expect(sortResourceMonitorProjects(twins, "name").map((item) => item.project_id)).toEqual([
      "p-a",
      "p-b",
    ]);
    expect(sortResourceMonitorProjects(twins, "cpu").map((item) => item.project_id)).toEqual([
      "p-a",
      "p-b",
    ]);
  });
});

describe("sortDesktopShellGroups", () => {
  test("sorts Desktop groups with the same CPU/memory/name rules", () => {
    const groups = [
      { kind: "gpu" as const, usage: usage(1, 30) },
      { kind: "main" as const, usage: usage(4, 10) },
      { kind: "renderer" as const, usage: usage(4, 20) },
    ];
    expect(sortDesktopShellGroups(groups, "cpu").map((item) => item.kind)).toEqual([
      "main",
      "renderer",
      "gpu",
    ]);
    expect(sortDesktopShellGroups(groups, "memory").map((item) => item.kind)).toEqual([
      "gpu",
      "renderer",
      "main",
    ]);
    expect(sortDesktopShellGroups(groups, "name").map((item) => item.kind)).toEqual([
      "gpu",
      "main",
      "renderer",
    ]);
  });
});
