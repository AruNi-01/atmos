"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Loader2, Workflow } from "lucide-react";

import {
  ActionsPanel,
  type ActionRun,
} from "@/features/github/components/ActionsPanel";
import { createCanvasCenterTab } from "@/features/canvas/lib/canvas-center-tabs";
import {
  type CanvasWidgetShape,
  type CanvasWidgetSourceRef,
} from "@/features/canvas/lib/canvas-widget-shape";
import { useOpenCanvasCenterTab } from "@/features/canvas/hooks/use-open-canvas-center-tab";
import { useGitStatusQuery } from "@/features/git/hooks/use-git-status-query";
import { type TLShapeId } from "tldraw";

type CanvasActionsWidgetSource = Extract<CanvasWidgetSourceRef, { type: "actions" }>;

export function CanvasActionsWidget({ shape }: { shape: CanvasWidgetShape }) {
  const source = shape.props.source;
  if (source.type !== "actions") {
    return null;
  }
  return <CanvasActionsWidgetBody shapeId={shape.id as TLShapeId} source={source} />;
}

function CanvasActionsWidgetBody({
  shapeId,
  source,
}: {
  shapeId: TLShapeId;
  source: CanvasActionsWidgetSource;
}) {
  const t = useTranslations("canvas.actionsWidget");
  const repoPath = source.context.repoPath ?? source.context.localPath;
  const statusQuery = useGitStatusQuery(repoPath || null);
  const githubOwner = statusQuery.data?.github_owner ?? null;
  const githubRepo = statusQuery.data?.github_repo ?? null;
  const currentBranch = statusQuery.data?.current_branch ?? null;
  const openCenterTab = useOpenCanvasCenterTab(shapeId, source.context);
  const isResolvingGithub =
    Boolean(repoPath) && statusQuery.isLoading && !statusQuery.data;

  if (isResolvingGithub) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="mb-2 size-5 animate-spin opacity-50" />
        <span className="px-4 text-center text-xs">{t("loading")}</span>
      </div>
    );
  }

  if (!githubOwner || !githubRepo || !currentBranch) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-10 text-muted-foreground/50">
        <Workflow className="mb-2 size-8 opacity-20" />
        <span className="px-4 text-center text-xs">{t("notAGitHubRepository")}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2 pb-2 pt-0">
      <ActionsPanel
        owner={githubOwner}
        repo={githubRepo}
        branch={currentBranch}
        onRunClick={(run: ActionRun) =>
          openCenterTab(
            createCanvasCenterTab({
              kind: "github-action",
              owner: githubOwner,
              repo: githubRepo,
              runId: run.databaseId,
              run,
              title:
                run.workflowName ||
                t("actionRunTitle", { number: run.databaseId }),
              description: run.displayTitle,
            }),
          )
        }
      />
    </div>
  );
}
