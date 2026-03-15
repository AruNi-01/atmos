"use client";

import React, { useState } from "react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@workspace/ui";
import { useAppRouter } from "@/hooks/use-app-router";
import { useContextParams } from "@/hooks/use-context-params";
import {
  Pin,
  Archive,
  Trash2,
  AlertTriangle,
  GitBranch,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  cn,
} from "@workspace/ui";
import type { Workspace } from "@/types/types";
import { formatRelativeTime } from "@atmos/shared";
import { getWorkspaceShortName } from "@/utils/workspace";
import { gitApi } from "@/api/ws-api";

export interface WorkspaceContentProps {
  workspace: Workspace;
  projectId: string;
  projectPath?: string;
  isDragging?: boolean;
  isPlaceholder?: boolean;
  attributes?: DraggableAttributes;
  listeners?: DraggableSyntheticListeners;
  onPin?: (workspaceId: string) => void;
  onUnpin?: (workspaceId: string) => void;
  onArchive?: (workspaceId: string) => void;
  onDelete?: (workspaceId: string) => void;
}

export const WorkspaceContent = React.memo<WorkspaceContentProps>(function WorkspaceContent({
  workspace, projectId, projectPath, isDragging, isPlaceholder, attributes, listeners, onPin, onUnpin, onArchive, onDelete,
}) {
  const router = useAppRouter();
  const { workspaceId } = useContextParams();
  const isActive = workspaceId === workspace.id;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showGitWarningDialog, setShowGitWarningDialog] = useState(false);
  const [gitWarningMessage, setGitWarningMessage] = useState('');
  const [pendingOperation, setPendingOperation] = useState<'archive' | 'delete' | null>(null);
  const [isCheckingGit, setIsCheckingGit] = useState(false);

  const handleClick = () => {
    router.push(`/workspace?id=${workspace.id}`);
  };

  const handlePinClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (workspace.isPinned) {
      onUnpin?.(workspace.id);
    } else {
      onPin?.(workspace.id);
    }
  };

  const performArchive = () => {
    onArchive?.(workspace.id);
    if (isActive) {
      router.replace('/');
    }
  };

  const checkGitStatusAndProceed = async (operation: 'archive' | 'delete') => {
    const workspacePath = workspace.localPath;
    if (!workspacePath) {
      if (operation === 'archive') {
        performArchive();
      } else {
        setShowDeleteDialog(true);
      }
      return;
    }

    setIsCheckingGit(true);
    try {
      const status = await gitApi.getStatus(workspacePath);

      if (status.has_uncommitted_changes || status.has_unpushed_commits) {
        const issues: string[] = [];
        if (status.has_uncommitted_changes) {
          issues.push(`${status.uncommitted_count} uncommitted change(s)`);
        }
        if (status.has_unpushed_commits) {
          issues.push(`${status.unpushed_count} unpushed commit(s)`);
        }
        setGitWarningMessage(issues.join(' and '));
        setPendingOperation(operation);
        setShowGitWarningDialog(true);
      } else {
        if (operation === 'archive') {
          performArchive();
        } else {
          setShowDeleteDialog(true);
        }
      }
    } catch (error) {
      console.error('Failed to check git status:', error);
      if (operation === 'archive') {
        performArchive();
      } else {
        setShowDeleteDialog(true);
      }
    } finally {
      setIsCheckingGit(false);
    }
  };

  const handleArchiveClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await checkGitStatusAndProceed('archive');
  };

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await checkGitStatusAndProceed('delete');
  };

  const handleForceOperation = () => {
    setShowGitWarningDialog(false);
    if (pendingOperation === 'archive') {
      performArchive();
    } else if (pendingOperation === 'delete') {
      setShowDeleteDialog(true);
    }
    setPendingOperation(null);
  };

  const confirmDelete = () => {
    if (isActive) {
      router.replace('/');
    }
    onDelete?.(workspace.id);
    setShowDeleteDialog(false);
  };

  const shortName = getWorkspaceShortName(workspace.name);
  const displayName = workspace.displayName?.trim() || shortName;
  const timeAgo = formatRelativeTime(workspace.createdAt);

  return (
    <>
      <div
        {...attributes}
        {...listeners}
        onClick={handleClick}
        className={cn(
          "flex flex-col px-3 py-2 rounded-md cursor-pointer transition-all border border-transparent hover:bg-sidebar-accent/50 group/ws",
          isActive
            ? 'bg-sidebar-accent/50 text-sidebar-foreground shadow-sm'
            : 'text-muted-foreground hover:text-sidebar-foreground',
          isPlaceholder && "opacity-20",
          isDragging && "bg-sidebar-accent shadow-xl scale-[1.02] border-sidebar-border text-sidebar-foreground"
        )}
      >
        <div className="flex items-center min-w-0 w-full relative">
          <div className="flex items-center flex-1 min-w-0">
            <div className="relative size-3.5 mr-2 flex shrink-0 items-center justify-center rounded-sm">
              <GitBranch
                className={cn(
                  "size-3.5",
                  isActive || isDragging ? 'text-sidebar-foreground' : 'text-muted-foreground',
                  workspace.isPinned ? "hidden" : "block group-hover/ws:hidden"
                )}
              />
              <button
                onClick={handlePinClick}
                className={cn(
                  "size-full items-center justify-center rounded-sm hover:bg-sidebar-border/50 hover:cursor-pointer z-10",
                  workspace.isPinned 
                    ? "flex text-amber-500" 
                    : "hidden group-hover/ws:flex text-muted-foreground hover:text-foreground"
                )}
                title={workspace.isPinned ? "Unpin" : "Pin"}
              >
                <Pin className={cn("size-3.5", workspace.isPinned && "fill-amber-500")} />
              </button>
            </div>
            <span className="text-[13px] font-medium truncate">{workspace.branch}</span>
          </div>
        </div>
        <div className="flex items-center mt-0.5 ml-5 relative min-w-0">
          <div className="flex items-center min-w-0 flex-1">
            <span className="text-[11px] text-muted-foreground truncate">{displayName}</span>
            <span className="text-[11px] text-muted-foreground mx-1">·</span>
            <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo}</span>
          </div>
          <div className="absolute -right-0.5 top-1/2 -translate-y-1/2 flex h-full items-center justify-end gap-0.5 rounded-r-sm pl-8 pr-0 opacity-0 backdrop-blur-[2px] transition-opacity z-10 group-hover/ws:opacity-100">
            <button
              onClick={handleArchiveClick}
              className="size-4 flex items-center justify-center hover:bg-muted rounded transition-colors hover:cursor-pointer"
              title="Archive"
              disabled={isCheckingGit}
            >
              <Archive className="size-3" />
            </button>
            {onDelete && (
              <button
                onClick={handleDeleteClick}
                className="size-4 flex items-center justify-center hover:bg-muted rounded transition-colors hover:cursor-pointer hover:text-destructive"
                title="Delete"
                disabled={isCheckingGit}
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showGitWarningDialog} onOpenChange={setShowGitWarningDialog}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              Uncommitted Changes Detected
            </DialogTitle>
            <DialogDescription>
              This workspace has {gitWarningMessage}. These changes will be lost if you {pendingOperation} this workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGitWarningDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleForceOperation}>
              {pendingOperation === 'archive' ? 'Archive Anyway' : 'Continue to Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete Workspace</DialogTitle>
            <DialogDescription>
              This will permanently delete the workspace `{workspace.displayName || workspace.name}` and its local directory. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
