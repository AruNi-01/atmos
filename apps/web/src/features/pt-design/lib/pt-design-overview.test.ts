import { describe, expect, test } from "bun:test";
import {
  designVisibleInHost,
  displayPtDesignName,
  filterResolvedPtDesigns,
  filterResolvedPtDesignsForHost,
  groupResolvedPtDesigns,
  ptDesignOpenHref,
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
];

function listed(id: string, scope: "global" | "project" | "workspace"): PtDesignListed {
  return {
    id,
    key: `pt-design/v2/${id}`,
    doc: { ptx: "<page id=\"page\"></page>\n" },
    meta: {
      id,
      name: "",
      scope,
      pinned: false,
      pinOrder: 0,
      updatedAt: 1,
      openMode: scope === "global" ? "canvas" : "center-tab",
      workspaceId: scope === "workspace" ? id : undefined,
      projectId: scope === "project" ? id : undefined,
    },
  };
}

describe("pt-design overview grouping helpers", () => {
  test("resolves workspace and project owners, and keeps global untitled", () => {
    expect(resolvePtDesignOwner(listed("ws-1", "workspace").meta, projects)).toMatchObject({
      scope: "workspace",
      ownerName: "Main",
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

  test("open href uses the original host: canvas vs center tab", () => {
    const rows = resolvePtDesignList(
      [listed("global", "global"), listed("ws-1", "workspace"), listed("proj-1", "project")],
      projects,
    );
    expect(ptDesignOpenHref(rows[0]!, { kind: "global" })).toBe("/pt-design?design=global");
    expect(ptDesignOpenHref(rows[1]!, { kind: "global" })).toBe(
      "/workspace?id=ws-1&tab=pt-design&design=ws-1",
    );
    expect(ptDesignOpenHref(rows[2]!, { kind: "global" })).toBe(
      "/project?id=proj-1&tab=pt-design&design=proj-1",
    );
    expect(displayPtDesignName(rows[1]!, "Untitled")).toBe("Main");
    expect(displayPtDesignName({ name: "Home", ownerName: "Main" }, "Untitled")).toBe("Home");
  });

  test("project and workspace hosts never link to another context", () => {
    const rows = resolvePtDesignList(
      [listed("global", "global"), listed("ws-1", "workspace"), listed("proj-1", "project")],
      projects,
    );
    expect(designVisibleInHost(rows[0]!, { kind: "project", projectId: "proj-1" })).toBe(false);
    expect(ptDesignOpenHref(rows[0]!, { kind: "project", projectId: "proj-1" })).toBeNull();
    expect(ptDesignOpenHref(rows[2]!, { kind: "project", projectId: "proj-1" })).toBe(
      "/project?id=proj-1&tab=pt-design&design=proj-1",
    );
    expect(ptDesignOpenHref(rows[1]!, { kind: "workspace", workspaceId: "ws-1" })).toBe(
      "/workspace?id=ws-1&tab=pt-design&design=ws-1",
    );
    expect(ptDesignOpenHref(rows[2]!, { kind: "workspace", workspaceId: "ws-1" })).toBeNull();
    expect(filterResolvedPtDesignsForHost(rows, { kind: "project", projectId: "proj-1" }).map((row) => row.id)).toEqual(
      ["proj-1"],
    );
  });

  test("pinned group stays separate from scope groups", () => {
    const rows = resolvePtDesignList(
      [listed("global", "global"), listed("ws-1", "workspace")],
      projects,
    ).map((row, index) => ({ ...row, pinned: index === 1, pinOrder: index === 1 ? 1 : 0 }));
    const grouped = groupResolvedPtDesigns(rows);
    expect(grouped.pinned.map((row) => row.id)).toEqual(["ws-1"]);
    expect(grouped.global.map((row) => row.id)).toEqual(["global"]);
    expect(grouped.workspace).toEqual([]);
    expect(filterResolvedPtDesigns(rows, "workspace").map((row) => row.id)).toEqual(["ws-1"]);
    expect(searchResolvedPtDesigns(rows, "main", "Untitled").map((row) => row.id)).toEqual(["ws-1"]);
  });
});
