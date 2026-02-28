import React, { useState } from 'react';
import { useGithubPRList } from '@/hooks/use-github';
import { GitPullRequest, Search, Loader2, GitBranch, MessageSquare, GitCommit, RefreshCw, Github, ArrowLeft } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Button, Tabs, TabsList, TabsTab } from '@workspace/ui';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useWebSocketStore } from '@/hooks/use-websocket';

interface PRPanelProps {
  owner: string;
  repo: string;
  branch: string;
  onPrClick?: (prNumber: number) => void;
}

type PRState = 'OPEN' | 'CLOSED';

export function PRPanel({ owner, repo, branch, onPrClick }: PRPanelProps) {
  const [stateFilter, setStateFilter] = useState<PRState>('OPEN');
  const { data: prs, loading, refresh } = useGithubPRList({
    owner,
    repo,
    branch,
    state: stateFilter.toLowerCase()
  });

  if (loading && !prs) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="size-6 animate-spin opacity-50 mb-4" />
        <span className="text-xs font-medium">Fetching {stateFilter.toLowerCase()} PRs...</span>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prList: any[] = prs || [];

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex flex-col h-full w-full overflow-hidden">
        {/* Header */}
        <div className="px-3 h-9 flex items-center justify-between shrink-0 border-b border-sidebar-border/50 bg-background/50 backdrop-blur-sm">
          <span className="text-xs font-bold text-muted-foreground tracking-wider leading-none">Pull Requests</span>
          <Tabs value={stateFilter} onValueChange={(v) => setStateFilter(v as PRState)}>
            <TabsList className="">
              <TabsTab value="OPEN" className="">Open</TabsTab>
              <TabsTab value="CLOSED" className="">Closed</TabsTab>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-2">
          {prList.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground px-6">
              <div className="size-16 rounded-full bg-primary/5 flex items-center justify-center mb-6 border border-primary/10">
                <GitPullRequest className="size-8 text-primary/40" />
              </div>
              <span className="text-sm text-center font-medium mb-8">
                No {stateFilter.toLowerCase()} pull requests found for <span className="text-foreground font-mono bg-muted px-1.5 py-0.5 rounded border border-border/40">{branch}</span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => refresh()}
                className="h-9 px-6 text-[11px] font-bold tracking-widest gap-2.5 shadow-sm cursor-pointer"
              >
                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
                Refresh {stateFilter.toLowerCase()}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {prList.map((pr) => {
                const isFrom = pr.headRefName === branch;
                const isTo = pr.baseRefName === branch;

                // Detection logic for tooltip
                const detectionMethod = isFrom && isTo
                  ? "Self-merging detected (Circular or Sync PR)"
                  : isFrom
                    ? `Detected as an OUTGOING PR from your current branch (${branch})`
                    : `Detected as an INCOMING PR targeting your current branch (${branch})`;

                return (
                  <div
                    key={pr.number}
                    onClick={() => onPrClick?.(pr.number)}
                    className="flex flex-col p-3 rounded-md border border-sidebar-border bg-transparent hover:bg-sidebar-accent/50 transition-all cursor-pointer group"
                  >
                    {/* Top Row: Title & State */}
                    <div className="flex justify-between items-start mb-2.5">
                      <span className="text-[13px] font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2 pr-2">
                        {pr.title}
                      </span>
                      <span className={cn(
                        "text-[9px] font-black px-1.5 py-0.5 rounded-sm capitalize shrink-0 shadow-sm",
                        pr.state === 'OPEN' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                          pr.state === 'MERGED' ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20' :
                            'bg-red-500/10 text-red-500 border border-red-500/20'
                      )}>
                        {pr.state.toLowerCase()}
                      </span>
                    </div>

                    {/* Middle Row: Author & Branch Context */}
                    <div className="flex items-center justify-between mb-3 min-w-0">
                      <div className="flex items-center gap-2 shrink-0">
                        <Avatar className="size-4.5 shrink-0 border border-border/40 shadow-sm">
                          <AvatarImage src={pr.author?.avatar_url || pr.author?.avatarUrl || `https://github.com/${pr.author?.login?.replace('[bot]', '')}.png?size=32`} alt={pr.author?.login} />
                          <AvatarFallback className="text-[6px]">{pr.author?.login?.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="text-[11px] font-bold text-foreground/70 truncate max-w-[80px]">{pr.author?.login || 'unknown'}</span>
                      </div>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors border border-border/10 min-w-0 w-fit ml-auto shadow-sm">
                            <GitBranch className="size-3 text-muted-foreground/80 shrink-0" />
                            <span className={cn("text-[10px] font-mono truncate transition-colors", isTo ? "text-foreground font-bold underline decoration-foreground/30 underline-offset-2" : "text-muted-foreground/60")}>
                              {pr.baseRefName}
                            </span>
                            <ArrowLeft className="size-2.5 text-muted-foreground/30 shrink-0" />
                            <span className={cn("text-[10px] font-mono truncate transition-colors", isFrom ? "text-foreground font-bold underline decoration-foreground/30 underline-offset-2" : "text-muted-foreground/60")}>
                              {pr.headRefName}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[11px] p-2.5 space-y-2 max-w-[280px] shadow-xl border border-border/5">
                          <div className="font-bold flex items-center gap-2">
                            <GitBranch className="size-3.5" />
                            <span className="truncate">{pr.headRefName}</span>
                            <span className="px-1 text-[9px] bg-background/10 rounded font-black opacity-60">TO</span>
                            <span className="truncate">{pr.baseRefName}</span>
                          </div>
                          <div className="opacity-95 border-t border-background/10 pt-1.5 leading-relaxed">
                            {detectionMethod}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Bottom Row: Metadata Stats */}
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60 font-medium pt-1">
                      <div className="flex items-center gap-1 bg-muted/20 px-1.5 py-0.5 rounded border border-border/5">
                        <span className="font-bold text-foreground/40">#</span>
                        <span className="font-mono">{pr.number}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="size-3" />
                        <span className="font-mono tabular-nums">{pr.comments?.length || 0}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <GitCommit className="size-3" />
                        <span className="font-mono tabular-nums">{pr.commits?.length || 0}</span>
                      </div>

                      <div className="ml-auto flex items-center gap-1 opacity-70">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default">{formatDistanceToNow(new Date(pr.createdAt), { addSuffix: true })}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-[11px]">
                            {format(new Date(pr.createdAt), 'PPpp')}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
