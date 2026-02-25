import React, { useState } from 'react';
import { useGithubPRList } from '@/hooks/use-github';
import { GitPullRequest, Search, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useWebSocketStore } from '@/hooks/use-websocket';

interface PRPanelProps {
  owner: string;
  repo: string;
  branch: string;
  onPrClick?: (prNumber: number) => void;
}

export function PRPanel({ owner, repo, branch, onPrClick }: PRPanelProps) {
  const { data: prs, loading, refresh } = useGithubPRList({ owner, repo, branch });
  const send = useWebSocketStore(s => s.send);

  if (loading && !prs) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="size-6 animate-spin opacity-50 mb-4" />
        <span className="text-xs">Loading Pull Requests...</span>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prList: any[] = prs || [];

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto no-scrollbar p-2">
      <div className="mb-4">
        <button
          onClick={() => {
            // Trigger Create PR
            send('github_pr_create', { owner, repo, branch, title: `Update from ${branch}`, body: '' })
              .then(() => refresh())
              .catch(console.error);
          }}
          className="w-full h-8 flex items-center justify-center gap-2 rounded-md transition-all text-xs font-semibold select-none bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <GitPullRequest className="size-3.5" />
          Create PR
        </button>
      </div>

      {prList.length === 0 ? (
        <div className="flex flex-col items-center text-muted-foreground/50 py-10">
          <Search className="size-8 opacity-20 mb-2" />
          <span className="text-xs text-center">No Pull Requests found for this branch.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {prList.map((pr) => (
            <div
              key={pr.number}
              onClick={() => onPrClick?.(pr.number)}
              className="flex flex-col p-3 rounded-md border border-sidebar-border bg-sidebar-accent/30 hover:bg-sidebar-accent/80 transition-colors cursor-pointer group"
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-[13px] font-medium leading-tight group-hover:text-foreground line-clamp-2">
                  {pr.title}
                </span>
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-sm capitalize shrink-0 ml-2",
                  pr.state === 'OPEN' ? 'bg-emerald-500/10 text-emerald-500' :
                    pr.state === 'MERGED' ? 'bg-purple-500/10 text-purple-500' :
                      'bg-red-500/10 text-red-500'
                )}>
                  {pr.state.toLowerCase()}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-2">
                <span>#{pr.number}</span>
                <span>•</span>
                <span className="truncate max-w-[100px]">{pr.author?.login || 'unknown'}</span>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(pr.createdAt), { addSuffix: true })}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
