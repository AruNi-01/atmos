"use client";

import React, { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryStates } from "nuqs";
import {
  CircleDot,
  GitPullRequest,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TabsSubtle,
  TabsSubtleItem,
  Workflow,
} from "@workspace/ui";
import { FolderOpen } from "lucide-react";
import { createPrDialogParams } from "@/shared/lib/nuqs/searchParams";
import { useGitStatusQuery } from "@/features/git/hooks/use-git-status-query";
import { useOpenGithubCenterTab } from "@/features/github/hooks/use-open-github-center-tab";
import { PRPanel, type PRPanelHandle } from "@/features/github/components/PRPanel";
import { IssuePanel } from "@/features/github/components/IssuePanel";
import { ActionsPanel, type ActionRun } from "@/features/github/components/ActionsPanel";
import { CreatePrDialog } from "@/features/github/components/CreatePrDialog";

export function GithubHubPanel({
  currentProjectPath,
}: {
  currentProjectPath: string | null;
}) {
  const t = useTranslations("AppShell.chrome");
  const { openActionRunTab, openPullRequestTab, openIssueTab } = useOpenGithubCenterTab();
  const statusQuery = useGitStatusQuery(currentProjectPath);
  const githubOwner = statusQuery.data?.github_owner ?? null;
  const githubRepo = statusQuery.data?.github_repo ?? null;
  const currentBranch = statusQuery.data?.current_branch ?? null;

  const [githubSubTab, setGithubSubTab] = useState<"pr" | "issues" | "actions">("pr");
  const [prSubTab, setPRSubTab] = useState<"open" | "closed">("open");
  const [issueSubTab, setIssueSubTab] = useState<"open" | "closed">("open");
  const [actionsRefreshKey] = useState(0);
  const prPanelRef = useRef<PRPanelHandle>(null);
  const [{ createPr }, setDialogParams] = useQueryStates(createPrDialogParams);

  const noContext = (
    <div className="flex h-full flex-col items-center justify-center text-muted-foreground/50">
      <FolderOpen className="mb-2 size-8 opacity-20" />
      <span className="text-center text-xs">{t("github.noContext")}</span>
    </div>
  );

  const notGithub = (
    <div className="flex h-full flex-col items-center justify-center py-10 text-muted-foreground/50">
      <GitPullRequest className="mb-2 size-8 opacity-20" />
      <span className="text-center text-xs">{t("github.notAGitHubRepository")}</span>
    </div>
  );

  if (!currentProjectPath) {
    return noContext;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-2 px-2 pb-2 pt-2">
        <TabsSubtle
          activeLabel
          idPrefix="center-github-hub"
          selectedIndex={githubSubTab === "pr" ? 0 : githubSubTab === "issues" ? 1 : 2}
          onSelect={(index) =>
            setGithubSubTab(index === 0 ? "pr" : index === 1 ? "issues" : "actions")
          }
        >
          <TabsSubtleItem
            index={0}
            icon={GitPullRequest}
            label={t("github.topTabs.pullRequests")}
          />
          <TabsSubtleItem
            index={1}
            icon={CircleDot}
            label={t("github.topTabs.issues")}
          />
          <TabsSubtleItem
            index={2}
            icon={Workflow}
            label={t("github.topTabs.actions")}
          />
        </TabsSubtle>
        {githubSubTab === "actions" ? (
          <div className="mx-1 h-px bg-border" role="separator" aria-hidden />
        ) : null}
      </div>

      {githubSubTab === "pr" ? (
        githubOwner && githubRepo && currentBranch ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex h-7 shrink-0 items-center px-2">
              <Select
                value={prSubTab}
                onValueChange={(value) => setPRSubTab(value as "open" | "closed")}
              >
                <SelectTrigger
                  size="sm"
                  className="!h-6 w-auto min-w-0 gap-1 px-2 py-0 text-[11px] shadow-none [&_svg:not([class*='size-'])]:size-3"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open" className="text-[11px]">
                    {t("common.open")}
                  </SelectItem>
                  <SelectItem value="closed" className="text-[11px]">
                    {t("common.closed")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mx-3 h-px shrink-0 bg-border" role="separator" aria-hidden />
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-0 no-scrollbar">
              <PRPanel
                ref={prPanelRef}
                owner={githubOwner}
                repo={githubRepo}
                branch={currentBranch}
                onPrClick={(prNumber, prTitle) =>
                  openPullRequestTab({
                    branch: currentBranch,
                    owner: githubOwner,
                    prNumber,
                    repo: githubRepo,
                    title: prTitle,
                  })
                }
                prSubTab={prSubTab}
                enabled
              />
            </div>
          </div>
        ) : (
          notGithub
        )
      ) : null}

      {githubSubTab === "issues" ? (
        githubOwner && githubRepo ? (
          <IssuePanel
            owner={githubOwner}
            repo={githubRepo}
            state={issueSubTab}
            onStateChange={setIssueSubTab}
            enabled
            onIssueClick={(issueNumber, title) =>
              openIssueTab({ owner: githubOwner, repo: githubRepo, issueNumber, title })
            }
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center py-10 text-muted-foreground/50">
            <CircleDot className="mb-2 size-8 opacity-20" />
            <span className="text-center text-xs">{t("github.notAGitHubRepository")}</span>
          </div>
        )
      ) : null}

      {githubSubTab === "actions" ? (
        githubOwner && githubRepo && currentBranch ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-0 no-scrollbar">
            <ActionsPanel
              key={actionsRefreshKey}
              owner={githubOwner}
              repo={githubRepo}
              branch={currentBranch}
              enabled
              onRunClick={(run: ActionRun) =>
                openActionRunTab({
                  owner: githubOwner,
                  repo: githubRepo,
                  run,
                })
              }
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center py-10 text-muted-foreground/50">
            <Workflow className="mb-2 size-8 opacity-20" />
            <span className="text-center text-xs">{t("github.notAGitHubRepository")}</span>
          </div>
        )
      ) : null}

      <CreatePrDialog
        githubOwner={githubOwner}
        githubRepo={githubRepo}
        currentBranch={currentBranch}
        open={!!createPr}
        onOpenChange={(open) => {
          if (!open) void setDialogParams({ createPr: false });
        }}
        onCreated={() => prPanelRef.current?.refreshOpen()}
      />
    </div>
  );
}
