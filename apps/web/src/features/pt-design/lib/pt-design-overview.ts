import {
  groupPinnedPtDesigns,
  inferPtDesignMeta,
  listPtDesignDocs,
  type PtDesignFilterScope,
  type PtDesignHostContext,
  type PtDesignListed,
  type PtDesignMeta,
  type PtDesignOpenMode,
  type PtDesignScope,
} from "@atmos/pt-design/catalog";
import type { Project } from "@/shared/types/domain";

export type { PtDesignHostContext };

const CENTER_SPACE_KEY_MARK = "::space::";

export function ptDesignHostForFrame(
  contextId: string,
  isProject: boolean,
): PtDesignHostContext {
  const index = contextId.indexOf(CENTER_SPACE_KEY_MARK);
  const hostId = index === -1 ? contextId : contextId.slice(0, index);
  if (isProject) return { kind: "project", projectId: hostId };
  return { kind: "workspace", workspaceId: hostId };
}

export type ResolvedPtDesign = {
  id: string;
  name: string;
  scope: PtDesignScope;
  group: "global" | "project";
  openMode: PtDesignOpenMode;
  preview?: string;
  pinned: boolean;
  pinOrder: number;
  updatedAt: number;
  projectId?: string;
  workspaceId?: string;
  ownerName: string | null;
};

export function hostMetaForContext(
  contextId: string,
  projects: Project[],
  override?: { openMode?: PtDesignOpenMode; name?: string },
): Partial<PtDesignMeta> {
  const listed = listPtDesignDocs().find((row) => row.id === contextId)?.meta;
  if (listed) {
    return {
      id: contextId,
      name: override?.name ?? listed.name,
      scope: listed.scope,
      openMode: override?.openMode ?? listed.openMode,
      projectId: listed.projectId,
      workspaceId: listed.workspaceId,
    };
  }
  const resolved = resolvePtDesignOwner(inferPtDesignMeta(contextId), projects);
  return {
    id: contextId,
    name: override?.name,
    scope: resolved.scope,
    openMode: override?.openMode ?? resolved.openMode,
    projectId: resolved.projectId,
    workspaceId: resolved.workspaceId,
  };
}

export function resolvePtDesignOwner(
  meta: Pick<PtDesignMeta, "id" | "scope" | "openMode" | "projectId" | "workspaceId" | "name">,
  projects: Project[],
): {
  scope: PtDesignScope;
  openMode: PtDesignOpenMode;
  ownerName: string | null;
  projectId?: string;
  workspaceId?: string;
} {
  const byProject = projects.find((project) => project.id === meta.id || project.id === meta.projectId);
  if (byProject && (byProject.id === meta.id || meta.scope === "project")) {
    if (byProject.id === meta.id) {
      return {
        scope: "project",
        openMode: meta.openMode === "canvas" ? "canvas" : "center-tab",
        ownerName: byProject.name,
        projectId: byProject.id,
      };
    }
  }

  for (const project of projects) {
    const workspace = project.workspaces.find(
      (row) => row.id === meta.id || row.id === meta.workspaceId,
    );
    if (!workspace) continue;
    return {
      scope: meta.scope === "global" ? "global" : "project",
      openMode: meta.openMode === "canvas" ? "canvas" : "center-tab",
      ownerName: project.name,
      projectId: project.id,
      workspaceId: workspace.id,
    };
  }

  if (meta.scope === "project" || byProject) {
    return {
      scope: "project",
      openMode: meta.openMode === "canvas" ? "canvas" : "center-tab",
      ownerName: byProject?.name ?? null,
      projectId: meta.projectId ?? meta.id,
    };
  }

  if (meta.scope === "global") {
    return { scope: "global", openMode: meta.openMode, ownerName: null };
  }

  return {
    scope: "workspace",
    openMode: meta.openMode,
    ownerName: null,
    workspaceId: meta.workspaceId ?? meta.id,
  };
}

export function resolvePtDesignList(listed: PtDesignListed[], projects: Project[]): ResolvedPtDesign[] {
  return listed.map((item) => {
    const owner = resolvePtDesignOwner(item.meta, projects);
    const projectId =
      item.meta.scope === "global"
        ? undefined
        : owner.projectId ?? item.meta.projectId ?? "unresolved";
    const group: "global" | "project" = item.meta.scope === "global" ? "global" : "project";
    return {
      id: item.id,
      name: item.meta.name,
      scope: item.meta.scope,
      group,
      openMode: owner.openMode,
      preview: item.meta.preview,
      pinned: item.meta.pinned,
      pinOrder: item.meta.pinOrder,
      updatedAt: item.meta.updatedAt,
      projectId: group === "project" ? projectId : undefined,
      workspaceId: item.meta.workspaceId,
      ownerName: group === "project" ? owner.ownerName : null,
    };
  });
}

export function createMetaForHost(
  host: PtDesignHostContext,
  projects: Project[],
): { scope: PtDesignScope; openMode: PtDesignOpenMode; projectId?: string; workspaceId?: string } {
  if (host.kind === "project") {
    return { scope: "project", openMode: "center-tab", projectId: host.projectId };
  }
  if (host.kind === "workspace") {
    const project = projects.find((row) => row.workspaces.some((workspace) => workspace.id === host.workspaceId));
    return {
      scope: "project",
      openMode: "center-tab",
      projectId: project?.id,
      workspaceId: host.workspaceId,
    };
  }
  return { scope: "global", openMode: "canvas" };
}

export function displayPtDesignName(
  item: Pick<ResolvedPtDesign, "name" | "ownerName">,
  untitled: string,
): string {
  const named = item.name.trim();
  if (named) return named;
  if (item.ownerName?.trim()) return item.ownerName.trim();
  return untitled;
}

export function filterResolvedPtDesigns(
  items: ResolvedPtDesign[],
  scope: PtDesignFilterScope,
): ResolvedPtDesign[] {
  if (scope === "all") return items;
  if (scope === "global") return items.filter((item) => item.group === "global");
  return items.filter((item) => item.group === "project");
}

export function searchResolvedPtDesigns(
  items: ResolvedPtDesign[],
  query: string,
  untitled: string,
): ResolvedPtDesign[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => {
    const name = displayPtDesignName(item, untitled).toLowerCase();
    const owner = item.ownerName?.toLowerCase() ?? "";
    return name.includes(needle) || owner.includes(needle);
  });
}

export type PtDesignProjectGroup = {
  projectId: string;
  name: string;
  project?: Project;
  items: ResolvedPtDesign[];
};

export function groupResolvedPtDesigns(
  items: ResolvedPtDesign[],
  projects: Project[],
): {
  pinned: ResolvedPtDesign[];
  global: ResolvedPtDesign[];
  projects: PtDesignProjectGroup[];
} {
  const grouped = groupPinnedPtDesigns(
    items.map((item) => ({
      item,
      meta: { pinned: item.pinned, pinOrder: item.pinOrder, updatedAt: item.updatedAt },
    })),
  );
  const rest = grouped.rest.map((row) => row.item);
  const byProject = new Map<string, ResolvedPtDesign[]>();
  for (const item of rest) {
    if (item.group !== "project" || !item.projectId) continue;
    const list = byProject.get(item.projectId) ?? [];
    list.push(item);
    byProject.set(item.projectId, list);
  }
  const ordered: PtDesignProjectGroup[] = [...projects]
    .sort((left, right) => left.sidebarOrder - right.sidebarOrder)
    .filter((project) => byProject.has(project.id))
    .map((project) => ({
      projectId: project.id,
      name: project.name,
      project,
      items: byProject.get(project.id)!,
    }));
  const seen = new Set(ordered.map((row) => row.projectId));
  for (const [projectId, projectItems] of byProject) {
    if (seen.has(projectId)) continue;
    ordered.push({
      projectId,
      name: projectItems[0]?.ownerName?.trim() || "",
      items: projectItems,
    });
  }
  return {
    pinned: grouped.pinned.map((row) => row.item),
    global: rest.filter((item) => item.group === "global"),
    projects: ordered,
  };
}

export function listedDesignTitle(id: string, untitled: string): string | null {
  const row = listPtDesignDocs().find((item) => item.id === id);
  if (!row) return null;
  const named = row.meta.name.trim();
  if (named) return named;
  return untitled;
}
