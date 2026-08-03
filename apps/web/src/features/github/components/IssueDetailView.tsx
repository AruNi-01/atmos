"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Skeleton,
  Button,
  Textarea,
  TabsSubtle,
  TabsSubtleItem,
} from "@workspace/ui";
import {
  CircleDot,
  CheckCircle2,
  Check,
  ExternalLink,
  Eye,
  FileText,
  Github,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Milestone,
  MessageSquare,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  RotateCw,
  Settings2,
  Plus,
  Send,
  Tag,
  User,
  XCircle,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui";
import { formatDistanceToNow } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import {
  useGithubIssueDetail,
  useGithubIssueLinkedPrs,
  useGithubIssueTimeline,
} from "@/features/github/hooks/use-github";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import { cn } from "@/shared/lib/utils";
import { SidebarSection } from "@/features/github/lib/pr-detail-parts";
import type { TimelineItem } from "@/features/github/lib/pr-detail-parts";
import {
  AssigneesList,
  AssigneesEditor,
  LabelsEditor,
  LabelsList,
} from "@/features/github/lib/pr-detail-sidebar";
import { useOpenGithubCenterTab } from "@/features/github/hooks/use-open-github-center-tab";
import { useRepoPrListQuery } from "@/features/github/hooks/use-github-pr-query";
import { groupConsecutiveTimelineCommits } from "@/features/github/lib/timeline-commits";
import { TimelineCommitsGroup } from "@/features/github/components/TimelineCommitsGroup";
import { wsRequest } from "@/api/ws/request";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";

type IssueMainTab = "description" | "discussion";

type IssueTimelineModel = TimelineItem & {
  author?: { login?: string; avatar_url?: string; avatarUrl?: string };
  createdAt: string;
  body: string;
  isComment: boolean;
};

interface IssueDetailViewProps {
  owner: string;
  repo: string;
  issueNumber: number;
  active: boolean;
}

export function IssueDetailView({
  owner,
  repo,
  issueNumber,
  active,
}: IssueDetailViewProps) {
  const locale = useLocale();
  const t = useTranslations("github.issueDetail");
  const relativeTimeLocale = locale.startsWith("zh") ? zhCN : enUS;
  const { openCommitTab } = useOpenGithubCenterTab();
  const { data: issue, loading } = useGithubIssueDetail(
    issueNumber,
    owner,
    repo,
    active,
  );
  const [activeTab, setActiveTab] = React.useState<IssueMainTab>("description");
  const [visitedDiscussion, setVisitedDiscussion] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const { items, isLoading, hasMore, loadMore } = useGithubIssueTimeline(
    issueNumber,
    owner,
    repo,
    active && visitedDiscussion,
  );
  const { data: linkedPrs, loading: linkedPrsLoading } = useGithubIssueLinkedPrs(
    issueNumber,
    owner,
    repo,
    active,
  );

  const discussion = React.useMemo(
    () =>
      items
        .map((item: TimelineItem) => {
          const actor = item.actor ?? item.author ?? item.user;
          // `committed` events expose {name,email,date} without login/avatar.
          const rawAuthor = item.author as
            | { login?: string; name?: string; avatar_url?: string; avatarUrl?: string }
            | undefined;
          const user =
            item.event === "committed" && rawAuthor && !rawAuthor.login
              ? {
                  login: rawAuthor.name,
                  avatar_url: `https://github.com/${encodeURIComponent(rawAuthor.name ?? "ghost")}.png?size=32`,
                  avatarUrl: `https://github.com/${encodeURIComponent(rawAuthor.name ?? "ghost")}.png?size=32`,
                }
              : (actor as
                  | { login?: string; avatar_url?: string; avatarUrl?: string }
                  | undefined);
          return {
            ...item,
            author: user,
            createdAt:
              item.created_at ??
              item.author?.date ??
              item.submitted_at ??
              item.authoredDate ??
              "",
            body: item.body ?? item.message ?? item.messageHeadline ?? "",
            isComment: item.event === "commented",
          };
        })
        .sort(
          (left, right) =>
            new Date(left.createdAt).getTime() -
            new Date(right.createdAt).getTime(),
        ),
    [items],
  );

  const groupedDiscussion = React.useMemo(
    () => groupConsecutiveTimelineCommits(discussion),
    [discussion],
  );

  const selectTab = (tab: IssueMainTab) => {
    setActiveTab(tab);
    if (tab === "discussion") setVisitedDiscussion(true);
  };

  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col overflow-hidden px-6">
      <header className="relative flex shrink-0 items-center gap-3 pb-4 pt-6 pr-12">
        <Github className="size-4.5 text-muted-foreground/60" />
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="whitespace-nowrap text-base font-bold">
            {t("header", { issueNumber })}
          </h2>
          <span className="select-none font-light text-muted-foreground/30">
            |
          </span>
          <p className="truncate pt-0.5 text-[11px] font-medium text-muted-foreground/60">
            {owner}/{repo}
          </p>
        </div>
        <button
          type="button"
          className="absolute right-0 top-6 flex size-7 items-center justify-center rounded-md opacity-70 transition-colors hover:bg-muted hover:opacity-100"
          onClick={() => setSidebarCollapsed((value) => !value)}
          title={sidebarCollapsed ? t("showSidebar") : t("hideSidebar")}
        >
          {sidebarCollapsed ? (
            <PanelRightOpen className="size-3.5" />
          ) : (
            <PanelRightClose className="size-3.5" />
          )}
        </button>
      </header>

      {loading ? (
        <div className="flex flex-1 flex-col gap-4 pt-2">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : issue ? (
        <>
        <div className="flex min-h-0 flex-1 gap-3 text-sm">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto pr-1 pb-16">
              <div className="sticky top-0 z-20 bg-background pb-3 pt-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CircleDot
                      className={cn(
                        "size-4",
                        issue.state.toLowerCase() === "closed"
                          ? "text-purple-500"
                          : "text-emerald-500",
                      )}
                    />
                    <h3 className="truncate text-base font-semibold">
                      {issue.title}
                    </h3>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-mono">#{issue.number}</span>
                    <span>
                      {issue.state.toLowerCase() === "closed"
                        ? t("closed")
                        : t("open")}
                    </span>
                    {issue.updated_at ? (
                      <span>
                        {t("updated", {
                          time: formatDistanceToNow(
                            new Date(issue.updated_at),
                            { addSuffix: true, locale: relativeTimeLocale },
                          ),
                        })}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 border-t border-border/40 pt-3">
                  <TabsSubtle
                    activeLabel
                    idPrefix={`issue-${issue.number}`}
                    selectedIndex={activeTab === "description" ? 0 : 1}
                    onSelect={(index) =>
                      selectTab(index === 0 ? "description" : "discussion")
                    }
                  >
                    <TabsSubtleItem
                      index={0}
                      icon={FileText}
                      label={t("tabs.description")}
                    />
                    <TabsSubtleItem
                      index={1}
                      icon={MessageSquare}
                      label={t("tabs.discussionWithCount", {
                        count: issue.comments_count,
                      })}
                    />
                  </TabsSubtle>
                </div>
              </div>

              <div
                className={cn("pt-4", activeTab !== "description" && "hidden")}
              >
                {issue.body ? (
                  <div className="rounded-md border border-border/50 p-4">
                    <MarkdownRenderer className="prose prose-sm max-w-none text-[13px] leading-relaxed dark:prose-invert prose-p:my-0 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
                      {issue.body}
                    </MarkdownRenderer>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border/50 px-4 py-8 text-center text-[12px] text-muted-foreground">
                    {t("emptyDescription")}
                  </div>
                )}
              </div>

              {visitedDiscussion ? (
                <div
                  className={cn(
                    "relative pt-4",
                    activeTab !== "discussion" && "hidden",
                  )}
                >
                  {isLoading && discussion.length === 0 ? (
                    <div className="space-y-5">
                      {[0, 1, 2].map((item) => (
                        <Skeleton key={item} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : discussion.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border/50 px-4 py-8 text-center text-[12px] text-muted-foreground">
                      {t("emptyDiscussion")}
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="absolute bottom-0 left-4 top-4 w-0.5 bg-border/60" />
                      <div className="relative flex flex-col gap-5">
                        {groupedDiscussion.map((entry, index) => {
                          if (entry.kind === "commits") {
                            return (
                              <TimelineCommitsGroup
                                key={`commits-${entry.startIndex}`}
                                commits={entry.commits}
                                locale={relativeTimeLocale}
                                onCommitClick={({ sha, subject, authorName }) => {
                                  openCommitTab({
                                    owner,
                                    repo,
                                    sha,
                                    subject,
                                    authorName,
                                  });
                                }}
                              />
                            );
                          }
                          return (
                            <IssueTimelineItem
                              key={`${entry.item.createdAt}-${index}`}
                              item={entry.item}
                              locale={relativeTimeLocale}
                              t={t}
                              owner={owner}
                              repo={repo}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {hasMore && !isLoading ? (
                    <div className="relative mt-6 flex justify-center">
                      <button
                        type="button"
                        onClick={loadMore}
                        className="rounded-md border border-border/60 bg-muted/30 px-4 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                      >
                        {t("loadMore")}
                      </button>
                    </div>
                  ) : null}
                  <IssueDiscussionComposer issue={issue} t={t} />
                </div>
              ) : null}
            </div>
          </div>

          <IssueMetadataSidebar
            issue={issue}
            linkedPrs={linkedPrs}
            linkedPrsLoading={linkedPrsLoading}
            collapsed={sidebarCollapsed}
            t={t}
          />
        </div>
        <IssueActionToolbar issue={issue} t={t} />
        </>
      ) : (
        <div className="text-sm text-muted-foreground">{t("notFound")}</div>
      )}
    </div>
  );
}

function IssueActionToolbar({
  issue,
  t,
}: {
  issue: NonNullable<ReturnType<typeof useGithubIssueDetail>["data"]>;
  t: ReturnType<typeof useTranslations<"github.issueDetail">>;
}) {
  const scope = useComputerQueryScope();
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState<"close" | "reopen" | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const [shouldRenderToolbar, setShouldRenderToolbar] = React.useState(false);
  const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const openFrameRef = React.useRef<number | null>(null);
  const isClosed = issue.state.toLowerCase() === "closed";

  const cancelClose = React.useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (openFrameRef.current != null) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
  }, []);

  const scheduleOpenAfterMount = React.useCallback(() => {
    openFrameRef.current = requestAnimationFrame(() => {
      openFrameRef.current = requestAnimationFrame(() => {
        setIsOpen(true);
        openFrameRef.current = null;
      });
    });
  }, []);

  const openToolbar = React.useCallback(() => {
    cancelClose();
    if (shouldRenderToolbar) {
      setIsOpen(true);
      return;
    }
    setShouldRenderToolbar(true);
    scheduleOpenAfterMount();
  }, [cancelClose, scheduleOpenAfterMount, shouldRenderToolbar]);

  const closeToolbar = React.useCallback(() => {
    cancelClose();
    setIsOpen(false);
    closeTimeoutRef.current = setTimeout(() => {
      setShouldRenderToolbar(false);
      closeTimeoutRef.current = null;
    }, 220);
  }, [cancelClose]);

  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      if (openFrameRef.current != null) cancelAnimationFrame(openFrameRef.current);
    };
  }, []);

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.computer.githubIssueDetail(scope, {
        owner: issue.owner,
        repo: issue.repo,
        issueNumber: issue.number,
      }),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.computer.githubIssueTimeline(scope, {
        owner: issue.owner,
        repo: issue.repo,
        issueNumber: issue.number,
      }),
    });
  };

  const act = async (action: "close" | "reopen") => {
    setPending(action);
    try {
      await wsRequest(`github_issue_${action}`, {
        owner: issue.owner,
        repo: issue.repo,
        issue_number: issue.number,
        body: null,
      });
      invalidate();
    } finally {
      setPending(null);
    }
  };

  const openOnGithub = () => {
    if (issue.url) window.open(issue.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 justify-center">
      <div className="pointer-events-auto relative flex items-end justify-center">
        {shouldRenderToolbar ? (
          <div
            onMouseEnter={() => {
              cancelClose();
            }}
            onMouseLeave={closeToolbar}
            aria-hidden={!isOpen}
            className={cn(
              "absolute bottom-full left-1/2 z-10 flex max-w-[calc(100vw-3rem)] -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl border border-dashed border-border/80 bg-background/90 px-4 py-2.5 shadow-xl backdrop-blur-md",
              !isOpen
                ? "pointer-events-none opacity-0 transition-opacity duration-220 ease-in"
                : "pointer-events-auto opacity-100 transition-opacity duration-280 ease-[cubic-bezier(0.22,1,0.36,1)]",
            )}
          >
            {/* Hit bridge so the pointer can move from the pill into the panel. */}
            <div className="absolute left-1/2 top-full h-4 w-32 -translate-x-1/2" />
            <Button
              variant="outline"
              size="sm"
              onClick={openOnGithub}
              className="h-8 border-0 px-3 text-[11px] shadow-sm transition-shadow hover:shadow-md"
            >
              <Github className="mr-1.5 size-3.5" />
              {t("toolbar.openOnGithub")}
            </Button>
            <div className="mx-1 h-5 w-px shrink-0 bg-border/40" />
            <Button
              variant={isClosed ? "outline" : "destructive"}
              size="sm"
              onClick={() => void act(isClosed ? "reopen" : "close")}
              disabled={Boolean(pending)}
              className="h-8 border-0 text-[11px] shadow-sm"
            >
              {pending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : isClosed ? (
                <RotateCw className="mr-1.5 size-3.5" />
              ) : (
                <XCircle className="mr-1.5 size-3.5" />
              )}
              {isClosed ? t("toolbar.reopen") : t("toolbar.close")}
            </Button>
          </div>
        ) : null}

        <button
          type="button"
          aria-label={t("toolbar.showActions")}
          onClick={openToolbar}
          onFocus={openToolbar}
          onMouseEnter={openToolbar}
          className={cn(
            "h-1.5 w-40 rounded-full border-0 bg-foreground/20 p-0 shadow-[0_1px_8px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            !isOpen
              ? "pointer-events-auto opacity-100 transition-opacity duration-220 ease-in"
              : "pointer-events-none opacity-0 transition-opacity duration-280 ease-[cubic-bezier(0.22,1,0.36,1)]",
          )}
        />
      </div>
    </div>
  );
}

function IssueDiscussionComposer({
  issue,
  t,
}: {
  issue: NonNullable<ReturnType<typeof useGithubIssueDetail>["data"]>;
  t: ReturnType<typeof useTranslations<"github.issueDetail">>;
}) {
  const scope = useComputerQueryScope();
  const queryClient = useQueryClient();
  const [body, setBody] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [tab, setTab] = React.useState<"write" | "preview">("write");
  const isClosed = issue.state.toLowerCase() === "closed";

  const submit = async (action: "comment" | "close" | "reopen") => {
    if ((action === "comment" && !body.trim()) || pending) return;
    setPending(true);
    try {
      await wsRequest(`github_issue_${action}`, {
        owner: issue.owner,
        repo: issue.repo,
        issue_number: issue.number,
        body: body.trim() || null,
      });
      setBody("");
      void queryClient.invalidateQueries({
        queryKey: queryKeys.computer.githubIssueTimeline(scope, {
          owner: issue.owner,
          repo: issue.repo,
          issueNumber: issue.number,
        }),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.computer.githubIssueDetail(scope, {
          owner: issue.owner,
          repo: issue.repo,
          issueNumber: issue.number,
        }),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-8 overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="flex items-center gap-2 text-xs font-semibold">
          <MessageSquare className="size-3.5" />
          {t("composer.title")}
        </span>
        <TabsSubtle
          activeLabel
          idPrefix="issue-discussion-composer"
          selectedIndex={tab === "write" ? 0 : 1}
          onSelect={(index) => setTab(index === 0 ? "write" : "preview")}
        >
          <TabsSubtleItem index={0} icon={PenLine} label={t("composer.write")} />
          <TabsSubtleItem index={1} icon={Eye} label={t("composer.preview")} />
        </TabsSubtle>
      </div>
      {tab === "write" ? (
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={t("toolbar.commentPlaceholder")}
          className="min-h-[120px] w-full resize-y rounded-none border-0 bg-transparent p-4 text-[13px] dark:bg-transparent focus-visible:ring-0"
        />
      ) : (
        <div className="min-h-[120px] p-4">
          {body.trim() ? (
            <MarkdownRenderer className="prose prose-sm max-w-none text-[13px] dark:prose-invert">
              {body}
            </MarkdownRenderer>
          ) : (
            <span className="text-xs italic text-muted-foreground">{t("composer.nothingToPreview")}</span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between border-t border-border px-4 py-2">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Github className="size-3" />
          {t("composer.markdownSupported")}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void submit(isClosed ? "reopen" : "close")}
            disabled={pending}
            className="h-8 text-xs"
          >
            {pending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : isClosed ? <RotateCw className="mr-1.5 size-3.5" /> : <XCircle className="mr-1.5 size-3.5" />}
            {isClosed ? t("toolbar.reopen") : t("toolbar.close")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void submit("comment")}
            disabled={!body.trim() || pending}
            className="h-8 text-xs"
          >
            {pending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Send className="mr-1.5 size-3.5" />}
            {t("toolbar.comment")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function IssueTimelineItem({
  item,
  locale,
  t,
  owner,
  repo,
}: {
  item: IssueTimelineModel;
  locale: typeof enUS;
  t: ReturnType<typeof useTranslations<"github.issueDetail">>;
  owner: string;
  repo: string;
}) {
  const { openPullRequestTab, openCommitTab } = useOpenGithubCenterTab();
  const login = item.author?.login ?? t("unknownUser");
  const time = item.createdAt
    ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale })
    : "";
  if (item.isComment) {
    return (
      <div className="flex gap-4">
        <Avatar className="z-10 size-8 shrink-0 border border-border/50 bg-background">
          <AvatarImage
            src={
              item.author?.avatar_url ??
              item.author?.avatarUrl ??
              `https://github.com/${login}.png?size=64`
            }
          />
          <AvatarFallback className="text-[10px]">
            {login.slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border/60 bg-background">
          <div className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            <span className="font-bold text-foreground">{login}</span>
            <span>{t("commented")}</span>
            <span className="ml-auto opacity-60">{time}</span>
          </div>
          <div className="p-4">
            <MarkdownRenderer className="prose prose-sm max-w-none text-[13px] leading-relaxed dark:prose-invert prose-p:my-0 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
              {item.body}
            </MarkdownRenderer>
          </div>
        </div>
      </div>
    );
  }
  const event = item.event ?? "";
  const label = item.label?.name ?? t("activity");
  const assignee = item.assignee?.login ?? t("unknownUser");
  const linkedPullRequest =
    event === "cross-referenced" && item.source?.issue?.pull_request
      ? item.source.issue
      : null;
  const activity = {
    closed: t("activityEvents.closed"),
    reopened: t("activityEvents.reopened"),
    assigned: t("activityEvents.assigned", { login: assignee }),
    unassigned: t("activityEvents.unassigned", { login: assignee }),
    labeled: t("activityEvents.labelAdded"),
    unlabeled: t("activityEvents.labelRemoved"),
    referenced: t("activityEvents.referenced"),
    "cross-referenced": linkedPullRequest
      ? t("activityEvents.linkedPullRequest")
      : t("activityEvents.crossReferenced"),
    milestoned: t("activityEvents.milestoned", {
      title: item.milestone?.title ?? "",
    }),
    demilestoned: t("activityEvents.demilestoned", {
      title: item.milestone?.title ?? "",
    }),
  } as const;
  const activityText =
    event in activity
      ? activity[event as keyof typeof activity]
      : event.replace(/_/g, " ") || t("activity");
  // Unified neutral timeline icon treatment (same shell for every event)
  const timelineIconClass = "size-3.5 text-muted-foreground";
  const eventIcon =
    event === "closed" ? (
      <XCircle className={timelineIconClass} />
    ) : event === "reopened" ? (
      <RotateCw className={timelineIconClass} />
    ) : event === "assigned" || event === "unassigned" ? (
      <User className={timelineIconClass} />
    ) : event === "labeled" || event === "unlabeled" ? (
      <Tag className={timelineIconClass} />
    ) : event === "referenced" || event === "cross-referenced" ? (
      <ExternalLink className={timelineIconClass} />
    ) : event === "milestoned" || event === "demilestoned" ? (
      <Milestone className={timelineIconClass} />
    ) : event === "committed" ? (
      <GitCommit className={timelineIconClass} />
    ) : (
      <CheckCircle2 className={timelineIconClass} />
    );

  const refSha = item.sha || item.commit_sha || item.commit_id;
  const canOpenCommit =
    Boolean(refSha) &&
    (event === "referenced" || event === "committed");

  return (
    <div className="flex flex-col gap-1.5 pl-2.5">
      <div className="flex items-center gap-3">
        <div className="z-10 flex size-4 shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted ring-4 ring-background">
          {eventIcon}
        </div>
        <Avatar className="size-4 shrink-0 border border-border/50">
          <AvatarImage
            src={
              item.author?.avatar_url ??
              item.author?.avatarUrl ??
              `https://github.com/${login}.png?size=32`
            }
          />
          <AvatarFallback className="text-[6px]">
            {login.slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <span className="font-semibold text-foreground/90">{login}</span>
        <span className="min-w-0 truncate text-muted-foreground">
          {activityText}
        </span>
        {(event === "labeled" || event === "unlabeled") && item.label ? (
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: item.label.color
                ? `#${item.label.color.replace(/^#/, "")}20`
                : undefined,
              color: item.label.color
                ? `#${item.label.color.replace(/^#/, "")}`
                : undefined,
              border: item.label.color
                ? `1px solid #${item.label.color.replace(/^#/, "")}40`
                : "1px solid var(--border)",
            }}
          >
            {item.label.name}
          </span>
        ) : null}
        {canOpenCommit && item.body ? (
          <button
            type="button"
            onClick={() =>
              openCommitTab({
                owner,
                repo,
                sha: refSha!,
                subject: item.body,
                authorName: login,
              })
            }
            className="min-w-0 max-w-[280px] truncate text-left font-medium text-foreground/70 transition-colors hover:text-foreground hover:underline underline-offset-2"
          >
            {item.body}
          </button>
        ) : null}
        {canOpenCommit && refSha ? (
          <button
            type="button"
            onClick={() =>
              openCommitTab({
                owner,
                repo,
                sha: refSha,
                subject: item.body || refSha.slice(0, 7),
                authorName: login,
              })
            }
            className="shrink-0 font-mono text-[10px] text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            {refSha.slice(0, 7)}
          </button>
        ) : null}
        <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground/60">
          {time}
        </span>
      </div>
      {linkedPullRequest ? (
        <button
          type="button"
          onClick={() =>
            openPullRequestTab({
              owner,
              repo,
              prNumber: linkedPullRequest.number ?? 0,
              branch: "",
              title: linkedPullRequest.title ?? "",
            })
          }
          className="ml-7 flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[13px] font-medium text-foreground underline decoration-border underline-offset-2 transition-colors hover:bg-muted/60 hover:text-primary"
        >
          <GitPullRequest className="size-3.5 shrink-0 text-purple-500" />
          <span className="truncate">
            {linkedPullRequest.title} #{linkedPullRequest.number}
          </span>
        </button>
      ) : null}
    </div>
  );
}

function IssueMetadataSidebar({
  issue,
  linkedPrs,
  linkedPrsLoading,
  collapsed,
  t,
}: {
  issue: NonNullable<ReturnType<typeof useGithubIssueDetail>["data"]>;
  linkedPrs: ReturnType<typeof useGithubIssueLinkedPrs>["data"];
  linkedPrsLoading: boolean;
  collapsed: boolean;
  t: ReturnType<typeof useTranslations<"github.issueDetail">>;
}) {
  return (
    <div
      className={cn(
        "hidden shrink-0 flex-col overflow-y-auto overflow-x-hidden transition-[max-width,opacity] duration-200 ease-out lg:flex",
        collapsed ? "max-w-0 opacity-0" : "max-w-[240px] opacity-100",
      )}
    >
      <div className="flex w-[240px] flex-col gap-5 px-2 pt-1 text-xs">
        <SidebarSection
          title={t("sidebar.assignees")}
          icon={<User className="size-3.5" />}
          action={
            <AssigneesEditor
              owner={issue.owner}
              repo={issue.repo}
              number={issue.number}
              resource="issue"
              assignees={issue.assignees.map((assignee) => ({
                login: assignee.login,
                avatar_url: assignee.avatar_url ?? undefined,
              }))}
            />
          }
        >
          <AssigneesList
            assignees={issue.assignees.map((assignee) => ({
              login: assignee.login,
              avatar_url: assignee.avatar_url ?? undefined,
            }))}
          />
        </SidebarSection>
        <SidebarSection
          title={t("sidebar.labels")}
          icon={<Tag className="size-3.5" />}
          action={
            <LabelsEditor
              owner={issue.owner}
              repo={issue.repo}
              number={issue.number}
              resource="issue"
              labels={issue.labels.map((label) => ({
                name: label.name,
                color: label.color ?? undefined,
                description: label.description ?? undefined,
              }))}
            />
          }
        >
          <LabelsList
            labels={issue.labels.map((label) => ({
              name: label.name,
              color: label.color ?? undefined,
              description: label.description ?? undefined,
            }))}
          />
        </SidebarSection>
        <LinkedPullRequests
          owner={issue.owner}
          repo={issue.repo}
          issueNumber={issue.number}
          linkedPrs={linkedPrs}
          loading={linkedPrsLoading}
          t={t}
        />
      </div>
    </div>
  );
}

function LinkedPullRequests({
  owner,
  repo,
  issueNumber,
  linkedPrs,
  loading,
  t,
}: {
  owner: string;
  repo: string;
  issueNumber: number;
  linkedPrs: ReturnType<typeof useGithubIssueLinkedPrs>["data"];
  loading: boolean;
  t: ReturnType<typeof useTranslations<"github.issueDetail">>;
}) {
  const { openPullRequestTab } = useOpenGithubCenterTab();
  return (
    <SidebarSection
      title={t("sidebar.development")}
      icon={<GitBranch className="size-3.5" />}
      action={
        <LinkedPullRequestsEditor
          owner={owner}
          repo={repo}
          issueNumber={issueNumber}
          linkedPrs={linkedPrs}
          t={t}
        />
      }
    >
      {loading ? (
        <Skeleton className="h-8 w-full" />
      ) : linkedPrs.length ? (
        <div className="flex flex-col gap-1.5">
          {linkedPrs.map((pr) => (
            <button
              key={pr.number}
              type="button"
              className="flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
              onClick={() => openPullRequestTab({
                owner,
                repo,
                prNumber: pr.number,
                branch: pr.headRefName ?? "",
                title: pr.title,
              })}
            >
              <GitPullRequest className="mt-0.5 size-3.5 shrink-0 text-purple-500" />
              <span className="min-w-0">
                <span className="line-clamp-2 block font-medium text-foreground/90">{pr.title}</span>
                <span className="text-[10px] text-muted-foreground">#{pr.number}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <span className="italic text-muted-foreground/60">{t("sidebar.none")}</span>
      )}
    </SidebarSection>
  );
}

function LinkedPullRequestsEditor({
  owner,
  repo,
  issueNumber,
  linkedPrs,
  t,
}: {
  owner: string;
  repo: string;
  issueNumber: number;
  linkedPrs: ReturnType<typeof useGithubIssueLinkedPrs>["data"];
  t: ReturnType<typeof useTranslations<"github.issueDetail">>;
}) {
  const scope = useComputerQueryScope();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<number | null>(null);
  const { data: prs = [], isLoading } = useRepoPrListQuery({
    owner,
    repo,
    state: "all",
    limit: 100,
    enabled: open,
  });
  const selected = React.useMemo(
    () => new Set(linkedPrs.map((pr) => pr.number)),
    [linkedPrs],
  );

  const toggle = async (prNumber: number) => {
    if (pending) return;
    setPending(prNumber);
    try {
      await wsRequest("github_pr_update_linked_issues", {
        owner,
        repo,
        pr_number: prNumber,
        add: selected.has(prNumber) ? [] : [issueNumber],
        remove: selected.has(prNumber) ? [issueNumber] : [],
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.computer.githubIssueLinkedPrs(scope, { owner, repo, issueNumber }),
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("sidebar.editDevelopment")}
          className="inline-flex size-5 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
        >
          {pending ? <Loader2 className="size-3 animate-spin" /> : <Settings2 className="size-3" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="left" className="w-[320px] p-0">
        <Command>
          <CommandInput placeholder={t("sidebar.filterPullRequests")} />
          <CommandList className="max-h-[280px]">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {t("sidebar.loading")}
              </div>
            ) : (
              <>
                <CommandEmpty>{t("sidebar.noPullRequests")}</CommandEmpty>
                <CommandGroup>
                  {prs.map((pr) => {
                    const isSelected = selected.has(pr.number);
                    return (
                      <CommandItem
                        key={pr.number}
                        value={`${pr.number} ${pr.title}`}
                        disabled={pending != null}
                        onSelect={() => void toggle(pr.number)}
                        className="h-auto items-start gap-2 py-2"
                      >
                        <GitPullRequest className="size-3.5 shrink-0 text-purple-500" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">{pr.title}</span>
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            {owner}/{repo}#{pr.number}
                          </span>
                        </span>
                        {pending === pr.number ? (
                          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                        ) : isSelected ? (
                          <Check className="size-3.5 shrink-0 text-foreground" />
                        ) : (
                          <Plus className="size-3.5 shrink-0 text-muted-foreground/40" />
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
