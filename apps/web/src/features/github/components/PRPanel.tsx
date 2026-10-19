import React, { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useGithubPRPage } from "@/features/github/hooks/use-github";
import { Loader2, GitBranch, GitCommit, ArrowLeft } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  ScrollArea,
} from "@workspace/ui";
import { formatDistanceToNow, format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { cn } from "@/shared/lib/utils";
import { GithubListPagination } from "@/features/github/components/GithubListPagination";
import { GithubUserAvatar } from "@/features/github/components/GithubUserHoverCard";

interface PRPanelProps {
  owner: string;
  repo: string;
  branch: string;
  onPrClick?: (prNumber: number, prTitle?: string | null) => void;
  prSubTab?: "open" | "closed";
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

type PRState = "OPEN" | "CLOSED";

export const PRPanel = React.forwardRef<PRPanelHandle, PRPanelProps>(function PRPanel(
  { owner, repo, branch, onPrClick, prSubTab, onLoadingChange, enabled = true },
  ref,
) {
  const locale = useLocale();
  const t = useTranslations("AppShell.chrome");
  const relativeTimeLocale = locale.startsWith("zh") ? zhCN : enUS;
  const stateFilter: PRState = prSubTab === "closed" ? "CLOSED" : "OPEN";

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
      open: stateFilter === "OPEN" && activeBusy,
      closed: stateFilter === "CLOSED" && activeBusy,
    });
  }, [activeBusy, onLoadingChange, stateFilter]);

  React.useImperativeHandle(
    ref,
    () => ({
      refreshOpen: () => activePrList.refresh(),
      refreshClosed: () => activePrList.refresh(),
      isOpenLoading: stateFilter === "OPEN" && activeBusy,
      isClosedLoading: stateFilter === "CLOSED" && activeBusy,
    }),
    [activeBusy, activePrList.refresh, stateFilter],
  );

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
        <ScrollArea scrollFade className="min-h-0 min-w-0 flex-1" viewportClassName="p-2">
          {loading && !prs ? (
            <div className="flex min-h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : prList.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center px-6 text-center text-xs text-muted-foreground">
              {stateFilter === "OPEN"
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
                const detectionMethod =
                  isFrom && isTo
                    ? t("github.pr.selfMerging")
                    : isFrom
                      ? t("github.pr.outgoingPr", { branch })
                      : t("github.pr.incomingPr", { branch });

                return (
                  <div
                    key={pr.number}
                    onClick={() => onPrClick?.(pr.number, pr.title)}
                    className="group flex cursor-pointer flex-col rounded-md border border-sidebar-border bg-transparent p-3 hover:bg-sidebar-accent/50"
                  >
                    {/* Top Row: Title & State */}
                    <div className="mb-2.5 flex items-start justify-between">
                      <span className="line-clamp-2 pr-2 text-[13px] leading-tight font-bold group-hover:text-primary">
                        {pr.title}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-black capitalize shadow-sm",
                          prState === "OPEN"
                            ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                            : prState === "MERGED"
                              ? "border border-purple-500/20 bg-purple-500/10 text-purple-500"
                              : "border border-red-500/20 bg-red-500/10 text-red-500",
                        )}
                      >
                        {prState === "OPEN"
                          ? t("github.pr.stateOpen")
                          : prState === "MERGED"
                            ? t("github.pr.stateMerged")
                            : t("github.pr.stateClosed")}
                      </span>
                    </div>

                    {/* Middle Row: Author & Branch Context */}
                    <div className="mb-3 flex min-w-0 items-center justify-between">
                      <div className="flex min-w-0 shrink-0 items-center gap-2">
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
                          <div className="ml-auto flex w-fit min-w-0 items-center gap-1.5 rounded-md border border-border/10 bg-muted/40 px-2 py-1 shadow-sm hover:bg-muted/60">
                            <GitBranch className="size-3 shrink-0 text-muted-foreground/80" />
                            <span
                              className={cn(
                                "truncate font-mono text-[10px]",
                                isTo
                                  ? "font-bold text-foreground underline decoration-foreground/30 underline-offset-2"
                                  : "text-muted-foreground/60",
                              )}
                            >
                              {pr.baseRefName}
                            </span>
                            <ArrowLeft className="size-2.5 shrink-0 text-muted-foreground/30" />
                            <span
                              className={cn(
                                "truncate font-mono text-[10px]",
                                isFrom
                                  ? "font-bold text-foreground underline decoration-foreground/30 underline-offset-2"
                                  : "text-muted-foreground/60",
                              )}
                            >
                              {pr.headRefName}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="max-w-[280px] space-y-2 border border-border/5 p-2.5 text-[11px] shadow-xl"
                        >
                          <div className="flex items-center gap-2 font-bold">
                            <GitBranch className="size-3.5" />
                            <span className="truncate">{pr.headRefName}</span>
                            <span className="rounded bg-background/10 px-1 text-[9px] font-black opacity-60">
                              {t("github.pr.to")}
                            </span>
                            <span className="truncate">{pr.baseRefName}</span>
                          </div>
                          <div className="border-t border-background/10 pt-1.5 leading-relaxed opacity-95">
                            {detectionMethod}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Bottom Row: Metadata Stats */}
                    <div className="flex items-center gap-4 pt-1 text-[10px] font-medium text-muted-foreground/60">
                      <div className="flex items-center gap-1 rounded border border-border/5 bg-muted/20 px-1.5 py-0.5">
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
                            {format(new Date(pr.createdAt), "PPpp", {
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
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
});
