"use client";

import React, { useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@workspace/ui';
import { cn } from '@/shared/lib/utils';
import type { GitCommit } from '@/features/github/hooks/use-github';
import { fromUnixTime } from 'date-fns';
import { CommitList, type CommitListItem } from './CommitList';
import { useOpenGithubCenterTab } from '@/features/github/hooks/use-open-github-center-tab';

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
  const t = useTranslations('github.commitsPanel');
  const { openCommitTab } = useOpenGithubCenterTab();
  const items = useMemo(() => commits.map(c => toCommitListItem(c, owner, repo)), [commits, owner, repo]);

  const handleCommitClick = useCallback((commit: CommitListItem) => {
    if (!owner || !repo || commit.isPushed === false) return;
    openCommitTab({
      owner,
      repo,
      sha: commit.hash,
      subject: commit.subject,
      authorName: commit.authorName,
    });
  }, [openCommitTab, owner, repo]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full w-full">
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <CommitList commits={items} loading={loading} owner={owner} repo={repo} onCommitClick={handleCommitClick} />

          {(page > 0 || hasMore) && (
            <div className="flex items-center justify-between px-4 py-4 border-t border-sidebar-border/10">
              <div className="flex-1" />
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={goToPrevPage}
                      disabled={page === 0 || loading}
                      className={cn(
                        "p-1.5 rounded-md border border-sidebar-border/50 transition-colors shadow-xs",
                        page === 0 || loading
                          ? "text-muted-foreground/30 cursor-not-allowed bg-transparent border-transparent shadow-none"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground cursor-pointer bg-background"
                      )}
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px]">{t('previousPage')}</TooltipContent>
                </Tooltip>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-sidebar-accent/50 rounded-sm border border-sidebar-border/30 select-none">
                  <span className="text-[10px] text-muted-foreground/60 font-medium tracking-tight">{t('page')}</span>
                  <span className="text-[11px] text-foreground font-bold font-mono">{page + 1}</span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={goToNextPage}
                      disabled={!hasMore || loading}
                      className={cn(
                        "p-1.5 rounded-md border border-sidebar-border/50 transition-colors shadow-xs",
                        !hasMore || loading
                          ? "text-muted-foreground/30 cursor-not-allowed bg-transparent border-transparent shadow-none"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground cursor-pointer bg-background"
                      )}
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px]">{t('nextPage')}</TooltipContent>
                </Tooltip>
              </div>
              <div className="flex-1" />
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
