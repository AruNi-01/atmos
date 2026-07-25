"use client";

import React from "react";
import { useSortable, CSS, toastManager } from "@workspace/ui";
import type { Workspace, WorkspaceLabel, WorkspacePriority, WorkspaceWorkflowStatus } from "@/shared/types/domain";
import { WorkspaceContent } from "./WorkspaceContent";
import { createWorkspacePrimePrefetch } from "@/app-shell/workspace-surface-prefetch";

/** Shared hover prime (APP-043 M9) — does not force Warm tier. */
// Long debounce: rapid hopping across 3–5 rows must not fire loadFromBackend storms.
const workspaceHoverPrime = createWorkspacePrimePrefetch({ debounceMs: 450 });

export interface WorkspaceItemProps {
  workspace: Workspace;
  projectId: string;
  projectPath?: string;
  projectName?: string;
  showProjectName?: boolean;
  rightContext?: React.ReactNode;
  /** Selected state from parent — avoids per-row URL subscriptions. */
  isActive?: boolean;
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

function workspaceItemPropsAreEqual(
  prev: WorkspaceItemProps,
  next: WorkspaceItemProps,
): boolean {
  return (
    prev.workspace === next.workspace &&
    prev.projectId === next.projectId &&
    prev.projectPath === next.projectPath &&
    prev.projectName === next.projectName &&
    prev.showProjectName === next.showProjectName &&
    prev.rightContext === next.rightContext &&
    prev.isActive === next.isActive &&
    prev.suppressInfoPopover === next.suppressInfoPopover &&
    prev.sortingDisabled === next.sortingDisabled &&
    prev.sortingDisabledMessage === next.sortingDisabledMessage &&
    prev.availableLabels === next.availableLabels
  );
}

export const WorkspaceItem = React.memo<WorkspaceItemProps>(function WorkspaceItem({
  workspace,
  projectId,
  projectPath,
  projectName,
  showProjectName,
  rightContext,
  isActive = false,
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

  const handlePointerLeave = React.useCallback(() => {
    handlePointerEnd();
    // Leaving a row cancels pending prime so fly-over does not hydrate.
    workspaceHoverPrime.cancel();
  }, [handlePointerEnd]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-workspace-id={workspace.id}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerLeave}
      onPointerEnter={() => {
        workspaceHoverPrime.onWorkspaceHover(workspace.id, false);
      }}
      onClickCapture={() => {
        // Navigation click: cancel any pending hover prime immediately.
        workspaceHoverPrime.cancel();
      }}
    >
      <WorkspaceContent
        workspace={workspace}
        projectId={projectId}
        projectPath={projectPath}
        projectName={projectName}
        showProjectName={showProjectName}
        rightContext={rightContext}
        isActive={isActive}
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
}, workspaceItemPropsAreEqual);
