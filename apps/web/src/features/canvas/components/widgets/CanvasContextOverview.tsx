"use client";

import React from "react";
import { useEditor } from "tldraw";

import { OverviewTab } from "@/features/workspace/components/OverviewTab";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import { useGitStatusQuery } from "@/features/git/hooks/use-git-status-query";
import { useCanvasWidgetHost } from "@/features/canvas/components/CanvasWidgetHost";
import {
  getCanvasContextId,
  type CanvasContextRef,
} from "@/features/canvas/lib/canvas-widget-shape";

export function CanvasContextOverview({ context }: { context: CanvasContextRef }) {
  const editor = useEditor();
  const host = useCanvasWidgetHost();
  const projects = useProjects();
  const repoPath = context.repoPath ?? context.localPath ?? null;
  const statusQuery = useGitStatusQuery(repoPath);
  const currentBranch = statusQuery.data?.current_branch ?? null;
  const [portalRoot, setPortalRoot] = React.useState<HTMLElement | null>(null);
  const contextId = getCanvasContextId(context);

  React.useEffect(() => {
    const container = editor.getContainer();
    const wrapper = container.closest(".tldraw-wrapper");
    setPortalRoot(wrapper instanceof HTMLElement ? wrapper : container);
  }, [editor]);

  const buildMainAppTargetPath = React.useCallback(
    (params: Record<string, string | number>) => {
      const searchParams = new URLSearchParams();
      searchParams.set("id", contextId);
      for (const [key, value] of Object.entries(params)) {
        searchParams.set(key, String(value));
      }
      return `/${context.contextScope}?${searchParams.toString()}`;
    },
    [context.contextScope, contextId],
  );
  const { project, workspace } = React.useMemo(() => {
    const projectById = context.projectId
      ? projects.find((item) => item.id === context.projectId)
      : undefined;
    const projectByWorkspace = context.workspaceId
      ? projects.find((item) =>
          item.workspaces.some((workspaceItem) => workspaceItem.id === context.workspaceId),
        )
      : undefined;
    const resolvedProject =
      projectByWorkspace ??
      projectById ??
      projects.find((item) => item.name === context.projectName);
    const resolvedWorkspace = context.workspaceId
      ? (projectByWorkspace ?? resolvedProject)?.workspaces.find(
          (workspaceItem) => workspaceItem.id === context.workspaceId,
        )
      : undefined;
    return { project: resolvedProject, workspace: resolvedWorkspace };
  }, [context.projectId, context.projectName, context.workspaceId, projects]);

  if (!contextId) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Missing context id.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <OverviewTab
        contextId={contextId}
        projectId={project?.id ?? context.projectId ?? undefined}
        projectName={project?.name ?? context.projectName}
        projectPath={project?.mainFilePath ?? context.repoPath ?? context.localPath}
        workspaceName={workspace?.displayName ?? workspace?.name ?? context.workspaceName ?? undefined}
        workspacePath={workspace?.localPath ?? (context.contextScope === "workspace" ? context.localPath : undefined)}
        gitBranch={workspace?.branch ?? currentBranch ?? undefined}
        createdAt={workspace?.createdAt}
        isProjectOnly={context.contextScope === "project" || !workspace}
        githubIssue={workspace?.githubIssue}
        priority={workspace?.priority}
        workflowStatus={workspace?.workflowStatus}
        labels={workspace?.labels}
        active
        showRefreshAction={false}
        dragOverlayContainer={portalRoot}
        onOpenPullRequest={(pr) => {
          host?.notifyUnsupported({
            targetPath: buildMainAppTargetPath({ rsPr: pr.number }),
          });
        }}
        onOpenActionRun={(run) => {
          host?.notifyUnsupported({
            targetPath: buildMainAppTargetPath({ rsRunId: run.databaseId }),
          });
        }}
      />
    </div>
  );
}
