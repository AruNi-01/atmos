import {
  designListedInHost,
  filterPtDesigns,
  filterPtDesignsByHost,
  groupPinnedPtDesigns,
  inferPtDesignMeta,
  type PtDesignFilterScope,
  type PtDesignHostContext,
  type PtDesignListed,
  type PtDesignMeta,
  type PtDesignOpenMode,
  type PtDesignScope,
} from "@atmos/pt-design/catalog";
import type { Project } from "@/shared/types/domain";

export type { PtDesignHostContext };

export type ResolvedPtDesign = {
  id: string;
  name: string;
  scope: PtDesignScope;
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
      scope: "workspace",
      openMode: meta.openMode === "canvas" ? "canvas" : "center-tab",
      ownerName: workspace.displayName?.trim() || workspace.name,
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
    return {
      id: item.id,
      name: item.meta.name,
      scope: owner.scope,
      openMode: owner.openMode,
      preview: item.meta.preview,
      pinned: item.meta.pinned,
      pinOrder: item.meta.pinOrder,
      updatedAt: item.meta.updatedAt,
      projectId: owner.projectId,
      workspaceId: owner.workspaceId,
      ownerName: owner.ownerName,
    };
  });
}

export function ptDesignOpenHref(
  item: Pick<ResolvedPtDesign, "id" | "scope" | "openMode" | "projectId" | "workspaceId">,
  host: PtDesignHostContext = { kind: "global" },
): string | null {
  if (!designVisibleInHost(item, host)) return null;
  if (host.kind === "workspace") {
    return `/workspace?id=${encodeURIComponent(host.workspaceId)}&tab=pt-design&design=${encodeURIComponent(item.id)}`;
  }
  if (host.kind === "project") {
    return `/project?id=${encodeURIComponent(host.projectId)}&tab=pt-design&design=${encodeURIComponent(item.id)}`;
  }
  if (item.openMode === "center-tab" && item.scope === "workspace" && item.workspaceId) {
    return `/workspace?id=${encodeURIComponent(item.workspaceId)}&tab=pt-design&design=${encodeURIComponent(item.id)}`;
  }
  if (item.openMode === "center-tab" && item.scope === "project" && item.projectId) {
    return `/project?id=${encodeURIComponent(item.projectId)}&tab=pt-design&design=${encodeURIComponent(item.id)}`;
  }
  return `/pt-design?design=${encodeURIComponent(item.id)}`;
}

export function designVisibleInHost(
  item: Pick<ResolvedPtDesign, "id" | "scope" | "projectId" | "workspaceId">,
  host: PtDesignHostContext,
): boolean {
  return designListedInHost(
    {
      id: item.id,
      scope: item.scope,
      projectId: item.projectId,
      workspaceId: item.workspaceId,
    },
    host,
  );
}

export function filterResolvedPtDesignsForHost(
  items: ResolvedPtDesign[],
  host: PtDesignHostContext,
): ResolvedPtDesign[] {
  return filterPtDesignsByHost(
    items.map((item) => ({
      item,
      meta: {
        id: item.id,
        scope: item.scope,
        projectId: item.projectId,
        workspaceId: item.workspaceId,
      },
    })),
    host,
  ).map((row) => row.item);
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
  return filterPtDesigns(
    items.map((item) => ({ item, meta: { scope: item.scope } })),
    scope,
  ).map((row) => row.item);
}

export function groupResolvedPtDesigns(items: ResolvedPtDesign[]): {
  pinned: ResolvedPtDesign[];
  project: ResolvedPtDesign[];
  workspace: ResolvedPtDesign[];
  global: ResolvedPtDesign[];
} {
  const grouped = groupPinnedPtDesigns(
    items.map((item) => ({
      item,
      meta: { pinned: item.pinned, pinOrder: item.pinOrder, updatedAt: item.updatedAt },
    })),
  );
  const rest = grouped.rest.map((row) => row.item);
  return {
    pinned: grouped.pinned.map((row) => row.item),
    project: rest.filter((item) => item.scope === "project"),
    workspace: rest.filter((item) => item.scope === "workspace"),
    global: rest.filter((item) => item.scope === "global"),
  };
}
