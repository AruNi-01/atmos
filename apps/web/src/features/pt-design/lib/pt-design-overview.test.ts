import { describe, expect, test } from "bun:test";
import {
  createMetaForHost,
  displayPtDesignName,
  filterResolvedPtDesigns,
  groupResolvedPtDesigns,
  ptDesignHostForFrame,
  resolvePtDesignList,
  resolvePtDesignOwner,
  searchResolvedPtDesigns,
} from "./pt-design-overview";
import type { Project } from "@/shared/types/domain";
import type { PtDesignListed } from "@atmos/pt-design/catalog";

const projects: Project[] = [
  {
    id: "proj-1",
    name: "Atmos",
    isOpen: true,
    workspaces: [
      {
        id: "ws-1",
        name: "main",
        displayName: "Main",
        branch: "main",
        baseBranch: "main",
        isActive: true,
        status: "clean",
        projectId: "proj-1",
        isPinned: false,
        isArchived: false,
        createdAt: "2026-01-01",
        workflowStatus: "todo",
        priority: "no_priority",
        labels: [],
        localPath: "/tmp/atmos",
        createSource: "manual",
      },
    ],
    mainFilePath: "/tmp/atmos",
    sidebarOrder: 0,
    borderColor: null,
    logoPath: null,
  },
  {
    id: "proj-2",
    name: "localrouter",
    isOpen: true,
    workspaces: [],
    mainFilePath: "/tmp/localrouter",
    sidebarOrder: 1,
    borderColor: "#f00",
    logoPath: null,
  },
];

function listed(id: string, scope: "global" | "project" | "workspace", extra?: Partial<PtDesignListed["meta"]>): PtDesignListed {
  return {
    id,
    key: `pt-design/v2/${id}`,
    doc: { ptx: "<page id=\"page\"></page>\n" },
    meta: {
      id,
      name: extra?.name ?? "",
      scope,
      pinned: extra?.pinned ?? false,
      pinOrder: extra?.pinOrder ?? 0,
      updatedAt: extra?.updatedAt ?? 1,
      openMode: scope === "global" ? "canvas" : "center-tab",
      workspaceId: extra?.workspaceId ?? (scope === "workspace" ? id : undefined),
      projectId: extra?.projectId ?? (scope === "project" ? id : undefined),
    },
  };
}

describe("pt-design overview grouping helpers", () => {
  test("resolves workspace designs onto their parent project", () => {
    expect(resolvePtDesignOwner(listed("ws-1", "workspace").meta, projects)).toMatchObject({
      scope: "project",
      ownerName: "Atmos",
      workspaceId: "ws-1",
      projectId: "proj-1",
    });
    expect(resolvePtDesignOwner(listed("proj-1", "project").meta, projects)).toMatchObject({
      scope: "project",
      ownerName: "Atmos",
      projectId: "proj-1",
    });
    expect(resolvePtDesignOwner(listed("global", "global").meta, projects)).toMatchObject({
      scope: "global",
      ownerName: null,
    });
  });

  test("groups pinned then global then real projects, and folds workspace into the project", () => {
    const rows = resolvePtDesignList(
      [
        listed("global", "global"),
        listed("ws-1", "workspace"),
        listed("doc-p", "project", { projectId: "proj-2", name: "Home" }),
      ],
      projects,
    );
    expect(rows[1]!.group).toBe("project");
    expect(rows[1]!.projectId).toBe("proj-1");
    expect(rows[0]!.group).toBe("global");
    const grouped = groupResolvedPtDesigns(
      rows.map((row, index) => ({ ...row, pinned: index === 2, pinOrder: index === 2 ? 1 : 0 })),
      projects,
    );
    expect(grouped.pinned.map((row) => row.id)).toEqual(["doc-p"]);
    expect(grouped.global.map((row) => row.id)).toEqual(["global"]);
    expect(grouped.projects.map((row) => row.name)).toEqual(["Atmos"]);
    expect(grouped.projects[0]!.items.map((row) => row.id)).toEqual(["ws-1"]);
    expect(filterResolvedPtDesigns(rows, "project").map((row) => row.id).sort()).toEqual(["doc-p", "ws-1"]);
    expect(filterResolvedPtDesigns(rows, "workspace").map((row) => row.id).sort()).toEqual(["doc-p", "ws-1"]);
    expect(searchResolvedPtDesigns(rows, "atmos", "Untitled").map((row) => row.id)).toEqual(["ws-1"]);
    expect(displayPtDesignName(rows[2]!, "Untitled")).toBe("Home");
  });

  test("new designs in a workspace host belong to the parent project", () => {
    expect(createMetaForHost({ kind: "workspace", workspaceId: "ws-1" }, projects)).toEqual({
      scope: "project",
      openMode: "center-tab",
      projectId: "proj-1",
      workspaceId: "ws-1",
    });
    expect(createMetaForHost({ kind: "project", projectId: "proj-2" }, projects)).toEqual({
      scope: "project",
      openMode: "center-tab",
      projectId: "proj-2",
    });
    expect(createMetaForHost({ kind: "global" }, projects)).toEqual({
      scope: "global",
      openMode: "canvas",
    });
    expect(createMetaForHost({ kind: "workspace", workspaceId: "ws-1" }, [])).toEqual({
      scope: "project",
      openMode: "center-tab",
      projectId: undefined,
      workspaceId: "ws-1",
    });
  });

  test("unknown project ids stay in a project group, not global", () => {
    const rows = resolvePtDesignList(
      [listed("doc-x", "project", { projectId: "missing", name: "Board" })],
      [],
    );
    expect(rows[0]).toMatchObject({ group: "project", projectId: "missing" });
    const grouped = groupResolvedPtDesigns(rows, []);
    expect(grouped.global).toEqual([]);
    expect(grouped.projects).toEqual([
      { projectId: "missing", name: "", items: rows },
    ]);
  });

  test("listedDesignTitle prefers the saved name", () => {
    expect(displayPtDesignName({ name: "Home", ownerName: "Atmos" }, "Untitled")).toBe("Home");
    expect(displayPtDesignName({ name: "  ", ownerName: "Atmos" }, "Untitled")).toBe("Atmos");
  });

  test("frame host uses the workspace or project id, not a center-space suffix", () => {
    expect(ptDesignHostForFrame("ws-1", false)).toEqual({ kind: "workspace", workspaceId: "ws-1" });
    expect(ptDesignHostForFrame("proj-1::space::files", true)).toEqual({
      kind: "project",
      projectId: "proj-1",
    });
  });
});
