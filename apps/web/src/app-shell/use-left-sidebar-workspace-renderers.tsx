import React, { useCallback } from 'react';

import { WorkspaceContent } from '@/app-shell/sidebar/WorkspaceContent';
import { WorkspaceItem } from '@/app-shell/sidebar/WorkspaceItem';
import {
    KanbanWorkspaceCard,
    type KanbanCardProperties,
} from '@/app-shell/sidebar/WorkspaceKanbanView';
import type { FlattenedWorkspaceEntry } from '@/app-shell/sidebar/workspace-grouping';
import type { WorkspaceLabel, WorkspacePriority, WorkspaceWorkflowStatus } from '@/shared/types/domain';

interface UseLeftSidebarWorkspaceRenderersParams {
    archiveWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
    createWorkspaceLabel: (data: { name: string; color: string; source?: WorkspaceLabel['source'] }) => Promise<WorkspaceLabel>;
    deleteWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
    onEnterWorkspaceFromKanban: (projectId: string, workspaceId: string) => void;
    pinWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
    secondColumnKanbanCardProperties: KanbanCardProperties;
    unpinWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
    updateWorkspaceLabel: (labelId: string, data: { name: string; color: string }) => Promise<WorkspaceLabel>;
    updateWorkspaceLabels: (projectId: string, workspaceId: string, labels: WorkspaceLabel[]) => Promise<void>;
    updateWorkspaceName: (projectId: string, workspaceId: string, name: string) => Promise<void>;
    updateWorkspacePriority: (projectId: string, workspaceId: string, priority: WorkspacePriority) => Promise<void>;
    updateWorkspaceWorkflowStatus: (projectId: string, workspaceId: string, workflowStatus: WorkspaceWorkflowStatus) => Promise<void>;
    workspaceLabels: WorkspaceLabel[];
}

interface WorkspaceItemRowOptions {
    showProjectName?: boolean;
    rightContext?: React.ReactNode;
    suppressInfoPopover?: boolean;
    sortingDisabled?: boolean;
    sortingDisabledMessage?: string;
}

interface WorkspaceContentRowOptions {
    showProjectName?: boolean;
    rightContext?: React.ReactNode;
}

interface WorkspaceKanbanCardOptions {
    cardProperties?: KanbanCardProperties;
    showUnpinnedBorder?: boolean;
}

export function useLeftSidebarWorkspaceRenderers({
    archiveWorkspace,
    createWorkspaceLabel,
    deleteWorkspace,
    onEnterWorkspaceFromKanban,
    pinWorkspace,
    secondColumnKanbanCardProperties,
    unpinWorkspace,
    updateWorkspaceLabel,
    updateWorkspaceLabels,
    updateWorkspaceName,
    updateWorkspacePriority,
    updateWorkspaceWorkflowStatus,
    workspaceLabels,
}: UseLeftSidebarWorkspaceRenderersParams) {
    const renderWorkspaceItemRow = useCallback((
        entry: FlattenedWorkspaceEntry,
        options?: WorkspaceItemRowOptions,
    ) => (
        <WorkspaceItem
            key={entry.workspace.id}
            workspace={entry.workspace}
            projectId={entry.projectId}
            projectName={entry.projectName}
            projectPath={entry.projectPath}
            showProjectName={options?.showProjectName}
            rightContext={options?.rightContext}
            suppressInfoPopover={options?.suppressInfoPopover}
            sortingDisabled={options?.sortingDisabled}
            sortingDisabledMessage={options?.sortingDisabledMessage}
            onPin={(workspaceId) => pinWorkspace(entry.projectId, workspaceId)}
            onUnpin={(workspaceId) => unpinWorkspace(entry.projectId, workspaceId)}
            onArchive={(workspaceId) => archiveWorkspace(entry.projectId, workspaceId)}
            onDelete={(workspaceId) => deleteWorkspace(entry.projectId, workspaceId)}
            onUpdateWorkflowStatus={(workspaceId, workflowStatus) =>
                updateWorkspaceWorkflowStatus(entry.projectId, workspaceId, workflowStatus)
            }
            onUpdatePriority={(workspaceId, priority) =>
                updateWorkspacePriority(entry.projectId, workspaceId, priority)
            }
            availableLabels={workspaceLabels}
            onCreateLabel={createWorkspaceLabel}
            onUpdateLabel={updateWorkspaceLabel}
            onUpdateLabels={(workspaceId, labels) =>
                updateWorkspaceLabels(entry.projectId, workspaceId, labels)
            }
            onUpdateName={(workspaceId, name) =>
                updateWorkspaceName(entry.projectId, workspaceId, name)
            }
        />
    ), [
        archiveWorkspace,
        createWorkspaceLabel,
        deleteWorkspace,
        pinWorkspace,
        unpinWorkspace,
        updateWorkspaceLabel,
        updateWorkspaceLabels,
        updateWorkspaceName,
        updateWorkspacePriority,
        updateWorkspaceWorkflowStatus,
        workspaceLabels,
    ]);

    const renderWorkspaceContentRow = useCallback((
        entry: FlattenedWorkspaceEntry,
        options?: WorkspaceContentRowOptions,
    ) => (
        <WorkspaceContent
            key={entry.workspace.id}
            workspace={entry.workspace}
            projectId={entry.projectId}
            projectName={entry.projectName}
            projectPath={entry.projectPath}
            showProjectName={options?.showProjectName}
            rightContext={options?.rightContext}
            onPin={(workspaceId) => pinWorkspace(entry.projectId, workspaceId)}
            onUnpin={(workspaceId) => unpinWorkspace(entry.projectId, workspaceId)}
            onArchive={(workspaceId) => archiveWorkspace(entry.projectId, workspaceId)}
            onDelete={(workspaceId) => deleteWorkspace(entry.projectId, workspaceId)}
            onUpdateWorkflowStatus={(workspaceId, workflowStatus) =>
                updateWorkspaceWorkflowStatus(entry.projectId, workspaceId, workflowStatus)
            }
            onUpdatePriority={(workspaceId, priority) =>
                updateWorkspacePriority(entry.projectId, workspaceId, priority)
            }
            availableLabels={workspaceLabels}
            onCreateLabel={createWorkspaceLabel}
            onUpdateLabel={updateWorkspaceLabel}
            onUpdateLabels={(workspaceId, labels) =>
                updateWorkspaceLabels(entry.projectId, workspaceId, labels)
            }
            onUpdateName={(workspaceId, name) =>
                updateWorkspaceName(entry.projectId, workspaceId, name)
            }
        />
    ), [
        archiveWorkspace,
        createWorkspaceLabel,
        deleteWorkspace,
        pinWorkspace,
        unpinWorkspace,
        updateWorkspaceLabel,
        updateWorkspaceLabels,
        updateWorkspaceName,
        updateWorkspacePriority,
        updateWorkspaceWorkflowStatus,
        workspaceLabels,
    ]);

    const renderWorkspaceKanbanCard = useCallback((
        entry: FlattenedWorkspaceEntry,
        options?: WorkspaceKanbanCardOptions,
    ) => (
        <KanbanWorkspaceCard
            workspace={entry.workspace}
            projectId={entry.projectId}
            projectName={entry.projectName}
            cardProperties={options?.cardProperties ?? secondColumnKanbanCardProperties}
            showUnpinnedBorder={options?.showUnpinnedBorder ?? true}
            onEnterWorkspace={onEnterWorkspaceFromKanban}
            availableLabels={workspaceLabels}
            onUpdateWorkflowStatus={(projectId, workspaceId, workflowStatus) =>
                updateWorkspaceWorkflowStatus(projectId, workspaceId, workflowStatus)
            }
            onUpdatePriority={(projectId, workspaceId, priority) =>
                updateWorkspacePriority(projectId, workspaceId, priority)
            }
            onCreateLabel={createWorkspaceLabel}
            onUpdateLabel={updateWorkspaceLabel}
            onUpdateLabels={(projectId, workspaceId, labels) =>
                updateWorkspaceLabels(projectId, workspaceId, labels)
            }
            onPinWorkspace={(projectId, workspaceId) => pinWorkspace(projectId, workspaceId)}
            onUnpinWorkspace={(projectId, workspaceId) => unpinWorkspace(projectId, workspaceId)}
            onArchiveWorkspace={(projectId, workspaceId) => archiveWorkspace(projectId, workspaceId)}
            onDeleteWorkspace={(projectId, workspaceId) => deleteWorkspace(projectId, workspaceId)}
        />
    ), [
        archiveWorkspace,
        createWorkspaceLabel,
        deleteWorkspace,
        onEnterWorkspaceFromKanban,
        pinWorkspace,
        secondColumnKanbanCardProperties,
        unpinWorkspace,
        updateWorkspaceLabel,
        updateWorkspaceLabels,
        updateWorkspacePriority,
        updateWorkspaceWorkflowStatus,
        workspaceLabels,
    ]);

    return {
        renderWorkspaceContentRow,
        renderWorkspaceItemRow,
        renderWorkspaceKanbanCard,
    };
}
