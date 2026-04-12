"use client";

import React from "react";
import { useSortable, CSS, toastManager } from "@workspace/ui";
import type { Workspace, WorkspaceLabel, WorkspacePriority, WorkspaceWorkflowStatus } from "@/types/types";
import { WorkspaceContent } from "./WorkspaceContent";

export interface WorkspaceItemProps {
  workspace: Workspace;
  projectId: string;
  projectPath?: string;
  projectName?: string;
  showProjectName?: boolean;
  rightContext?: React.ReactNode;
  suppressInfoPopover?: boolean;
  sortingDisabled?: boolean;
  sortingDisabledMessage?: string;
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
  showProjectName,
  rightContext,
  suppressInfoPopover,
  sortingDisabled,
  sortingDisabledMessage,
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
  } = useSortable({ id: workspace.id, disabled: sortingDisabled });

  const pointerStartRef = React.useRef<{ x: number; y: number; warned: boolean } | null>(null);

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
  };

  const showSortingDisabledWarning = React.useCallback(() => {
    toastManager.add({
      title: "Sorting disabled",
      description: sortingDisabledMessage ?? "Clear filters to reorder pinned workspaces.",
      type: "warning",
    });
  }, [sortingDisabledMessage]);

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!sortingDisabled || event.button !== 0) return;
    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      warned: false,
    };
  }, [sortingDisabled]);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!sortingDisabled || !pointerStartRef.current || pointerStartRef.current.warned) return;

    const deltaX = event.clientX - pointerStartRef.current.x;
    const deltaY = event.clientY - pointerStartRef.current.y;
    if (Math.hypot(deltaX, deltaY) < 6) return;

    pointerStartRef.current.warned = true;
    showSortingDisabledWarning();
  }, [showSortingDisabledWarning, sortingDisabled]);

  const handlePointerEnd = React.useCallback(() => {
    pointerStartRef.current = null;
  }, []);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
    >
      <WorkspaceContent
        workspace={workspace}
        projectId={projectId}
        projectPath={projectPath}
        projectName={projectName}
        showProjectName={showProjectName}
        rightContext={rightContext}
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
