"use client";

import React from "react";
import { useSortable, CSS } from "@workspace/ui";
import type { Workspace, WorkspaceLabel, WorkspacePriority, WorkspaceWorkflowStatus } from "@/types/types";
import { WorkspaceContent } from "./WorkspaceContent";

export interface WorkspaceItemProps {
  workspace: Workspace;
  projectId: string;
  projectPath?: string;
  projectName?: string;
  suppressInfoPopover?: boolean;
  onPin: (workspaceId: string) => void;
  onUnpin: (workspaceId: string) => void;
  onArchive: (workspaceId: string) => void;
  onDelete: (workspaceId: string) => void;
  onUpdateName?: (workspaceId: string, name: string) => Promise<void>;
  onUpdateWorkflowStatus?: (workspaceId: string, workflowStatus: WorkspaceWorkflowStatus) => void;
  onUpdatePriority?: (workspaceId: string, priority: WorkspacePriority) => void;
  availableLabels?: WorkspaceLabel[];
  onCreateLabel?: (data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateLabel?: (labelId: string, data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateLabels?: (workspaceId: string, labels: WorkspaceLabel[]) => Promise<void>;
}

export const WorkspaceItem = React.memo<WorkspaceItemProps>(function WorkspaceItem({
  workspace,
  projectId,
  projectPath,
  projectName,
  suppressInfoPopover,
  onPin,
  onUnpin,
  onArchive,
  onDelete,
  onUpdateName,
  onUpdateWorkflowStatus,
  onUpdatePriority,
  availableLabels,
  onCreateLabel,
  onUpdateLabel,
  onUpdateLabels,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: workspace.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <WorkspaceContent
        workspace={workspace}
        projectId={projectId}
        projectPath={projectPath}
        projectName={projectName}
        suppressInfoPopover={suppressInfoPopover}
        isPlaceholder={isDragging}
        attributes={attributes}
        listeners={listeners}
        onPin={onPin}
        onUnpin={onUnpin}
        onArchive={onArchive}
        onDelete={onDelete}
        onUpdateName={onUpdateName}
        onUpdateWorkflowStatus={onUpdateWorkflowStatus}
        onUpdatePriority={onUpdatePriority}
        availableLabels={availableLabels}
        onCreateLabel={onCreateLabel}
        onUpdateLabel={onUpdateLabel}
        onUpdateLabels={onUpdateLabels}
      />
    </div>
  );
});
