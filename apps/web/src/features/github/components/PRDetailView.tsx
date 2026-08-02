import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Button,
  TabsSubtle,
  TabsSubtleItem,
  Avatar,
  AvatarImage,
  AvatarFallback,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@workspace/ui';
import { useGithubPRDetail, useGithubPRDetailSidebar, useGithubPRTimeline, useGithubPRFiles } from '@/features/github/hooks/use-github';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import {
  Github,
  ExternalLink,
  GitMerge,
  XCircle,
  MessageSquare,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  GitPullRequest,
  GitCommit,
  Rocket,
  Check,
  Copy,
  Eye,
  Tag,
  GitBranch,
  User,
  Milestone,
  Edit2,
  FileCode,
  FileText,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { cn } from '@/shared/lib/utils';
import { MarkdownRenderer } from '@/shared/components/markdown/MarkdownRenderer';
import { useAgentFixContext } from '@/features/agent-fix/hooks/use-agent-fix-context';
import { AgentFixButton } from '@/features/agent-fix/components/AgentFixButton';
import type { AgentFixPromptSource } from '@/features/agent-fix/types';
import { buildPrReviewFixPrompt, buildPrReviewThreadFixPrompt } from '@/features/github/lib/agent-fix-prompts';
import { useOpenGithubCenterTab } from '@/features/github/hooks/use-open-github-center-tab';
import { CommitList, type CommitListItem } from './CommitList';
import { PRFilesTab } from './PRFilesTab';
import { usePrContextHeader } from './use-pr-context-header';
import { PRActionBar, type PRMergeStrategy } from '../lib/pr-detail-actions';
import {
  CommentBox,
  PRDetailSkeleton,
  ReviewCommentThreadView,
  prCommitsToListItems,
  type ConversationItem,
  type ReviewComment,
  type ReviewCommentThread,
  type StatusCheck,
  type TimelineItem,
} from '../lib/pr-detail-parts';
import { PRMetadataSidebar } from '../lib/pr-detail-sidebar';

interface PRDetailViewProps {
  owner: string;
  repo: string;
  branch: string;
  prNumber: number;
  active: boolean;
  onRequestClose: () => void;
  onMerged?: () => void;
  onClosed?: () => void;
}

type PRMainTab = 'description' | 'discussion' | 'commits' | 'files';
const PR_MAIN_TABS: PRMainTab[] = ['description', 'discussion', 'commits', 'files'];

// Persist PR tab selection across center tab switches (survives unmount/remount).
const prMainTabCache = new Map<number, PRMainTab>();

export function PRDetailView({ owner, repo, branch, prNumber, active, onRequestClose, onMerged, onClosed }: PRDetailViewProps) {
  const locale = useLocale();
  const t = useTranslations('github.prDetail');
  const relativeTimeLocale = locale.startsWith('zh') ? zhCN : enUS;
  const agentFixContext = useAgentFixContext();
  const { openCommitTab } = useOpenGithubCenterTab();
  const { data: pr, loading, fetch } = useGithubPRDetail(prNumber, owner, repo, active);
  const { data: sidebarData, loading: sidebarLoading } = useGithubPRDetailSidebar(prNumber, owner, repo, active);
  const [activeMainTab, setActiveMainTab] = React.useState<PRMainTab>(
    () => prMainTabCache.get(prNumber) ?? 'description',
  );
  const [hasVisitedDiscussion, setHasVisitedDiscussion] = React.useState(
    () => prMainTabCache.get(prNumber) === 'discussion',
  );
  const [hasVisitedCommits, setHasVisitedCommits] = React.useState(
    () => prMainTabCache.get(prNumber) === 'commits',
  );
  const [hasVisitedFiles, setHasVisitedFiles] = React.useState(
    () => prMainTabCache.get(prNumber) === 'files',
  );
  const { items: timelineItems, isLoading: timelineLoading, hasMore: timelineHasMore, loadMore: loadMoreTimeline } = useGithubPRTimeline(
    prNumber, owner, repo, hasVisitedDiscussion && active
  );
  const { files: prFiles, loading: prFilesLoading } = useGithubPRFiles(
    prNumber, owner, repo, hasVisitedFiles && active
  );
  const send = useWebSocketStore(s => s.send);
  const [actionLoading, setActionLoading] = React.useState<'merge' | 'close' | 'reopen' | 'comment' | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [mergeStrategy, setMergeStrategy] = React.useState<PRMergeStrategy>('merge');
  const [branchCopied, setBranchCopied] = React.useState(false);
  const [openReviewAgentFixSourceId, setOpenReviewAgentFixSourceId] = React.useState<string | null>(null);
  const {
    handleFilesCodeViewTopBoundaryWheel,
    handleMainScroll,
    handleMainWheelCapture,
    mainScrollRef,
    prContextRef,
    resetPrContext,
  } = usePrContextHeader(activeMainTab);
  const buildThreadAgentFixSource = React.useCallback(
    (thread: ReviewCommentThread): AgentFixPromptSource | undefined => {
      if (!pr || !prNumber) return undefined;
      const fileName = thread.path.split('/').filter(Boolean).pop() || thread.path;
      return {
        id: `pr-review:${owner}/${repo}#${prNumber}:${thread.path}:${thread.line ?? 'line'}`,
        family: 'pr_review',
        context: agentFixContext,
        label: t('agentFix.threadLabel', { fileName }),
        disabledReason: agentFixContext ? null : t('agentFix.openWorkspace'),
        getPrompt: () => ({
          prompt: buildPrReviewThreadFixPrompt(
            {
              owner,
              repo,
              prNumber,
              title: pr.title,
              headRefName: pr.headRefName || branch,
              baseRefName: pr.baseRefName,
              url: pr.url,
            },
            thread,
          ),
          terminalTabTitle: t('agentFix.terminalTabTitle', { prNumber }),
          terminalPaneLabel: t('agentFix.threadPaneLabel', { fileName }),
        }),
      };
    },
    [agentFixContext, branch, owner, pr, prNumber, repo, t],
  );

  const buildReviewAgentFixSource = React.useCallback(
    (item: ConversationItem): AgentFixPromptSource | undefined => {
      if (!pr || !prNumber || item.type !== 'review') return undefined;
      const threads = item.reviewCommentThreads ?? [];
      if (!item.body?.trim() && threads.length === 0) return undefined;
      const reviewId = (item as unknown as Record<string, unknown>).id;
      const author = item.author?.login || t('agentFix.reviewerFallback');
      return {
        id: `pr-review:${owner}/${repo}#${prNumber}:review:${String(reviewId ?? item.createdAt)}`,
        family: 'pr_review',
        context: agentFixContext,
        label: t('agentFix.reviewLabel', { author }),
        disabledReason: agentFixContext ? null : t('agentFix.openWorkspace'),
        getPrompt: () => ({
          prompt: buildPrReviewFixPrompt(
            {
              owner,
              repo,
              prNumber,
              title: pr.title,
              headRefName: pr.headRefName || branch,
              baseRefName: pr.baseRefName,
              url: pr.url,
            },
            {
              author,
              body: item.body,
              createdAt: item.createdAt,
              state: item.state,
              threads,
            },
          ),
          terminalTabTitle: t('agentFix.terminalTabTitle', { prNumber }),
          terminalPaneLabel: t('agentFix.reviewPaneLabel', { author }),
        }),
      };
    },
    [agentFixContext, branch, owner, pr, prNumber, repo, t],
  );

  const reviewComments = sidebarData?.review_comments;
  const reviewCommentThreadsByReviewId = React.useMemo(() => {
    if (!reviewComments || !Array.isArray(reviewComments)) return new Map<number, ReviewCommentThread[]>();

    const threadMap = new Map<number, ReviewComment[]>();
    for (const comment of reviewComments as ReviewComment[]) {
      const rootId = comment.in_reply_to_id || comment.id || 0;
      if (!threadMap.has(rootId)) threadMap.set(rootId, []);
      threadMap.get(rootId)!.push(comment);
    }

    const reviewGroups = new Map<number, ReviewCommentThread[]>();
    for (const [, comments] of threadMap) {
      comments.sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());
      const first = comments[0];
      const reviewId = first?.pull_request_review_id || 0;
      const thread: ReviewCommentThread = {
        path: first?.path || '',
        line: first?.line ?? first?.original_line ?? null,
        diffHunk: first?.diff_hunk || '',
        comments,
      };
      if (!reviewGroups.has(reviewId)) reviewGroups.set(reviewId, []);
      reviewGroups.get(reviewId)!.push(thread);
    }

    return reviewGroups;
  }, [reviewComments]);

  const conversation = React.useMemo(() => {
    if (!pr || timelineItems.length === 0) return [];

    // Build sha → {login, avatarUrl} map from pr.commits for committed events
    const commitAuthorMap = new Map<string, { login: string; avatarUrl: string }>();
    if (Array.isArray(pr.commits)) {
      for (const c of pr.commits) {
        const a = c.authors?.[0];
        if (c.oid && a?.login) commitAuthorMap.set(c.oid, { login: a.login, avatarUrl: a.avatarUrl ?? `https://github.com/${a.login}.png?size=32` });
      }
    }

    return timelineItems
      .map((item: TimelineItem) => {
        const rawAuthor = item.actor || item.author || item.user;
        // For 'committed' events, author has {name, email, date} but no login/avatar_url.
        const sha = (item as Record<string, unknown>).sha as string | undefined;
        const commitMeta = sha ? commitAuthorMap.get(sha) : undefined;
        const author = item.event === 'committed' && item.author && !item.author.login
          ? {
              ...item.author,
              login: commitMeta?.login ?? item.author.name,
              avatar_url: commitMeta?.avatarUrl ?? `https://github.com/${encodeURIComponent(item.author.name ?? 'ghost')}.png?size=32`,
            }
          : rawAuthor;
        const reviewId = (item as Record<string, unknown>).id as number | undefined;
        const threads = (item.event === 'reviewed' && reviewId) ? reviewCommentThreadsByReviewId.get(reviewId) : undefined;

        return {
          ...item,
          type: item.event === 'commented' ? 'comment' : (item.event === 'committed' ? 'commit' : (item.event === 'reviewed' ? 'review' : 'activity')),
          author,
          createdAt: item.created_at || item.author?.date || item.submitted_at || item.authoredDate || pr.createdAt,
          body: item.body || item.message || item.messageHeadline || '',
          reviewCommentThreads: threads,
        };
      })
      .sort((a: ConversationItem, b: ConversationItem) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [pr, timelineItems, reviewCommentThreadsByReviewId]);

  // Incremental rendering: yield main thread between chunks
  const RENDER_CHUNK = 3;
  const [displayCount, setDisplayCount] = React.useState(RENDER_CHUNK);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    React.startTransition(() => setDisplayCount(RENDER_CHUNK));
    if (conversation.length <= RENDER_CHUNK) return;

    let count = RENDER_CHUNK;
    const tick = () => {
      count = Math.min(count + RENDER_CHUNK, conversation.length);
      React.startTransition(() => setDisplayCount(count));
      if (count < conversation.length) {
        timerRef.current = setTimeout(tick, 32);
      } else {
        timerRef.current = null;
      }
    };
    timerRef.current = setTimeout(tick, 32);
    return () => { if (timerRef.current !== null) clearTimeout(timerRef.current); };
  }, [conversation.length]);

  const displayedConversation = conversation.slice(0, displayCount);

  const handleMerge = async (body = '') => {
    if (!prNumber) return;
    setActionLoading('merge');
    try {
      await send('github_pr_merge', {
        owner,
        repo,
        pr_number: prNumber,
        strategy: mergeStrategy,
        body: body.trim() || undefined
      });
      fetch?.();
      onMerged?.();
      onRequestClose();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleClose = async (body = '') => {
    if (!prNumber) return;
    setActionLoading('close');
    try {
      await send('github_pr_close', { owner, repo, pr_number: prNumber, comment: body.trim() || undefined });
      fetch?.();
      onClosed?.();
      onRequestClose();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReopen = async (_body = '') => {
    if (!prNumber) return;
    void _body;
    setActionLoading('reopen');
    try {
      await send('github_pr_reopen', { owner, repo, pr_number: prNumber });
      fetch?.();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReady = async () => {
    if (!prNumber) return;
    setActionLoading('reopen'); // Using reopen state for now
    try {
      await send('github_pr_ready', { owner, repo, pr_number: prNumber });
      fetch?.();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDraft = async () => {
    if (!prNumber) return;
    setActionLoading('reopen'); // Reuse or add custom
    try {
      await send('github_pr_draft', { owner, repo, pr_number: prNumber });
      fetch?.();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenGitHub = () => {
    if (!prNumber) return;
    window.open(`https://github.com/${owner}/${repo}/pull/${prNumber}`, '_blank');
  };

  const handlePostComment = async (body: string) => {
    if (!prNumber || !body.trim()) return;
    setActionLoading('comment');
    try {
      await send('github_pr_comment', { owner, repo, pr_number: prNumber, body });
      fetch();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleMainTabChange = React.useCallback((value: string) => {
    const tab = value as PRMainTab;
    setActiveMainTab(tab);
    prMainTabCache.set(prNumber, tab);
    resetPrContext();
    if (tab === 'discussion') setHasVisitedDiscussion(true);
    if (tab === 'commits') setHasVisitedCommits(true);
    if (tab === 'files') {
      setHasVisitedFiles(true);
      setIsSidebarCollapsed(true);
    }
  }, [prNumber, resetPrContext]);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-0 overflow-hidden px-6 pb-6">
        <div className="flex flex-col flex-1 min-h-0">
          <header className="pr-12 flex flex-row items-center gap-3 pt-6 pb-4 shrink-0 relative">
            <Github className="size-4.5 text-muted-foreground/60" />
            <div className="flex items-center gap-2.5 min-w-0">
              <h2 className="text-base font-bold whitespace-nowrap">{t('header.title', { prNumber })}</h2>
              <span className="text-muted-foreground/30 font-light select-none">|</span>
              <p className="text-[11px] text-muted-foreground/60 truncate pt-0.5 font-medium" title={`${owner}/${repo} • ${branch}`}>
                {owner}/{repo} • {branch}
              </p>
            </div>

            <div className="absolute right-0 top-6 flex items-center gap-1">
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted/80 transition-colors duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] opacity-70 hover:opacity-100"
                onClick={() => setIsSidebarCollapsed(v => !v)}
                title={isSidebarCollapsed ? t('header.showSidebar') : t('header.hideSidebar')}
              >
                {isSidebarCollapsed ? <PanelRightOpen className="size-3.5" /> : <PanelRightClose className="size-3.5" />}
              </button>
            </div>
          </header>

          {loading ? (
            <div className="pt-2 px-0.5 overflow-y-auto flex-1">
              <PRDetailSkeleton />
            </div>
          ) : pr ? (
            <div className="flex gap-3 text-sm flex-1 min-h-0">
              {/* Left: main content */}
              <div className="flex-1 min-w-0 overflow-hidden">
                <div
                  ref={mainScrollRef}
                  className="h-full overflow-y-auto pr-1 pb-16"
                  onScroll={handleMainScroll}
                  onWheelCapture={handleMainWheelCapture}
                >
                  <div
                    ref={prContextRef}
                    className="sticky top-0 z-20 transform-gpu bg-background pb-3 pt-1 transition-transform duration-200 ease-out will-change-transform"
                  >
                    <div className="flex min-w-0 flex-col gap-2.5">
                      {/* PR title + meta */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-foreground">{pr.title}</h3>
                          {pr.isDraft && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground uppercase shrink-0">
                              {t('states.draft')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
                          <div className="flex items-center gap-1.5 bg-muted/50 px-1.5 py-0.5 rounded-md border border-border/50 shadow-sm shrink-0">
                            <Avatar className="size-3.5 border border-border/50 shadow-inner">
                              <AvatarImage src={pr.author?.avatar_url || pr.author?.avatarUrl || `https://github.com/${pr.author?.login?.replace('[bot]', '')}.png?size=28`} />
                              <AvatarFallback className="text-[6px]">{pr.author?.login?.substring(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="font-semibold text-foreground/90">{pr.author?.login}</span>
                            {(pr.author?.is_bot || pr.author?.login === 'cursor' || pr.author?.login === 'vercel' || pr.author?.login?.endsWith('[bot]')) && (
                              <span className="text-[9px] px-1 rounded-sm border border-border bg-muted/50 text-muted-foreground font-medium py-0 leading-none h-3.5 flex items-center shrink-0">
                                {t('states.bot')}
                              </span>
                            )}
                          </div>
                          <span>{t('summary.wantsToMerge')}</span>
                          <span className="bg-primary/10 text-primary px-1.5 py-px rounded font-mono truncate min-w-[30px] shadow-sm">
                            {t('summary.commits', { count: pr.commits?.length || 0 })}
                          </span>
                          <span>{t('summary.into')}</span>
                          <span className="bg-secondary px-1.5 py-px text-secondary-foreground rounded font-mono truncate shadow-sm">
                            {pr.baseRefName || 'main'}
                          </span>
                          <span>{t('summary.from')}</span>
                          <span className="bg-sidebar-accent px-1.5 py-px text-sidebar-foreground rounded font-mono truncate max-w-[200px] shadow-sm">
                            {pr.headRefName || branch}
                          </span>
                          <button
                            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] shrink-0"
                            onClick={() => {
                              navigator.clipboard.writeText(pr.headRefName || branch);
                              setBranchCopied(true);
                              setTimeout(() => setBranchCopied(false), 1500);
                            }}
                            title={t('summary.copyBranchName')}
                          >
                            {branchCopied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 border-t border-border/40 pt-3">
                        <TabsSubtle
                          activeLabel
                          idPrefix={`pr-${pr.number}`}
                          selectedIndex={PR_MAIN_TABS.indexOf(activeMainTab)}
                          onSelect={(index) => {
                            const tab = PR_MAIN_TABS[index];
                            if (tab) handleMainTabChange(tab);
                          }}
                        >
                          <TabsSubtleItem index={0} icon={FileText} label={t('tabs.description')} />
                          <TabsSubtleItem
                            index={1}
                            icon={MessageSquare}
                            label={`${t('tabs.discussion')}${sidebarData?.totalCommentsCount != null ? ` (${sidebarData.totalCommentsCount})` : ''}`}
                          />
                          <TabsSubtleItem
                            index={2}
                            icon={GitCommit}
                            label={t('tabs.commits', { count: pr.commits?.length || 0 })}
                          />
                          <TabsSubtleItem
                            index={3}
                            icon={FileCode}
                            label={t('tabs.filesChanged', { count: pr.changedFiles ?? 0 })}
                          />
                        </TabsSubtle>
                      </div>
                    </div>
                  </div>

                {/* Description tab */}
                <div className={cn("pt-4 flex flex-col gap-4", activeMainTab !== 'description' && "hidden")}>
                  {pr.body && (
                    <div className="p-4 rounded-md border border-border/50 text-[13px] shrink-0">
                      <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed prose-p:my-0 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-1">
                        {pr.body}
                      </MarkdownRenderer>
                    </div>
                  )}

                  {/* PR Status Section */}
                  <div className="flex flex-col gap-3 py-2">
                    {pr.state === 'OPEN' && (
                      <div className={cn(
                        "flex items-start gap-4 p-4 border rounded-xl transition-all duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] shadow-sm",
                        pr.mergeable === 'MERGEABLE' ? "bg-emerald-500/5 border-emerald-500/20" : "bg-muted/30 border-border"
                      )}>
                        <div className={cn(
                          "mt-0.5 rounded-full p-1.5 shadow-sm",
                          pr.mergeable === 'MERGEABLE' ? "bg-emerald-500 text-white" : "bg-muted-foreground/20 text-muted-foreground"
                        )}>
                          {pr.mergeable === 'MERGEABLE' ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
                        </div>
                        <div className="flex-1 select-none">
                          <h5 className="text-sm font-bold">
                            {pr.mergeable === 'MERGEABLE' ? t('status.mergeableTitle') : t('status.checkingTitle')}
                          </h5>
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {pr.mergeable === 'MERGEABLE' ? t('status.mergeableDescription') : t('status.checkingDescription')}
                            </p>
                            {!pr.isDraft && (
                              <div className="text-[11px] text-muted-foreground shrink-0">
                                {t('status.stillInProgress')}{' '}
                                <button
                                  onClick={handleDraft}
                                  disabled={!!actionLoading}
                                  className="hover:text-foreground transition-colors duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] underline decoration-dotted underline-offset-4"
                                >
                                  {t('status.convertToDraft')}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {pr.isDraft && (
                      <div className="flex items-start gap-4 p-4 border rounded-xl bg-muted/40 border-border shadow-sm">
                        <div className="mt-0.5 rounded-full p-1.5 bg-sidebar-accent text-sidebar-foreground shadow-sm">
                          <GitPullRequest className="size-4" />
                        </div>
                        <div className="flex-1 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <h5 className="text-sm font-bold text-foreground">{t('draftBanner.title')}</h5>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{t('draftBanner.description')}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs bg-background hover:bg-muted shadow-sm whitespace-nowrap"
                            onClick={handleReady}
                            disabled={!!actionLoading}
                          >
                            {t('draftBanner.readyForReview')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Discussion tab */}
                {hasVisitedDiscussion && (
                  <div className={cn("pt-4 flex flex-col gap-4", activeMainTab !== 'discussion' && "hidden")}>
                  {(conversation.length > 0 || timelineLoading) && (
                    <div className="flex flex-col gap-0 relative">
                      {timelineLoading && conversation.length === 0 && (
                        <div className="flex flex-col gap-6 pt-2">
                          {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="flex gap-4 items-start">
                              <Skeleton className="size-8 rounded-full shrink-0" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-3 w-1/3 rounded" />
                                <Skeleton className="h-16 w-full rounded-lg" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Vertical Timeline Line */}
                      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border/60 z-0" />

                      <TooltipProvider delayDuration={300}>
                        <div className="flex flex-col gap-6 relative z-10">
                          {displayedConversation.map((item: ConversationItem, i: number) => {
                            const hasReviewThreads = item.reviewCommentThreads && item.reviewCommentThreads.length > 0;
                            const isMainComment = item.type === 'comment' || (item.type === 'review' && (item.body || hasReviewThreads));
                            const isBot = item.author?.is_bot || item.author?.login === 'cursor' || item.author?.login === 'vercel' || item.author?.login?.endsWith('[bot]');
                            const reviewAgentFixSource = item.type === 'review'
                              ? buildReviewAgentFixSource(item)
                              : undefined;
                            const reviewAgentFixSettingsOpen =
                              !!reviewAgentFixSource && openReviewAgentFixSourceId === reviewAgentFixSource.id;

                            if (isMainComment) {
                              return (
                                <div key={i} className="flex flex-col">
                                  <div className="flex gap-4 items-start group/review">
                                    <div className="relative z-10">
                                      <Avatar className="size-8 shrink-0 border border-border/50 shadow-sm transition-transform duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/review:scale-105">
                                        <AvatarImage src={item.author?.avatar_url || item.author?.avatarUrl || `https://github.com/${item.author?.login?.replace('[bot]', '')}.png?size=64`} />
                                        <AvatarFallback className="text-[10px]">{item.author?.login?.substring(0, 2).toUpperCase()}</AvatarFallback>
                                      </Avatar>
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col border border-border/60 rounded-xl overflow-hidden bg-background shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] transition-shadow duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-[0_4px_15px_-4px_rgba(0,0,0,0.12)]">
                                      <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border/40 text-xs text-muted-foreground">
                                        <span className="font-bold text-foreground">{item.author?.login}</span>
                                        {isBot && (
                                          <span className="text-[9px] px-1 rounded-sm border border-border bg-muted/50 text-muted-foreground font-medium py-0 leading-none h-3.5 flex items-center shrink-0">
                                            {t('states.bot')}
                                          </span>
                                        )}
                                        <span className="opacity-80">
                                          {item.type === 'review'
                                            ? (item.state === 'APPROVED' ? t('conversation.approved') : t('conversation.reviewed'))
                                            : t('conversation.commented')}
                                        </span>
                                        {item.reviewCommentThreads && item.reviewCommentThreads.length > 0 && (
                                          <span className="flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-px rounded text-[10px] font-medium">
                                            <FileCode className="size-3" />
                                            {t('conversation.filesCount', {
                                              count: item.reviewCommentThreads.length,
                                              suffix: item.reviewCommentThreads.length > 1 ? 's' : '',
                                            })}
                                          </span>
                                        )}
                                        <span
                                          className={cn(
                                            "relative ml-auto flex h-6 items-center justify-end",
                                            reviewAgentFixSource ? "w-[132px]" : "w-auto",
                                          )}
                                        >
                                          <span
                                            className={cn(
                                              "opacity-60",
                                              reviewAgentFixSource &&
                                                "group-hover/review:opacity-0",
                                              reviewAgentFixSettingsOpen && "opacity-0",
                                            )}
                                          >
                                            {formatDistanceToNow(new Date(item.createdAt), {
                                              addSuffix: true,
                                              locale: relativeTimeLocale,
                                            })}
                                          </span>
                                          {reviewAgentFixSource ? (
                                            <span
                                              className={cn(
                                                "invisible pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 opacity-0",
                                                "group-hover/review:visible group-hover/review:pointer-events-auto group-hover/review:opacity-100",
                                                reviewAgentFixSettingsOpen && "visible pointer-events-auto opacity-100",
                                              )}
                                            >
                                              <AgentFixButton
                                                source={reviewAgentFixSource}
                                                mode="label"
                                                appearance="subtle"
                                                onSettingsOpenChange={(open) => {
                                                  setOpenReviewAgentFixSourceId(open ? reviewAgentFixSource.id : null);
                                                }}
                                              />
                                            </span>
                                          ) : null}
                                        </span>
                                      </div>
                                      {item.body ? (
                                        <div className="p-4 bg-background">
                                          <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed prose-p:my-0 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-1">
                                            {item.body}
                                          </MarkdownRenderer>
                                        </div>
                                      ) : hasReviewThreads ? null : (
                                        <div className="p-4 bg-background">
                                          <span className="text-muted-foreground/60 italic text-[12px]">{t('conversation.noCommentBody')}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {item.reviewCommentThreads && item.reviewCommentThreads.length > 0 && (
                                    <div className="flex flex-col gap-2 mt-1">
                                      {item.reviewCommentThreads.map((thread: ReviewCommentThread, threadIdx: number) => (
                                        <ReviewCommentThreadView
                                          key={threadIdx}
                                          thread={thread}
                                          agentFixSource={buildThreadAgentFixSource(thread)}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            }

                            // Activity Row (Commit, Merge, Close, etc)
                            let icon = <GitCommit className="size-3.5 text-muted-foreground" />;
                            let colorClass = "bg-muted";
                            let actionText: React.ReactNode = "";

                            switch (item.event) {
                              case 'closed':
                                icon = <XCircle className="size-3.5 text-white" />;
                                colorClass = "bg-red-500";
                                actionText = t('activity.closed');
                                break;
                              case 'reopened':
                                icon = <RotateCw className="size-3.5 text-white" />;
                                colorClass = "bg-emerald-500";
                                actionText = t('activity.reopened');
                                break;
                              case 'merged':
                                icon = <GitMerge className="size-3.5 text-white" />;
                                colorClass = "bg-purple-600";
                                const commitId = item.commit_id || item.merge_commit_sha || item.commit_sha;
                                const shortId = commitId?.substring(0, 7);
                                actionText = (
                                  <>
                                    {t('activity.mergedCommit')}{' '}
                                    <span className="font-mono bg-muted/50 px-1 rounded">{shortId || t('activity.unknownCommit')}</span>{' '}
                                    {t('activity.intoBase')}{' '}
                                    <span className="font-semibold text-foreground/80">{pr.baseRefName || 'main'}</span>
                                  </>
                                );
                                break;
                              case 'committed':
                                icon = <GitCommit className="size-3.5 text-muted-foreground" />;
                                colorClass = "bg-muted border border-border/50";
                                actionText = t('activity.committed');
                                break;
                              case 'head_ref_force_pushed':
                                icon = <GitCommit className="size-3.5 text-white" />;
                                colorClass = "bg-amber-500";
                                actionText = t('activity.forcePushed');
                                break;
                              case 'reviewed':
                                if (item.state === 'APPROVED') {
                                  icon = <CheckCircle2 className="size-3.5 text-white" />;
                                  colorClass = "bg-emerald-500";
                                  actionText = t('activity.approvedPr');
                                } else {
                                  icon = <MessageSquare className="size-3.5 text-white" />;
                                  colorClass = "bg-muted-foreground";
                                  actionText = t('activity.leftReview');
                                }
                                break;
                              case 'referenced':
                              case 'cross-referenced':
                                icon = <ExternalLink className="size-3.5 text-muted-foreground" />;
                                colorClass = "bg-muted border border-border/50";
                                actionText = item.event === 'cross-referenced' ? t('activity.crossReferenced') : t('activity.referenced');
                                break;
                              case 'ready_for_review':
                                icon = <Eye className="size-3.5 text-white" />;
                                colorClass = "bg-blue-500";
                                actionText = t('activity.readyForReview');
                                break;
                              case 'converted_to_draft':
                              case 'convert_to_draft':
                                icon = <GitPullRequest className="size-3.5 text-muted-foreground" />;
                                colorClass = "bg-muted border border-border/50";
                                actionText = t('activity.convertedToDraft');
                                break;
                              case 'assigned':
                              case 'unassigned':
                                icon = <User className="size-3.5 text-white" />;
                                colorClass = item.event === 'assigned' ? "bg-blue-600" : "bg-muted-foreground";
                                const isSelf = item.assignee?.login === (item.actor?.login || item.author?.login);
                                actionText = item.event === 'assigned'
                                  ? (isSelf ? t('activity.selfAssigned') : t('activity.assigned', { login: item.assignee?.login || '' }))
                                  : (isSelf ? t('activity.removedOwnAssignment') : t('activity.unassigned', { login: item.assignee?.login || '' }));
                                break;
                              case 'labeled':
                              case 'unlabeled':
                                icon = <Tag className="size-3.5 text-muted-foreground" />;
                                colorClass = "bg-muted";
                                actionText = item.event === 'labeled'
                                  ? t('activity.addedLabel', { label: item.label?.name || t('activity.labelFallback') })
                                  : t('activity.removedLabel', { label: item.label?.name || t('activity.labelFallback') });
                                break;
                              case 'review_requested':
                              case 'review_request_removed':
                                icon = <Eye className="size-3.5 text-muted-foreground" />;
                                colorClass = "bg-muted";
                                actionText = item.event === 'review_requested'
                                  ? t('activity.requestedReview', { login: item.requested_reviewer?.login || t('activity.someone') })
                                  : t('activity.removedReviewRequest', { login: item.requested_reviewer?.login || t('activity.someone') });
                                break;
                              case 'milestoned':
                              case 'demilestoned':
                                icon = <Milestone className="size-3.5 text-muted-foreground" />;
                                colorClass = "bg-muted";
                                actionText = item.event === 'milestoned'
                                  ? t('activity.addedToMilestone', { title: item.milestone?.title || '' })
                                  : t('activity.removedFromMilestone', { title: item.milestone?.title || '' });
                                break;
                              case 'renamed':
                                icon = <Edit2 className="size-3.5 text-muted-foreground" />;
                                colorClass = "bg-muted";
                                actionText = t('activity.renamed', {
                                  from: item.rename?.from || '',
                                  to: item.rename?.to || '',
                                });
                                break;
                              case 'deployed':
                              case 'deployment_status':
                                icon = <Rocket className="size-3.5 text-white" />;
                                colorClass = "bg-sidebar-accent shadow-sm";
                                const env = item.deployment?.environment || item.environment || t('activity.preview');
                                actionText = (
                                  <>
                                    {t('activity.deployedTo')} <span className="font-bold">{env}</span>
                                    {item.deployment_status?.target_url && (
                                      <a
                                        href={item.deployment_status.target_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="ml-2 px-1.5 py-0.5 bg-muted hover:bg-muted-foreground/20 rounded border border-border/40 transition-colors duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] inline-flex items-center gap-1"
                                      >
                                        {t('activity.viewDeployment')} <ExternalLink className="size-2.5" />
                                      </a>
                                    )}
                                  </>
                                );
                                break;
                              case 'head_ref_deleted':
                                icon = <GitBranch className="size-3.5 text-muted-foreground" />;
                                colorClass = "bg-muted";
                                actionText = t('activity.deletedBranch');
                                break;
                              default:
                                actionText = (item.event || '').replace(/_/g, ' ');
                                break;
                            }

                            return (
                              <div key={i} className="flex flex-col gap-1.5 pl-2.5 relative">
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "size-4 rounded-full flex items-center justify-center ring-4 ring-background z-10 shrink-0",
                                    colorClass
                                  )}>
                                    {icon}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs truncate flex-1">
                                    <Avatar className="size-4 shrink-0 border border-border/50">
                                      <AvatarImage src={item.author?.avatar_url || item.author?.avatarUrl || `https://github.com/${item.author?.login?.replace('[bot]', '')}.png?size=32`} />
                                      <AvatarFallback className="text-[6px]">{item.author?.login?.substring(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <span className="font-semibold text-foreground/90">{item.author?.login}</span>
                                    {isBot && (
                                      <span className="text-[9px] px-1 rounded-sm border border-border bg-muted/50 text-muted-foreground font-medium py-0 leading-none h-3.5 flex items-center shrink-0">
                                        {t('states.bot')}
                                      </span>
                                    )}
                                    <span className="text-muted-foreground">{actionText}</span>
                                    {(item.event === 'committed' || item.event === 'referenced') && item.body && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="text-foreground/70 font-medium truncate max-w-[280px] cursor-help">
                                            {item.body}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-md text-xs break-all">
                                          {item.body}
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                    <span className="text-muted-foreground opacity-60 ml-auto whitespace-nowrap">
                                      {formatDistanceToNow(new Date(item.createdAt), {
                                        addSuffix: true,
                                        locale: relativeTimeLocale,
                                      })}
                                    </span>
                                  </div>
                                </div>

                                {/* Subtext for specific events */}
                                {item.event === 'merged' && pr.statusCheckRollup?.length > 0 && (
                                  <div className="pl-7 pb-1">
                                    <div className="text-[10px] text-muted-foreground/80 flex items-center gap-1.5 bg-muted/30 w-fit px-2 py-0.5 rounded-full border border-border/40">
                                      {pr.statusCheckRollup.every((c: StatusCheck) => c.state === 'SUCCESS' || c.conclusion === 'SUCCESS') ? (
                                        <CheckCircle2 className="size-3 text-emerald-500" />
                                      ) : (
                                        <XCircle className="size-3 text-red-500" />
                                      )}
                                      <span>
                                        {t('activity.checksPassed', {
                                          passed: pr.statusCheckRollup.filter((c: StatusCheck) => c.state === 'SUCCESS' || c.conclusion === 'SUCCESS').length,
                                          total: pr.statusCheckRollup.length,
                                        })}
                                      </span>
                                    </div>
                                  </div>
                                )}

                                {item.event === 'labeled' && item.label && (
                                  <div className="pl-7 pb-1">
                                    <span
                                      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                      style={{
                                        backgroundColor: `#${item.label.color}20`,
                                        color: `#${item.label.color}`,
                                        border: `1px solid #${item.label.color}40`
                                      }}
                                    >
                                      {item.label.name}
                                    </span>
                                  </div>
                                )}

                                {item.reviewCommentThreads && item.reviewCommentThreads.length > 0 && (
                                  <div className="flex flex-col gap-2 mt-1">
                                    {item.reviewCommentThreads.map((thread: ReviewCommentThread, threadIdx: number) => (
                                      <ReviewCommentThreadView
                                        key={threadIdx}
                                        thread={thread}
                                        agentFixSource={buildThreadAgentFixSource(thread)}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </TooltipProvider>

                      {/* Timeline: loading skeleton */}
                      {timelineLoading && (
                        <div className="flex flex-col gap-4 mt-6 relative z-10">
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="flex items-center gap-3 pl-2.5">
                              <Skeleton className="size-4 rounded-full shrink-0" />
                              <Skeleton className="h-3 rounded" style={{ width: `${48 + (i % 3) * 16}%` }} />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Timeline: Load More */}
                      {timelineHasMore && !timelineLoading && (
                        <div className="mt-6 flex justify-center relative z-10">
                          <button
                            onClick={loadMoreTimeline}
                            className="flex items-center gap-2 px-4 py-2 rounded-md text-[12px] font-medium text-muted-foreground border border-border/60 bg-muted/30 hover:bg-muted/60 hover:text-foreground transition-colors duration-180 ease-[cubic-bezier(0.22,1,0.36,1)]"
                          >
                            {t('activity.loadMore')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Add a comment section */}
                  <CommentBox
                    prState={pr.state}
                    isDraft={pr.isDraft}
                    mergeable={pr.mergeable}
                    actionLoading={actionLoading}
                    onComment={handlePostComment}
                    onClose={handleClose}
                    onMerge={handleMerge}
                    onReopen={handleReopen}
                  />
                  </div>
                )}

                {/* Commits tab */}
                {hasVisitedCommits && (
                  <div className={cn("pt-2", activeMainTab !== 'commits' && "hidden")}>
                    <CommitList
                      commits={prCommitsToListItems(pr.commits ?? [], owner, repo)}
                      owner={owner}
                      repo={repo}
                      onCommitClick={(commit) => {
                        openCommitTab({
                          owner,
                          repo,
                          sha: commit.hash,
                          subject: commit.subject,
                          authorName: commit.authorName,
                        });
                      }}
                    />
                  </div>
                )}

                {/* Files Changed tab */}
                {hasVisitedFiles && (
                  <div className={cn("min-h-[520px] overflow-hidden pt-2", activeMainTab !== 'files' && "hidden")} style={{ height: '100%' }}>
                    <PRFilesTab
                      files={prFiles}
                      loading={prFilesLoading}
                      reviewComments={sidebarData?.review_comments ?? []}
                      owner={owner}
                      repo={repo}
                      prNumber={prNumber}
                      title={pr.title}
                      headRefName={pr.headRefName || branch}
                      baseRefName={pr.baseRefName}
                      url={pr.url}
                      agentFixContext={agentFixContext}
                      onCodeViewTopBoundaryWheel={handleFilesCodeViewTopBoundaryWheel}
                    />
                  </div>
                )}
                </div>
              </div>

              <PRMetadataSidebar
                pr={pr}
                owner={owner}
                repo={repo}
                sidebarData={sidebarData}
                sidebarLoading={sidebarLoading}
                isSidebarCollapsed={isSidebarCollapsed}
              />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">{t('notFound')}</div>
          )}
        </div>

        <PRActionBar
          loading={loading}
          pr={pr}
          actionLoading={actionLoading}
          mergeStrategy={mergeStrategy}
          onMergeStrategyChange={setMergeStrategy}
          onOpenGitHub={handleOpenGitHub}
          onClose={() => handleClose()}
          onMerge={() => handleMerge()}
          onReopen={() => handleReopen()}
        />
    </div>
  );
}
