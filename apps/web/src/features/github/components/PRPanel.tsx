import React, { useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useGithubPRPage } from '@/features/github/hooks/use-github';
import {
  GitPullRequest,
  Loader2,
  GitBranch,
  MessageSquare,
  GitCommit,
  ArrowLeft,
} from 'lucide-react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@workspace/ui';
import { formatDistanceToNow, format } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { cn } from '@/shared/lib/utils';
import { GithubListPagination } from '@/features/github/components/GithubListPagination';
import { GithubUserAvatar } from '@/features/github/components/GithubUserHoverCard';

interface PRPanelProps {
  owner: string;
  repo: string;
  branch: string;
  onPrClick?: (prNumber: number, prTitle?: string | null) => void;
  prSubTab?: 'open' | 'closed';
  refreshRef?: React.Ref<PRPanelHandle>;
  onLoadingChange?: (loading: { open: boolean; closed: boolean }) => void;
  enabled?: boolean;
}

export interface PRPanelHandle {
  refreshOpen: () => void | Promise<unknown>;
  refreshClosed: () => void | Promise<unknown>;
  isOpenLoading: boolean;
  isClosedLoading: boolean;
}

type PRState = 'OPEN' | 'CLOSED';

export const PRPanel = React.forwardRef<PRPanelHandle, PRPanelProps>(function PRPanel({ owner, repo, branch, onPrClick, prSubTab, onLoadingChange, enabled = true }, ref) {
  const locale = useLocale();
  const t = useTranslations('AppShell.chrome');
  const relativeTimeLocale = locale.startsWith('zh') ? zhCN : enUS;
  const stateFilter: PRState = prSubTab === 'closed' ? 'CLOSED' : 'OPEN';

  const [page, setPage] = React.useState(1);
  const activePrList = useGithubPRPage({
    owner,
    repo,
    branch,
    state: stateFilter,
    page,
    enabled,
  });
  const activeBusy = activePrList.loading || activePrList.refreshing;

  useEffect(() => {
    onLoadingChange?.({
      open: stateFilter === 'OPEN' && activeBusy,
      closed: stateFilter === 'CLOSED' && activeBusy,
    });
  }, [activeBusy, onLoadingChange, stateFilter]);

  React.useImperativeHandle(ref, () => ({
    refreshOpen: () => activePrList.refresh(),
    refreshClosed: () => activePrList.refresh(),
    isOpenLoading: stateFilter === 'OPEN' && activeBusy,
    isClosedLoading: stateFilter === 'CLOSED' && activeBusy,
  }), [activeBusy, activePrList.refresh, stateFilter]);

  const prs = activePrList.data.items;
  const hasMore = activePrList.data.has_more;
  const loading = activePrList.loading;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prList: any[] = prs || [];

  useEffect(() => {
    setPage(1);
  }, [branch, stateFilter]);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto no-scrollbar p-2">
          {loading && !prs ? (
            <div className="flex min-h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : prList.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center px-6 text-center text-xs text-muted-foreground">
              {stateFilter === 'OPEN'
                ? t.rich("github.pr.noOpenFound", {
                    branch,
                    highlight: (chunks) => <>{chunks}</>,
                  })
                : t.rich("github.pr.noClosedFound", {
                    branch,
                    highlight: (chunks) => <>{chunks}</>,
                  })}
            </div>
          ) : (
            <div className="min-w-0 space-y-2">
              {prList.map((pr) => {
                const isFrom = pr.headRefName === branch;
                const isTo = pr.baseRefName === branch;
                // Normalize casing: REST `/pulls` historically returned lowercase
                // `open`/`closed`, while `gh pr list --json` returns OPEN/CLOSED/MERGED.
                const prState = String(pr.state ?? "").toUpperCase();

                // Detection logic for tooltip
                const detectionMethod = isFrom && isTo
                  ? t("github.pr.selfMerging")
                  : isFrom
                    ? t("github.pr.outgoingPr", { branch })
                    : t("github.pr.incomingPr", { branch });

                return (
                  <div
                    key={pr.number}
                    onClick={() => onPrClick?.(pr.number, pr.title)}
                    className="flex flex-col p-3 rounded-md border border-sidebar-border bg-transparent hover:bg-sidebar-accent/50 cursor-pointer group"
                  >
                    {/* Top Row: Title & State */}
                    <div className="flex justify-between items-start mb-2.5">
                      <span className="text-[13px] font-bold leading-tight group-hover:text-primary line-clamp-2 pr-2">
                        {pr.title}
                      </span>
                      <span className={cn(
                        "text-[9px] font-black px-1.5 py-0.5 rounded-sm capitalize shrink-0 shadow-sm",
                        prState === 'OPEN' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                          prState === 'MERGED' ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20' :
                            'bg-red-500/10 text-red-500 border border-red-500/20'
                      )}>
                        {prState === 'OPEN'
                          ? t("github.pr.stateOpen")
                          : prState === 'MERGED'
                          ? t("github.pr.stateMerged")
                          : t("github.pr.stateClosed")}
                      </span>
                    </div>

                    {/* Middle Row: Author & Branch Context */}
                    <div className="flex items-center justify-between mb-3 min-w-0">
                      <div className="flex items-center gap-2 shrink-0 min-w-0">
                        <GithubUserAvatar
                          username={pr.author?.login}
                          avatarUrl={pr.author?.avatar_url || pr.author?.avatarUrl}
                          className="size-4.5 shrink-0 border border-border/40 shadow-sm"
                          fallbackClassName="text-[6px]"
                          label={pr.author?.login || t("github.pr.unknownAuthor")}
                          labelClassName="text-[11px] font-bold text-foreground/70 truncate max-w-[80px]"
                        />
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
                            <span className="px-1 text-[9px] bg-background/10 rounded font-black opacity-60">{t("github.pr.to")}</span>
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

                      {Array.isArray(pr.commits) && pr.commits.length > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <GitCommit className="size-3" />
                          <span className="font-mono tabular-nums">{pr.commits.length}</span>
                        </div>
                      ) : null}

                      <div className="ml-auto flex items-center gap-1 opacity-70">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default">
                              {formatDistanceToNow(new Date(pr.createdAt), {
                                addSuffix: true,
                                locale: relativeTimeLocale,
                              })}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-[11px]">
                            {format(new Date(pr.createdAt), 'PPpp', {
                              locale: relativeTimeLocale,
                            })}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                );
              })}
              <GithubListPagination
                page={page}
                hasMore={hasMore}
                onPageChange={setPage}
                previousLabel={t("github.pr.previousPage")}
                nextLabel={t("github.pr.nextPage")}
              />
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
});
