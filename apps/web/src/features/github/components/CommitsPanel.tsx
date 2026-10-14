"use client";

import React, { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  ScrollArea,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import type { GitCommit } from "@/features/github/hooks/use-github";
import { fromUnixTime } from "date-fns";
import { CommitList, type CommitListItem } from "./CommitList";
import { useOpenGitCommitCenterTab } from "@/features/git/hooks/use-open-git-commit-center-tab";

interface CommitsPanelProps {
  commits: GitCommit[];
  loading: boolean;
  page: number;
  hasMore: boolean;
  goToPrevPage: () => void;
  goToNextPage: () => void;
  owner?: string;
  repo?: string;
}

export function toCommitListItem(c: GitCommit, owner?: string, repo?: string): CommitListItem {
  return {
    hash: c.hash,
    shortHash: c.short_hash,
    subject: c.subject,
    body: c.body || undefined,
    authorName: c.author_name,
    authorAvatarUrl: c.author_avatar_url,
    timestamp: fromUnixTime(c.timestamp),
    isPushed: c.is_pushed,
    githubUrl: owner && repo ? `https://github.com/${owner}/${repo}/commit/${c.hash}` : undefined,
  };
}

export function CommitsPanel({
  commits,
  loading,
  page,
  hasMore,
  goToPrevPage,
  goToNextPage,
  owner,
  repo,
}: CommitsPanelProps) {
  const t = useTranslations("github.commitsPanel");
  const { openCommitTab } = useOpenGitCommitCenterTab();
  const items = useMemo(
    () => commits.map((c) => toCommitListItem(c, owner, repo)),
    [commits, owner, repo],
  );

  const handleCommitClick = useCallback(
    (commit: CommitListItem) => {
      if (!owner || !repo || commit.isPushed === false) return;
      openCommitTab({
        owner,
        repo,
        sha: commit.hash,
        subject: commit.subject,
        authorName: commit.authorName,
      });
    },
    [openCommitTab, owner, repo],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full w-full flex-col">
        <ScrollArea scrollFade className="min-h-0 flex-1">
          <CommitList
            commits={items}
            loading={loading}
            owner={owner}
            repo={repo}
            onCommitClick={handleCommitClick}
          />

          {(page > 0 || hasMore) && (
            <div className="flex items-center justify-between border-t border-sidebar-border/10 px-4 py-4">
              <div className="flex-1" />
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={goToPrevPage}
                      disabled={page === 0 || loading}
                      className={cn(
                        "rounded-md border border-sidebar-border/50 p-1.5 shadow-xs",
                        page === 0 || loading
                          ? "cursor-not-allowed border-transparent bg-transparent text-muted-foreground/30 shadow-none"
                          : "cursor-pointer bg-background text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                      )}
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px]">
                    {t("previousPage")}
                  </TooltipContent>
                </Tooltip>
                <div className="flex items-center gap-1.5 rounded-sm border border-sidebar-border/30 bg-sidebar-accent/50 px-3 py-1 select-none">
                  <span className="text-[10px] font-medium tracking-tight text-muted-foreground/60">
                    {t("page")}
                  </span>
                  <span className="font-mono text-[11px] font-bold text-foreground">
                    {page + 1}
                  </span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={goToNextPage}
                      disabled={!hasMore || loading}
                      className={cn(
                        "rounded-md border border-sidebar-border/50 p-1.5 shadow-xs",
                        !hasMore || loading
                          ? "cursor-not-allowed border-transparent bg-transparent text-muted-foreground/30 shadow-none"
                          : "cursor-pointer bg-background text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                      )}
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px]">
                    {t("nextPage")}
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex-1" />
            </div>
          )}
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
