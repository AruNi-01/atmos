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
    activeKanbanFilterCount: number,
): Project[] {
    if (activeKanbanFilterCount === 0) return projects;

    const visibleWorkspaceIds = new Set(
        filteredFlattenedWorkspaces.map((entry) => entry.workspace.id),
    );
    return projects
        .map((project) => ({
            ...project,
            workspaces: project.workspaces.filter((workspace) => visibleWorkspaceIds.has(workspace.id)),
        }))
        .filter((project) => project.workspaces.length > 0);
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
