// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { collectProjectGroupStatusPaths, indexGitStatus } from "./workspace-list-git-status";

describe("project group git status paths", () => {
  const sections = [
    {
      items: [
        { id: "p1", kind: "project" as const, projectId: "p1" },
        { id: "w1", kind: "workspace" as const, projectId: "p1" },
        { id: "w2", kind: "workspace" as const, projectId: "p1" },
      ],
      key: "p1",
    },
    {
      items: [
        { id: "p2", kind: "project" as const, projectId: "p2" },
        { id: "w3", kind: "workspace" as const, projectId: "p2" },
      ],
      key: "p2",
    },
  ];

  test("keeps expanded project and workspace paths once", () => {
    const paths = collectProjectGroupStatusPaths({
      expanded: { p2: false },
      grouping: "project",
      projectPathById: new Map([
        ["p1", "/repos/atmos"],
        ["p2", "/repos/other"],
      ]),
      sections,
      workspacePathById: new Map([
        ["w1", "/repos/atmos"],
        ["w2", "  /repos/atmos/editor  "],
        ["w3", "/repos/other/app"],
      ]),
    });
    expect(paths).toEqual(["/repos/atmos", "/repos/atmos/editor"]);
  });

  test("skips non-project groupings and blank paths", () => {
    expect(
      collectProjectGroupStatusPaths({
        expanded: {},
        grouping: "status",
        projectPathById: new Map([["p1", "/repos/atmos"]]),
        sections,
        workspacePathById: new Map([["w1", "/repos/atmos"]]),
      }),
    ).toEqual([]);

    expect(
      collectProjectGroupStatusPaths({
        expanded: {},
        grouping: "project",
        projectPathById: new Map([["p1", "  "]]),
        sections: [
          {
            items: [{ id: "p1", kind: "project", projectId: "p1" }],
            key: "p1",
          },
        ],
        workspacePathById: new Map(),
      }),
    ).toEqual([]);
  });

  test("indexes batch rows and drops missing status", () => {
    const indexed = indexGitStatus([
      {
        path: "/repos/atmos",
        status: { additions: 12, current_branch: "main", deletions: 4, uncommitted_count: 3 },
      },
      { path: "/missing", status: null },
    ]);
    expect(indexed.get("/repos/atmos")).toEqual({
      additions: 12,
      branch: "main",
      deletions: 4,
      uncommitted: 3,
    });
    expect(indexed.has("/missing")).toBe(false);
    expect(indexGitStatus(undefined).size).toBe(0);
  });
});
