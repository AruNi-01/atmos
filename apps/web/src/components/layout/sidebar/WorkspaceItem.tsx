"use client";

import React from "react";
import { useSortable, CSS } from "@workspace/ui";
import type { Workspace, WorkspaceWorkflowStatus } from "@/types/types";
import { WorkspaceContent } from "./WorkspaceContent";

export interface WorkspaceItemProps {
  workspace: Workspace;
  projectId: string;
  projectPath?: string;
  projectName?: string;
  onPin: (workspaceId: string) => void;
  onUnpin: (workspaceId: string) => void;
  onArchive: (workspaceId: string) => void;
  onDelete: (workspaceId: string) => void;
  onUpdateWorkflowStatus?: (workspaceId: string, workflowStatus: WorkspaceWorkflowStatus) => void;
}

export const WorkspaceItem = React.memo<WorkspaceItemProps>(function WorkspaceItem({
  workspace,
  projectId,
  projectPath,
  projectName,
  onPin,
  onUnpin,
  onArchive,
  onDelete,
  onUpdateWorkflowStatus,
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
        isPlaceholder={isDragging}
        attributes={attributes}
        listeners={listeners}
        onPin={onPin}
        onUnpin={onUnpin}
        onArchive={onArchive}
        onDelete={onDelete}
        onUpdateWorkflowStatus={onUpdateWorkflowStatus}
      />
    </div>
  );
});
