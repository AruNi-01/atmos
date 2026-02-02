"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Input,
  ScrollArea,
  GitBranch,
  Search,
  Archive,
  cn,
  Trash2,
  GitCommit,
  RotateCcw,
  Button,
  Loader2,
  toastManager
} from "@workspace/ui";
import { ArchivedWorkspace, wsWorkspaceApi } from '@/api/ws-api';
import { useProjectStore } from '@/hooks/use-project-store'; // For project info if needed
import { formatRelativeTime } from '@atmos/shared';
import { format } from 'date-fns';
import { DeleteProjectDialog } from '@/components/dialogs/DeleteProjectDialog';
import { DeleteWorkspaceDialog } from '@/components/dialogs/DeleteWorkspaceDialog';

export const ArchivedWorkspacesView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [archivedWorkspaces, setArchivedWorkspaces] = useState<ArchivedWorkspace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());

  // We might want to refresh the project list after restore/delete operations
  const { fetchProjects, projects, deleteProject } = useProjectStore();
  const [deleteProjectDialog, setDeleteProjectDialog] = useState<{
    isOpen: boolean;
    projectId: string;
    projectName: string;
    canDelete: boolean;
    onDeleted?: () => void;
  } | null>(null);

  const [deleteWorkspaceDialog, setDeleteWorkspaceDialog] = useState<{
    isOpen: boolean;
    workspaceId: string;
    workspaceName: string;
    onDeleted?: () => void;
  } | null>(null);

  const loadArchivedWorkspaces = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await wsWorkspaceApi.listArchived();
      setArchivedWorkspaces(result.workspaces || []);
    } catch (error) {
      console.error('Failed to load archived workspaces:', error);
      toastManager.add({
        title: "Error",
        description: "Failed to load archived workspaces",
        type: "error"
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadArchivedWorkspaces();
  }, [loadArchivedWorkspaces]);

  const handleRestore = async (workspace: ArchivedWorkspace) => {
    setRestoringIds(prev => new Set(prev).add(workspace.guid));
    try {
      await wsWorkspaceApi.unarchive(workspace.guid);
      setArchivedWorkspaces(prev => prev.filter(w => w.guid !== workspace.guid));
      await fetchProjects(); // Refresh sidebar
      toastManager.add({
        title: "Workspace Restored",
        description: `Restored workspace "${workspace.name}"`,
        type: "success"
      });
    } catch (error) {
      console.error('Failed to restore workspace:', error);
      toastManager.add({
        title: "Restore Failed",
        description: "Could not restore workspace",
        type: "error"
      });
    } finally {
      setRestoringIds(prev => {
        const next = new Set(prev);
        next.delete(workspace.guid);
        return next;
      });
    }
  };

  const handleDelete = (workspace: ArchivedWorkspace) => {
    setDeleteWorkspaceDialog({
      isOpen: true,
      workspaceId: workspace.guid,
      workspaceName: workspace.name,
      onDeleted: () => {
        setArchivedWorkspaces(prev => prev.filter(w => w.guid !== workspace.guid));
      }
    });
  };

  const handleDeleteProject = (projectId: string, projectName: string) => {
    const project = projects.find(p => p.id === projectId);
    // If project is not found in store (maybe we only have it in archived list), 
    // it probably shouldn't happen unless sync issue. 
    // If it is found, check for active workspaces.
    // However, if the project is deleted from sidebar (from projects store) but still has archived workspaces,
    // we might need to handle it. But standard flow is: project exists -> can be deleted.

    // If project is NOT in `projects`, it means it's already "soft deleted" or doesn't exist active?
    // But here we are grouping by `project_guid`.

    // Logic from Modal:
    // const project = projects.find(p => p.id === projectId);
    // const hasActiveWorkspaces = project?.workspaces.some(w => !w.isArchived) ?? false;

    const projectInStore = projects.find(p => p.id === projectId);
    const hasActiveWorkspaces = projectInStore?.workspaces.some(w => !w.isArchived) ?? false;

    setDeleteProjectDialog({
      isOpen: true,
      projectId,
      projectName,
      canDelete: !hasActiveWorkspaces,
      onDeleted: () => {
        // After project delete, remove all workspaces locally for UI update
        setArchivedWorkspaces(prev => prev.filter(w => w.project_guid !== projectId));
      }
    });
  };


  // Filter by search
  const filteredWorkspaces = useMemo(() => {
    if (!searchQuery) return archivedWorkspaces;
    const lowQuery = searchQuery.toLowerCase();
    return archivedWorkspaces.filter(w =>
      w.name.toLowerCase().includes(lowQuery) ||
      w.project_name.toLowerCase().includes(lowQuery) ||
      w.branch.toLowerCase().includes(lowQuery)
    );
  }, [archivedWorkspaces, searchQuery]);

  // Group by Project
  const groupedByProject = useMemo(() => {
    return filteredWorkspaces.reduce((acc, ws) => {
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
  }, [filteredWorkspaces]);


  return (
    <div className="flex flex-col h-full bg-background/50">
      {/* Header / Search */}
      <div className="flex-none p-6 pb-2 space-y-6 max-w-4xl mx-auto w-full">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Archive className="size-5 text-muted-foreground" />
            Archived Workspaces
          </h2>
          <p className="text-sm text-muted-foreground">
            View and manage archived workspaces. Restore them to continue working.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search archived workspaces..."
            className="pl-9 bg-muted/30 border-input/50 focus-visible:ring-1 h-11 text-sm rounded-sm"
            autoFocus
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredWorkspaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Archive className="size-8 mb-2 opacity-20" />
              <p className="text-sm opacity-60">No archived workspaces found</p>
            </div>
          ) : (
            <div className="p-6 pt-2 max-w-4xl mx-auto w-full space-y-8">
              {Object.values(groupedByProject).map(({ projectName, projectId, workspaces }) => (
                <div key={projectId} className="space-y-3">
                  <div className="flex items-center justify-between mb-2 sticky top-0 bg-background/95 backdrop-blur-sm py-2 z-10 border-b border-sidebar-border/50">
                    <span className="text-xs font-semibold text-muted-foreground tracking-wider flex items-center gap-2">
                      <span className="truncate max-w-[300px]">{projectName}</span>
                      <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] text-muted-foreground font-mono">{workspaces.length}</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                      onClick={() => handleDeleteProject(projectId, projectName)}
                      title="Delete project"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <div className="grid gap-2">
                    {workspaces.map(ws => (
                      <div
                        key={ws.guid}
                        className="group flex items-center justify-between p-3 rounded-sm border border-transparent hover:bg-muted/50 hover:border-sidebar-border/50 transition-all text-left w-full"
                      >
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          {/* Workspace Info */}
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate text-foreground">
                                {ws.name}
                              </span>
                              {ws.branch && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-sm">
                                  <GitBranch className="size-3" />
                                  {ws.branch}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground mt-0.5">
                              Archived {formatRelativeTime(ws.archived_at)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 cursor-pointer"
                            onClick={() => handleRestore(ws)}
                            disabled={restoringIds.has(ws.guid)}
                            title="Restore"
                          >
                            {restoringIds.has(ws.guid) ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <RotateCcw className="size-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                            onClick={() => handleDelete(ws)}
                            title="Delete permanently"
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
      </div>
      {/* Delete Project Dialog */}
      {deleteProjectDialog && (
        <DeleteProjectDialog
          isOpen={deleteProjectDialog.isOpen}
          onClose={() => setDeleteProjectDialog(null)}
          projectId={deleteProjectDialog.projectId}
          projectName={deleteProjectDialog.projectName}
          canDelete={deleteProjectDialog.canDelete}
          onConfirm={async () => {
            await deleteProject(deleteProjectDialog.projectId);
            deleteProjectDialog.onDeleted?.();
            setDeleteProjectDialog(null);
          }}
        />
      )}

      {/* Delete Workspace Dialog */}
      {deleteWorkspaceDialog && (
        <DeleteWorkspaceDialog
          isOpen={deleteWorkspaceDialog.isOpen}
          onClose={() => setDeleteWorkspaceDialog(null)}
          workspaceId={deleteWorkspaceDialog.workspaceId}
          workspaceName={deleteWorkspaceDialog.workspaceName}
          onConfirm={async () => {
            try {
              await wsWorkspaceApi.delete(deleteWorkspaceDialog.workspaceId);
              deleteWorkspaceDialog.onDeleted?.();
              toastManager.add({
                title: "Workspace Deleted",
                description: `Permanently deleted "${deleteWorkspaceDialog.workspaceName}"`,
                type: "success"
              });
            } catch (error) {
              console.error("Failed to delete workspace", error);
              toastManager.add({
                title: "Delete Failed",
                description: "Could not delete workspace",
                type: "error"
              });
            }
            setDeleteWorkspaceDialog(null);
          }}
        />
      )}
    </div>
  );
};
