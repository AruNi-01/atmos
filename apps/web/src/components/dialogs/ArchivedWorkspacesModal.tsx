"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  ScrollArea,
  Archive,
  LoaderCircle,
  Trash2,
  GitBranch,
  Loader2,
} from '@workspace/ui';
import { wsWorkspaceApi, ArchivedWorkspace } from '@/api/ws-api';
import { useProjectStore } from '@/hooks/use-project-store';
import { formatRelativeTime } from '@atmos/shared';

interface ArchivedWorkspacesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleteWorkspace: (workspaceId: string, workspaceName: string, onDeleted: () => void) => void;
  onDeleteProject: (projectId: string, projectName: string, canDelete: boolean, onDeleted: () => void) => void;
}

export const ArchivedWorkspacesModal: React.FC<ArchivedWorkspacesModalProps> = ({
  isOpen,
  onClose,
  onDeleteWorkspace,
  onDeleteProject,
}) => {
  const [archivedWorkspaces, setArchivedWorkspaces] = useState<ArchivedWorkspace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());
  const fetchProjects = useProjectStore(s => s.fetchProjects);
  const projects = useProjectStore(s => s.projects);

  const loadArchivedWorkspaces = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await wsWorkspaceApi.listArchived();
      setArchivedWorkspaces(result.workspaces || []);
    } catch (error) {
      console.error('Failed to load archived workspaces:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadArchivedWorkspaces();
    }
  }, [isOpen, loadArchivedWorkspaces]);

  const handleRestore = async (workspace: ArchivedWorkspace) => {
    setRestoringIds(prev => new Set(prev).add(workspace.guid));
    try {
      await wsWorkspaceApi.unarchive(workspace.guid);
      setArchivedWorkspaces(prev => prev.filter(w => w.guid !== workspace.guid));
      await fetchProjects();
    } catch (error) {
      console.error('Failed to restore workspace:', error);
    } finally {
      setRestoringIds(prev => {
        const next = new Set(prev);
        next.delete(workspace.guid);
        return next;
      });
    }
  };

  const handleDelete = (workspace: ArchivedWorkspace) => {
    onDeleteWorkspace(workspace.guid, workspace.name, () => {
      // Remove from local state after successful deletion
      setArchivedWorkspaces(prev => prev.filter(w => w.guid !== workspace.guid));
    });
  };

  const handleDeleteProject = (projectId: string, projectName: string) => {
    const project = projects.find(p => p.id === projectId);
    const hasActiveWorkspaces = project?.workspaces.some(w => !w.isArchived) ?? false;
    onDeleteProject(projectId, projectName, !hasActiveWorkspaces, () => {
      // Remove all workspaces of this project from local state
      setArchivedWorkspaces(prev => prev.filter(w => w.project_guid !== projectId));
    });
  };

  const groupedByProject = archivedWorkspaces.reduce((acc, ws) => {
    if (!acc[ws.project_guid]) {
      acc[ws.project_guid] = {
        projectName: ws.project_name,
        projectId: ws.project_guid,
        workspaces: [],
      };
    }
    acc[ws.project_guid].workspaces.push(ws);
    return acc;
  }, {} as Record<string, { projectName: string; projectId: string; workspaces: ArchivedWorkspace[] }>);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="size-5" />
            Archived Workspaces
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[600px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : archivedWorkspaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Archive className="size-8 mb-2 opacity-50" />
              <p className="text-sm">No archived workspaces</p>
            </div>
          ) : (
            <div className="space-y-6 pb-5">
              {Object.values(groupedByProject).map(({ projectName, projectId, workspaces }) => (
                <div key={projectId}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-muted-foreground">{projectName}</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                      onClick={() => handleDeleteProject(projectId, projectName)}
                    >
                      <Trash2 className="size-3" />
                      Delete Project
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {workspaces.map(ws => (
                      <div
                        key={ws.guid}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border hover:bg-muted/60 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{ws.name}</span>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <GitBranch className="size-3" />
                              {ws.branch}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Archived {formatRelativeTime(ws.archived_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 cursor-pointer"
                            onClick={() => handleRestore(ws)}
                            disabled={restoringIds.has(ws.guid)}
                          >
                            {restoringIds.has(ws.guid) ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <LoaderCircle className="size-4" />
                            )}
                            <span className="text-xs">Restore</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                            onClick={() => handleDelete(ws)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
