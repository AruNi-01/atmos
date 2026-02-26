import React, { useState } from 'react';
import { useGithubPRList } from '@/hooks/use-github';
import { GitPullRequest, Search, Loader2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@workspace/ui';
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
                <div className="flex gap-1.5 ml-2 shrink-0">
                  {pr.isDraft && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground uppercase">
                      Draft
                    </span>
                  )}
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-sm capitalize",
                    pr.state === 'OPEN' ? 'bg-emerald-500/10 text-emerald-500' :
                      pr.state === 'MERGED' ? 'bg-purple-500/10 text-purple-500' :
                        'bg-red-500/10 text-red-500'
                  )}>
                    {pr.state.toLowerCase()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-2">
                <Avatar className="size-4 shrink-0 border border-sidebar-border/50">
                  <AvatarImage src={pr.author?.avatar_url || pr.author?.avatarUrl || `https://github.com/${pr.author?.login?.replace('[bot]', '')}.png?size=32`} alt={pr.author?.login} />
                  <AvatarFallback className="text-[6px]">{pr.author?.login?.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="font-medium text-foreground/80">{pr.author?.login || 'unknown'}</span>
                {(pr.author?.is_bot || pr.author?.login === 'cursor' || pr.author?.login === 'vercel' || pr.author?.login?.endsWith('[bot]')) && (
                  <span className="text-[9px] px-1 rounded-sm border border-sidebar-border bg-muted/30 text-muted-foreground font-medium py-0 leading-none h-3.5 flex items-center shrink-0">
                    bot
                  </span>
                )}
                <span>•</span>
                <span>#{pr.number}</span>
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
