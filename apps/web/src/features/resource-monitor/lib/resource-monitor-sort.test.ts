import { describe, expect, test } from "bun:test";
import type {
  ResourceProjectMetrics,
  ResourceSessionMetrics,
  ResourceUsage,
  ResourceWorkspaceMetrics,
} from "@atmos/api-types/ws/dto/resource-monitor";
import {
  defaultResourceMonitorSortDirection,
  sortDesktopShellGroups,
  sortResourceMonitorProcesses,
  sortResourceMonitorProjects,
  sortResourceMonitorSessions,
} from "@/features/resource-monitor/lib/resource-monitor-sort";
import { EMPTY_RESOURCE_USAGE } from "@/features/resource-monitor/lib/resource-monitor-hierarchy";

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
  return {
    session_id: id,
    name,
    terminal_kind: "tmux",
    usage: usage(cpu, memory),
    processes: [],
  };
}

function workspace(
  id: string,
  name: string,
  cpu: number,
  memory: number,
  sessions: ResourceSessionMetrics[],
): ResourceWorkspaceMetrics {
  return {
    workspace_id: id,
    name,
    usage: usage(cpu, memory),
    sessions,
    other_usage: EMPTY_RESOURCE_USAGE,
    other_processes: [],
  };
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
    other_usage: EMPTY_RESOURCE_USAGE,
    other_processes: [],
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

  test("reverses every sibling layer when the active direction toggles", () => {
    const sorted = sortResourceMonitorProjects(
      tree,
      "name",
      undefined,
      "descending",
    );
    expect(sorted.map((item) => item.project_id)).toEqual(["p-beta", "p-alpha"]);
    expect(sorted[0]?.workspaces.map((item) => item.workspace_id)).toEqual([
      "w-2",
      "w-1",
    ]);
    expect(
      sorted[0]?.workspaces[0]?.sessions.map((item) => item.session_id),
    ).toEqual(["s-high", "s-low"]);
    expect(sorted[0]?.sessions.map((item) => item.session_id)).toEqual([
      "s-direct-b",
      "s-direct-a",
    ]);
  });

  test("uses ascending for Name and descending for resource columns by default", () => {
    expect(defaultResourceMonitorSortDirection("name")).toBe("ascending");
    expect(defaultResourceMonitorSortDirection("cpu")).toBe("descending");
    expect(defaultResourceMonitorSortDirection("memory")).toBe("descending");
  });
});

describe("sortResourceMonitorProcesses", () => {
  const processes = [
    { name: "vite", usage: usage(2, 40), ports: [5173] },
    { name: "eslint", usage: usage(8, 10), ports: [] },
    { name: "node", usage: usage(8, 30), ports: [3030] },
  ];

  test("sorts process groups by name ascending without flattening parents", () => {
    expect(sortResourceMonitorProcesses(processes, "name").map((item) => item.name)).toEqual([
      "eslint",
      "node",
      "vite",
    ]);
    const tree = [
      project(
        "p",
        "P",
        1,
        1,
        [
          {
            ...workspace("w", "W", 1, 1, [session("s-1", "1", 1, 1)]),
            other_processes: processes,
          },
        ],
        [
          {
            ...session("s-direct", "Direct", 1, 1),
            processes: processes,
          },
        ],
      ),
    ];
    const sorted = sortResourceMonitorProjects(tree, "name");
    expect(sorted[0]?.sessions.map((item) => item.session_id)).toEqual(["s-direct"]);
    expect(sorted[0]?.workspaces.map((item) => item.workspace_id)).toEqual(["w"]);
    expect(sorted[0]?.sessions[0]?.processes.map((item) => item.name)).toEqual([
      "eslint",
      "node",
      "vite",
    ]);
    expect(sorted[0]?.workspaces[0]?.other_processes.map((item) => item.name)).toEqual([
      "eslint",
      "node",
      "vite",
    ]);
  });

  test("sorts process CPU and memory descending with a stable name tie-break", () => {
    expect(sortResourceMonitorProcesses(processes, "cpu").map((item) => item.name)).toEqual([
      "eslint",
      "node",
      "vite",
    ]);
    expect(sortResourceMonitorProcesses(processes, "memory").map((item) => item.name)).toEqual([
      "vite",
      "node",
      "eslint",
    ]);
  });

  test("supports ascending process usage within each process group", () => {
    expect(
      sortResourceMonitorProcesses(processes, "memory", "ascending").map(
        (item) => item.name,
      ),
    ).toEqual(["eslint", "node", "vite"]);
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
