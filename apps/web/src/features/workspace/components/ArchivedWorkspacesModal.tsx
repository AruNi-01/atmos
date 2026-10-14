"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  ScrollArea,
  Archive,
  RotateCw,
  Trash2,
  GitBranch,
  Loader2,
} from "@workspace/ui";
import { wsWorkspaceApi, ArchivedWorkspace } from "@/api/ws-api";
import {
  useProjects,
  invalidateProjectBootstrap,
} from "@/features/project/hooks/use-project-bootstrap-query";
import { formatRelativeTime } from "@atmos/shared";

interface ArchivedWorkspacesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleteWorkspace: (workspaceId: string, workspaceName: string, onDeleted: () => void) => void;
  onDeleteProject: (
    projectId: string,
    projectName: string,
    canDelete: boolean,
    onDeleted: () => void,
  ) => void;
}

export const ArchivedWorkspacesModal: React.FC<ArchivedWorkspacesModalProps> = ({
  isOpen,
  onClose,
  onDeleteWorkspace,
  onDeleteProject,
}) => {
  const t = useTranslations("Workspace.components.archivedModal");
  const locale = useLocale();
  const [archivedWorkspaces, setArchivedWorkspaces] = useState<ArchivedWorkspace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());
  const projects = useProjects();

  const loadArchivedWorkspaces = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await wsWorkspaceApi.listArchived();
      setArchivedWorkspaces(result.workspaces || []);
    } catch (error) {
      console.error("Failed to load archived workspaces:", error);
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
    setRestoringIds((prev) => new Set(prev).add(workspace.guid));
    try {
      await wsWorkspaceApi.unarchive(workspace.guid);
      setArchivedWorkspaces((prev) => prev.filter((w) => w.guid !== workspace.guid));
      await invalidateProjectBootstrap();
    } catch (error) {
      console.error("Failed to restore workspace:", error);
    } finally {
      setRestoringIds((prev) => {
        const next = new Set(prev);
        next.delete(workspace.guid);
        return next;
      });
    }
  };

  const handleDelete = (workspace: ArchivedWorkspace) => {
    onDeleteWorkspace(workspace.guid, workspace.name, () => {
      // Remove from local state after successful deletion
      setArchivedWorkspaces((prev) => prev.filter((w) => w.guid !== workspace.guid));
    });
  };

  const handleDeleteProject = (projectId: string, projectName: string) => {
    const project = projects.find((p) => p.id === projectId);
    const hasActiveWorkspaces = project?.workspaces.some((w) => !w.isArchived) ?? false;
    onDeleteProject(projectId, projectName, !hasActiveWorkspaces, () => {
      // Remove all workspaces of this project from local state
      setArchivedWorkspaces((prev) => prev.filter((w) => w.project_guid !== projectId));
    });
  };

  const groupedByProject = archivedWorkspaces.reduce(
    (acc, ws) => {
      if (!acc[ws.project_guid]) {
        acc[ws.project_guid] = {
          projectName: ws.project_name,
          projectId: ws.project_guid,
          workspaces: [],
        };
      }
      acc[ws.project_guid].workspaces.push(ws);
      return acc;
    },
    {} as Record<
      string,
      { projectName: string; projectId: string; workspaces: ArchivedWorkspace[] }
    >,
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[80vh] sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="size-5" />
            {t("title")}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[600px] pr-4">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : archivedWorkspaces.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <Archive className="mb-2 size-8 opacity-50" />
              <p className="text-sm">{t("empty")}</p>
            </div>
          ) : (
            <div className="space-y-6 pb-5">
              {Object.values(groupedByProject).map(({ projectName, projectId, workspaces }) => (
                <div key={projectId}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-muted-foreground">{projectName}</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 cursor-pointer text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDeleteProject(projectId, projectName)}
                    >
                      <Trash2 className="size-3" />
                      {t("actions.deleteProject")}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {workspaces.map((ws) => (
                      <div
                        key={ws.guid}
                        className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3 hover:bg-muted/60"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{ws.name}</span>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <GitBranch className="size-3" />
                              {ws.branch}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t("archivedAt", { time: formatRelativeTime(ws.archived_at, locale) })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 cursor-pointer px-2"
                            onClick={() => handleRestore(ws)}
                            disabled={restoringIds.has(ws.guid)}
                          >
                            {restoringIds.has(ws.guid) ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <RotateCw className="size-4" />
                            )}
                            <span className="text-xs">{t("actions.restore")}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 cursor-pointer px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
