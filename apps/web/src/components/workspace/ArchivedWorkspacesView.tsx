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
  RotateCcw,
  Button,
  Loader2,
  toastManager,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@workspace/ui";
import { ArchivedWorkspace, wsWorkspaceApi } from '@/api/ws-api';
import { useQueryState } from "nuqs";
import { workspacesParams } from "@/lib/nuqs/searchParams";
import { useProjectStore } from '@/hooks/use-project-store';
import { formatRelativeTime } from '@atmos/shared';
import { DeleteProjectDialog } from '@/components/dialogs/DeleteProjectDialog';
import { DeleteWorkspaceDialog } from '@/components/dialogs/DeleteWorkspaceDialog';
import { motion, AnimatePresence } from "motion/react";

interface OverflowTooltipProps {
  text: string;
  tooltipText?: string;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  contentClassName?: string;
}

const OverflowTooltip: React.FC<OverflowTooltipProps> = ({
  text,
  tooltipText,
  className,
  side = "top",
  contentClassName,
}) => (
  <Tooltip delayDuration={250}>
    <TooltipTrigger asChild>
      <span className={cn("block truncate", className)}>{text}</span>
    </TooltipTrigger>
    <TooltipContent side={side} className={cn("max-w-[360px] break-all", contentClassName)}>
      {tooltipText ?? text}
    </TooltipContent>
  </Tooltip>
);

export const ArchivedWorkspacesView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useQueryState("q", workspacesParams.q);
  const [archivedWorkspaces, setArchivedWorkspaces] = useState<ArchivedWorkspace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());

  // We might want to refresh the project list after restore/delete operations
  const fetchProjects = useProjectStore(s => s.fetchProjects);
  const projects = useProjectStore(s => s.projects);
  const deleteProject = useProjectStore(s => s.deleteProject);
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
        description: `Restored workspace "${workspace.display_name || workspace.name}"`,
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
      workspaceName: workspace.display_name || workspace.name,
      onDeleted: () => {
        setArchivedWorkspaces(prev => prev.filter(w => w.guid !== workspace.guid));
      }
    });
  };

  const handleDeleteProject = (projectId: string, projectName: string) => {
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
      (w.display_name?.toLowerCase().includes(lowQuery) ?? false) ||
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
      {/* Content with ScrollArea */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full scrollbar-on-hover">
          <div className="max-w-5xl mx-auto w-full px-8">
            {/* Header / Title - Scrolls away */}
            <div className="pt-12 pb-8 space-y-2">
              <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground border border-border">
                  <Archive className="size-5" />
                </div>
                Archived Workspaces
              </h2>
              <p className="text-sm text-muted-foreground text-pretty max-w-sm">
                View and manage archived workspaces. Restore them to continue working.
              </p>
            </div>

            {/* Sticky Search Bar */}
            <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md pt-2 pb-6 -mx-4 px-4 sm:-mx-8 sm:px-8">
              <div className="relative group max-w-5xl mx-auto">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search archived workspaces..."
                  className="pl-10 h-12 bg-muted/20 border-border/50 focus:bg-background transition-all rounded-xl shadow-sm focus-visible:ring-1 focus-visible:ring-primary/20"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-10 pb-12">
              {isLoading ? (
                <div className="space-y-8">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-border/40">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="size-6 rounded-md" />
                      </div>
                      <div className="grid gap-2">
                        {[...Array(2)].map((_, j) => (
                          <div key={j} className="h-16 rounded-xl border border-border/50 bg-muted/20" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredWorkspaces.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-20 text-center"
                >
                  <div className="size-20 rounded-3xl bg-muted/20 flex items-center justify-center mb-6">
                    <Archive className="size-10 text-muted-foreground/30" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {archivedWorkspaces.length === 0 ? "No archived workspaces" : "No results found"}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto text-pretty">
                    {archivedWorkspaces.length === 0
                      ? "When you archive a workspace, it will appear here for safe keeping."
                      : `We couldn't find any archived workspaces matching "${searchQuery}".`}
                  </p>
                  {searchQuery && (
                    <Button variant="link" onClick={() => setSearchQuery("")} className="mt-4">
                      Clear search query
                    </Button>
                  )}
                </motion.div>
              ) : (
                <div className="space-y-10 pt-2">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {Object.values(groupedByProject).map(({ projectName, projectId, workspaces }) => (
                      <motion.div
                        key={projectId}
                        layout
                        initial={false}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className="space-y-4"
                      >
                        <div className="flex items-center justify-between sticky top-[76px] bg-background/95 backdrop-blur-sm py-3 z-20 border-b border-border/40">
                          <span className="text-[11px] font-bold text-muted-foreground/80 uppercase tracking-widest flex items-center gap-3">
                            <OverflowTooltip
                              text={projectName}
                              className="max-w-[400px]"
                              contentClassName="max-w-[420px]"
                            />
                            <span className="bg-muted px-2 py-0.5 rounded-full text-[10px] font-bold font-mono">
                              {workspaces.length}
                            </span>
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer rounded-lg transition-colors border border-transparent hover:border-destructive/20"
                            onClick={() => handleDeleteProject(projectId, projectName)}
                            title="Delete project"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>

                        <div className="grid gap-2.5">
                          <AnimatePresence mode="popLayout" initial={false}>
                            {workspaces.map((ws, index) => (
                              <motion.div
                                key={ws.guid}
                                layout
                                initial={false}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.2) }}
                                className="group flex items-center justify-between p-4 rounded-xl border border-border bg-background hover:bg-muted/50 transition-all text-left w-full shadow-sm"
                              >
                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                  <div className="flex items-center gap-3 min-w-0 shrink-0 w-[520px] max-w-full">
                                    <OverflowTooltip
                                      text={ws.display_name || ws.name}
                                      className="w-[260px] shrink-0 text-[14px] font-semibold text-foreground"
                                    />
                                    {ws.branch && (
                                      <span className="flex items-center gap-1.5 min-w-0 max-w-[220px] shrink text-[11px] font-medium text-muted-foreground bg-muted/80 px-2 py-0.5 rounded-lg border border-border/50">
                                        <GitBranch className="size-3 shrink-0" />
                                        <OverflowTooltip
                                          text={ws.branch}
                                          className="min-w-0 flex-1"
                                        />
                                      </span>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-[11px] text-muted-foreground/70 font-medium truncate block">
                                      Archived {formatRelativeTime(ws.archived_at)}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity translate-x-1 group-hover:translate-x-0">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-3 text-muted-foreground hover:text-foreground hover:bg-background cursor-pointer rounded-lg shadow-sm font-medium text-xs transition-all"
                                    onClick={() => handleRestore(ws)}
                                    disabled={restoringIds.has(ws.guid)}
                                    title="Restore"
                                  >
                                    {restoringIds.has(ws.guid) ? (
                                      <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                      <div className="flex items-center gap-1.5">
                                        <RotateCcw className="size-3.5" />
                                        Restore
                                      </div>
                                    )}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20 cursor-pointer rounded-lg shadow-sm font-medium text-xs transition-all"
                                    onClick={() => handleDelete(ws)}
                                    title="Delete permanently"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <Trash2 className="size-3.5" />
                                      Delete
                                    </div>
                                  </Button>
                                </div>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
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
