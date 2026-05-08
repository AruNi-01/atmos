"use client";

import React, { useMemo, useEffect, useCallback, useState } from 'react';
import { GitCommit as GitCommitIcon, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@workspace/ui';
import { cn } from '@/lib/utils';
import { useGitLog, type GitCommit } from '@/hooks/use-github';
import { fromUnixTime } from 'date-fns';
import { CommitList, type CommitListItem } from './CommitList';

interface CommitsPanelProps {
  repoPath: string;
  branch: string;
  owner?: string;
  repo?: string;
  onRefreshReady?: (refresh: () => Promise<unknown> | void) => void;
  onLoadingChange?: (loading: boolean) => void;
}

function toCommitListItem(c: GitCommit, owner?: string, repo?: string): CommitListItem {
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

export function CommitsPanel({ repoPath, owner, repo, onRefreshReady, onLoadingChange }: CommitsPanelProps) {
  const { commits, loading, page, hasMore, goToPrevPage, goToNextPage, refresh } = useGitLog({ repoPath });
  const items = useMemo(() => commits.map(c => toCommitListItem(c, owner, repo)), [commits, owner, repo]);

  useEffect(() => { onRefreshReady?.(refresh); }, [onRefreshReady, refresh]);
  useEffect(() => { onLoadingChange?.(loading); }, [loading, onLoadingChange]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full w-full">
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <CommitList commits={items} loading={loading} owner={owner} repo={repo} />

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
                  <TooltipContent side="top" className="text-[11px]">Previous page</TooltipContent>
                </Tooltip>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-sidebar-accent/50 rounded-sm border border-sidebar-border/30 select-none">
                  <span className="text-[10px] text-muted-foreground/60 font-medium tracking-tight">PAGE</span>
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
                  <TooltipContent side="top" className="text-[11px]">Next page</TooltipContent>
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
