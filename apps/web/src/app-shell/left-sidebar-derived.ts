import type { Project, Workspace } from '@/shared/types/domain';
import type { FlattenedWorkspaceEntry } from '@/app-shell/sidebar/workspace-grouping';

type PinnedWorkspaceComparable = {
    workspace: Pick<Workspace, 'id' | 'pinnedAt' | 'pinOrder'>;
};

function comparePinnedWorkspaceEntries<T extends PinnedWorkspaceComparable>(a: T, b: T): number {
    const aOrder = a.workspace.pinOrder;
    const bOrder = b.workspace.pinOrder;
    if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) {
        return aOrder - bOrder;
    }
    if (aOrder !== undefined && bOrder === undefined) return -1;
    if (aOrder === undefined && bOrder !== undefined) return 1;

    const aTime = a.workspace.pinnedAt ? new Date(a.workspace.pinnedAt).getTime() : 0;
    const bTime = b.workspace.pinnedAt ? new Date(b.workspace.pinnedAt).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.workspace.id.localeCompare(b.workspace.id);
}

export function getProjectModeProjects(
    projects: Project[],
    filteredFlattenedWorkspaces: FlattenedWorkspaceEntry[],
    options: {
        hideProjectsWithoutVisibleWorkspaces: boolean;
        shouldApplyWorkspaceFilter: boolean;
    },
): Project[] {
    if (!options.shouldApplyWorkspaceFilter) return projects;

    const visibleWorkspaceIds = new Set(
        filteredFlattenedWorkspaces.map((entry) => entry.workspace.id),
    );
    const filteredProjects = projects.map((project) => ({
        ...project,
        workspaces: project.workspaces.filter((workspace) => visibleWorkspaceIds.has(workspace.id)),
    }));

    if (!options.hideProjectsWithoutVisibleWorkspaces) return filteredProjects;

    return filteredProjects.filter((project) => project.workspaces.length > 0);
}

export function getPinnedWorkspaceEntries(
    entries: FlattenedWorkspaceEntry[],
): FlattenedWorkspaceEntry[] {
    return entries.filter((entry) => entry.workspace.isPinned).sort(comparePinnedWorkspaceEntries);
}

export function getUnpinnedWorkspaceEntries(
    entries: FlattenedWorkspaceEntry[],
): FlattenedWorkspaceEntry[] {
    return entries.filter((entry) => !entry.workspace.isPinned);
}

export function getSelectedProjectPinnedEntries(
    project: Project | null,
): FlattenedWorkspaceEntry[] {
    if (!project) return [];
    return project.workspaces
        .filter((workspace) => workspace.isPinned)
        .map((workspace) => ({
            projectId: project.id,
            projectName: project.name,
            projectPath: project.mainFilePath,
            workspace,
        }))
        .sort(comparePinnedWorkspaceEntries);
}

export function getSelectedProjectUnpinnedWorkspaces(
    project: Project | null,
): Workspace[] {
    return project?.workspaces.filter((workspace) => !workspace.isPinned) ?? [];
}

/**
 * Expand newly seen projects on first load, but never re-expand after the user
 * collapses the last open project (`prev.length === 0` used to mean "not
 * initialized" and immediately unfolded everything again).
 */
export function mergeExpandedProjectIds(
    prev: string[],
    projectIds: string[],
    seenIds: Set<string>,
): string[] {
    if (projectIds.length === 0) return prev;
    if (seenIds.size === 0) {
        for (const id of projectIds) seenIds.add(id);
        return projectIds;
    }
    const added: string[] = [];
    for (const id of projectIds) {
        if (!seenIds.has(id)) {
            seenIds.add(id);
            added.push(id);
        }
    }
    if (added.length === 0) return prev;
    return [...prev, ...added];
}
