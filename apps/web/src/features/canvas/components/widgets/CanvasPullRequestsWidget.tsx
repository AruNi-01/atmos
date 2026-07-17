"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestCreate,
  Loader2,
} from "lucide-react";
import { Tabs, TabsList } from "@workspace/ui";

import { PRPanel, type PRPanelHandle } from "@/features/github/components/PRPanel";
import { createCanvasCenterTab } from "@/features/canvas/lib/canvas-center-tabs";
import {
  type CanvasWidgetShape,
  type CanvasWidgetSourceRef,
} from "@/features/canvas/lib/canvas-widget-shape";
import { useOpenCanvasCenterTab } from "@/features/canvas/hooks/use-open-canvas-center-tab";
import { useGitStatusQuery } from "@/features/git/hooks/use-git-status-query";
import { RefreshableTabsTab } from "@/shared/components/ui/RefreshableTabsTab";
import { type TLShapeId } from "tldraw";

type CanvasPullRequestsWidgetSource = Extract<
  CanvasWidgetSourceRef,
  { type: "pull-requests" }
>;

export function CanvasPullRequestsWidget({ shape }: { shape: CanvasWidgetShape }) {
  const source = shape.props.source;
  if (source.type !== "pull-requests") {
    return null;
  }
  return (
    <CanvasPullRequestsWidgetBody shapeId={shape.id as TLShapeId} source={source} />
  );
}

function CanvasPullRequestsWidgetBody({
  shapeId,
  source,
}: {
  shapeId: TLShapeId;
  source: CanvasPullRequestsWidgetSource;
}) {
  const t = useTranslations("canvas.pullRequestsWidget");
  const tCommon = useTranslations("AppShell.chrome");
  const repoPath = source.context.repoPath ?? source.context.localPath;
  const statusQuery = useGitStatusQuery(repoPath || null);
  const githubOwner = statusQuery.data?.github_owner ?? null;
  const githubRepo = statusQuery.data?.github_repo ?? null;
  const currentBranch = statusQuery.data?.current_branch ?? null;
  const openCenterTab = useOpenCanvasCenterTab(shapeId, source.context);
  const [prSubTab, setPRSubTab] = React.useState<"open" | "closed">(
    source.prSubTab ?? "open",
  );
  const prPanelRef = React.useRef<PRPanelHandle>(null);
  const [prPanelLoading, setPRPanelLoading] = React.useState({
    open: false,
    closed: false,
  });
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
        <GitPullRequest className="mb-2 size-8 opacity-20" />
        <span className="px-4 text-center text-xs">{t("notAGitHubRepository")}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-9 shrink-0 border-b border-sidebar-border bg-background/50 backdrop-blur-sm">
        <Tabs
          value={prSubTab}
          onValueChange={(value) => setPRSubTab(value as "open" | "closed")}
          className="h-full min-w-0 flex-1"
        >
          <TabsList variant="underline" className="h-full w-full gap-0 py-0!">
            <RefreshableTabsTab
              value="open"
              activeValue={prSubTab}
              refreshTitle={t("refreshOpen")}
              onRefresh={() => prPanelRef.current?.refreshOpen()}
              isRefreshing={prSubTab === "open" && prPanelLoading.open}
              className="h-full! flex-1 gap-1.5 rounded-none border-0! text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              <GitPullRequestCreate className="size-3.5" />
              <span>{tCommon("common.open")}</span>
            </RefreshableTabsTab>
            <RefreshableTabsTab
              value="closed"
              activeValue={prSubTab}
              refreshTitle={t("refreshClosed")}
              onRefresh={() => prPanelRef.current?.refreshClosed()}
              isRefreshing={prSubTab === "closed" && prPanelLoading.closed}
              className="h-full! flex-1 gap-1.5 rounded-none border-0! text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              <GitPullRequestClosed className="size-3.5" />
              <span>{tCommon("common.closed")}</span>
            </RefreshableTabsTab>
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-2 pb-2 pt-0">
        <PRPanel
          ref={prPanelRef}
          owner={githubOwner}
          repo={githubRepo}
          branch={currentBranch}
          prSubTab={prSubTab}
          onLoadingChange={setPRPanelLoading}
          onPrClick={(prNumber, prTitle) =>
            openCenterTab(
              createCanvasCenterTab({
                kind: "github-pr",
                owner: githubOwner,
                repo: githubRepo,
                branch: currentBranch,
                prNumber,
                title: t("pullRequestTitle", { number: prNumber }),
                description: prTitle ?? undefined,
              }),
            )
          }
        />
      </div>
    </div>
  );
}
