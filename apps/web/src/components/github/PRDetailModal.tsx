import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Tabs,
  TabsList,
  TabsTab,
  Avatar,
  AvatarImage,
  AvatarFallback,
  DialogClose,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@workspace/ui';
import { useGithubPRDetail, useGithubPRDetailSidebar, useGithubPRTimeline, useGithubPRFiles } from '@/hooks/use-github';
import { useWebSocketStore } from '@/hooks/use-websocket';
import {
  Github,
  ExternalLink,
  GitMerge,
  XCircle,
  Expand,
  Shrink,
  MessageSquare,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  GitPullRequest,
  GitCommit,
  Rocket,
  X,
  Check,
  Copy,
  Eye,
  Tag,
  GitBranch,
  User,
  Milestone,
  Edit2,
  FileCode,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { CommitList } from './CommitList';
import { PRFilesTab } from './PRFilesTab';
import { PRActionBar, type PRMergeStrategy } from './pr-detail-modal-actions';
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
} from './pr-detail-modal-parts';
import { PRMetadataSidebar } from './pr-detail-modal-sidebar';

interface PRDetailModalProps {
  owner: string;
  repo: string;
  branch: string;
  prNumber: number | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged?: () => void;
  onClosed?: () => void;
}

export function PRDetailModal({ owner, repo, branch, prNumber, isOpen, onOpenChange, onMerged, onClosed }: PRDetailModalProps) {
  const { data: pr, loading, fetch } = useGithubPRDetail(prNumber || 0, owner, repo);
  const { data: sidebarData, loading: sidebarLoading } = useGithubPRDetailSidebar(prNumber || 0, owner, repo);
  const [activeMainTab, setActiveMainTab] = React.useState<'description' | 'discussion' | 'commits' | 'files'>('description');
  const [hasVisitedDiscussion, setHasVisitedDiscussion] = React.useState(false);
  const [hasVisitedCommits, setHasVisitedCommits] = React.useState(false);
  const [hasVisitedFiles, setHasVisitedFiles] = React.useState(false);
  const { items: timelineItems, isLoading: timelineLoading, hasMore: timelineHasMore, loadMore: loadMoreTimeline } = useGithubPRTimeline(
    prNumber || 0, owner, repo, hasVisitedDiscussion && !!prNumber && isOpen
  );
  const { files: prFiles, loading: prFilesLoading } = useGithubPRFiles(
    prNumber || 0, owner, repo, hasVisitedFiles && !!prNumber && isOpen
  );
  const send = useWebSocketStore(s => s.send);
  const [actionLoading, setActionLoading] = React.useState<'merge' | 'close' | 'reopen' | 'comment' | null>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [mergeStrategy, setMergeStrategy] = React.useState<PRMergeStrategy>('merge');
  const [branchCopied, setBranchCopied] = React.useState(false);

  // Reset tab state when modal opens/closes or PR changes
  React.useEffect(() => {
    setActiveMainTab('description');
    setHasVisitedDiscussion(false);
    setHasVisitedCommits(false);
    setHasVisitedFiles(false);
  }, [prNumber]);

  React.useEffect(() => {
    if (!isOpen) {
      setActiveMainTab('description');
      setHasVisitedDiscussion(false);
      setHasVisitedCommits(false);
      setHasVisitedFiles(false);
    }
  }, [isOpen]);

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
      onOpenChange(false);
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
      onOpenChange(false);
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

  const handleOpenBetterHub = () => {
    if (!prNumber) return;
    window.open(`https://better-hub.com/${owner}/${repo}/pull/${prNumber}`, '_blank');
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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "transition-all duration-200 flex flex-col gap-0 overflow-hidden",
          isFullscreen ? "max-w-none sm:max-w-none w-screen sm:w-screen h-screen max-h-screen px-6 pb-6 pt-0 m-0 border-none rounded-none" : "max-w-6xl sm:max-w-6xl w-full h-[80vh] px-6 pb-6 pt-0"
        )}
      >
        <div className="flex flex-col flex-1 min-h-0 min-h-[600px]">
          <DialogHeader className="pr-24 flex flex-row items-center gap-3 space-y-0 pt-6 pb-4 shrink-0 relative">
            <Github className="size-4.5 text-muted-foreground/60" />
            <div className="flex items-center gap-2.5 min-w-0">
              <DialogTitle className="text-base font-bold whitespace-nowrap">Pull Request #{prNumber}</DialogTitle>
              <span className="text-muted-foreground/30 font-light select-none">|</span>
              <DialogDescription className="text-[11px] text-muted-foreground/60 truncate pt-0.5 font-medium" title={`${owner}/${repo} • ${branch}`}>
                {owner}/{repo} • {branch}
              </DialogDescription>
            </div>

            {/* Modal Controls in Header - these will scroll away */}
            <div className="absolute right-0 top-6 flex items-center gap-1">
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted/80 transition-colors opacity-70 hover:opacity-100"
                onClick={() => setIsSidebarCollapsed(v => !v)}
                title={isSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
              >
                {isSidebarCollapsed ? <PanelRightOpen className="size-3.5" /> : <PanelRightClose className="size-3.5" />}
              </button>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted/80 transition-colors opacity-70 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFullscreen(!isFullscreen);
                }}
              >
                {isFullscreen ? <Shrink className="size-3.5" /> : <Expand className="size-3.5" />}
              </button>
              <DialogClose asChild>
                <button className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted/80 transition-colors opacity-70 hover:opacity-100">
                  <X className="size-4" />
                </button>
              </DialogClose>
            </div>
          </DialogHeader>

          {loading ? (
            <div className="pt-2 px-0.5 overflow-y-auto flex-1">
              <PRDetailSkeleton />
            </div>
          ) : pr ? (
            <div className="flex gap-3 text-sm flex-1 min-h-0">
              {/* Left: main content */}
              <div className={cn("flex-1 min-w-0 flex flex-col pr-1", activeMainTab === 'files' ? "overflow-hidden" : "overflow-y-auto pb-16")}>
                {/* PR title + meta */}
                <div className="shrink-0 pb-3 pt-1 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">{pr.title}</h3>
                    {pr.isDraft && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground uppercase shrink-0">
                        Draft
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
                          bot
                        </span>
                      )}
                    </div>
                    <span>wants to merge</span>
                    <span className="bg-primary/10 text-primary px-1.5 py-px rounded font-mono truncate min-w-[30px] shadow-sm">
                      {pr.commits?.length || 0} commits
                    </span>
                    <span>into</span>
                    <span className="bg-secondary px-1.5 py-px text-secondary-foreground rounded font-mono truncate shadow-sm">
                      {pr.baseRefName || 'main'}
                    </span>
                    <span>from</span>
                    <span className="bg-sidebar-accent px-1.5 py-px text-sidebar-foreground rounded font-mono truncate max-w-[200px] shadow-sm">
                      {pr.headRefName || branch}
                    </span>
                    <button
                      className="text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(pr.headRefName || branch);
                        setBranchCopied(true);
                        setTimeout(() => setBranchCopied(false), 1500);
                      }}
                      title="Copy branch name"
                    >
                      {branchCopied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                    </button>
                  </div>
                </div>

                {/* Top-level tabs: Description / Discussion / Commits / Files */}
                <Tabs
                  value={activeMainTab}
                  onValueChange={(v) => {
                    const tab = v as typeof activeMainTab;
                    setActiveMainTab(tab);
                    if (tab === 'discussion') setHasVisitedDiscussion(true);
                    if (tab === 'commits') setHasVisitedCommits(true);
                    if (tab === 'files') { setHasVisitedFiles(true); setIsSidebarCollapsed(true); }
                  }}
                  className="shrink-0 pt-1"
                >
                  <TabsList className="w-fit gap-0">
                    <TabsTab value="description" className="text-[12px] px-3 h-8">Description</TabsTab>
                    <TabsTab value="discussion" className="text-[12px] px-3 h-8">
                      {`Discussion${sidebarData?.totalCommentsCount != null ? ` (${sidebarData.totalCommentsCount})` : ''}`}
                    </TabsTab>
                    <TabsTab value="commits" className="text-[12px] px-3 h-8">Commits ({pr.commits?.length || 0})</TabsTab>
                    <TabsTab value="files" className="text-[12px] px-3 h-8">Files changed ({pr.changedFiles ?? 0})</TabsTab>
                  </TabsList>
                </Tabs>

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
                        "flex items-start gap-4 p-4 border rounded-xl transition-all shadow-sm",
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
                            {pr.mergeable === 'MERGEABLE' ? 'No conflicts with base branch' : 'Conflict check in progress'}
                          </h5>
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {pr.mergeable === 'MERGEABLE' ? 'Merging can be performed automatically.' : 'Determining if this PR can be merged without manual intervention.'}
                            </p>
                            {!pr.isDraft && (
                              <div className="text-[11px] text-muted-foreground shrink-0">
                                Still in progress? {" "}
                                <button
                                  onClick={handleDraft}
                                  disabled={!!actionLoading}
                                  className="hover:text-foreground transition-colors underline decoration-dotted underline-offset-4"
                                >
                                  Convert to draft
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
                            <h5 className="text-sm font-bold text-foreground">This pull request is still a work in progress</h5>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Draft pull requests cannot be merged until they are marked as ready.</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs bg-background hover:bg-muted shadow-sm whitespace-nowrap"
                            onClick={handleReady}
                            disabled={!!actionLoading}
                          >
                            Ready for review
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

                            if (isMainComment) {
                              return (
                                <div key={i} className="flex flex-col">
                                  <div className="flex gap-4 items-start group">
                                    <div className="relative z-10">
                                      <Avatar className="size-8 shrink-0 border border-border/50 shadow-sm transition-transform group-hover:scale-105">
                                        <AvatarImage src={item.author?.avatar_url || item.author?.avatarUrl || `https://github.com/${item.author?.login?.replace('[bot]', '')}.png?size=64`} />
                                        <AvatarFallback className="text-[10px]">{item.author?.login?.substring(0, 2).toUpperCase()}</AvatarFallback>
                                      </Avatar>
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col border border-border/60 rounded-xl overflow-hidden bg-background shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] transition-all hover:shadow-[0_4px_15px_-4px_rgba(0,0,0,0.12)]">
                                      <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border/40 text-xs text-muted-foreground">
                                        <span className="font-bold text-foreground">{item.author?.login}</span>
                                        {isBot && (
                                          <span className="text-[9px] px-1 rounded-sm border border-border bg-muted/50 text-muted-foreground font-medium py-0 leading-none h-3.5 flex items-center shrink-0">
                                            bot
                                          </span>
                                        )}
                                        <span className="opacity-80">
                                          {item.type === 'review' ? (item.state === 'APPROVED' ? 'approved' : 'reviewed') : 'commented'}
                                        </span>
                                        {item.reviewCommentThreads && item.reviewCommentThreads.length > 0 && (
                                          <span className="flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-px rounded text-[10px] font-medium">
                                            <FileCode className="size-3" />
                                            {item.reviewCommentThreads.length} file{item.reviewCommentThreads.length > 1 ? 's' : ''}
                                          </span>
                                        )}
                                        <span className="opacity-60 ml-auto">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                                      </div>
                                      {item.body ? (
                                        <div className="p-4 bg-background">
                                          <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed prose-p:my-0 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-1">
                                            {item.body}
                                          </MarkdownRenderer>
                                        </div>
                                      ) : hasReviewThreads ? null : (
                                        <div className="p-4 bg-background">
                                          <span className="text-muted-foreground/60 italic text-[12px]">No comment body</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {item.reviewCommentThreads && item.reviewCommentThreads.length > 0 && (
                                    <div className="flex flex-col gap-2 mt-1">
                                      {item.reviewCommentThreads.map((thread: ReviewCommentThread, threadIdx: number) => (
                                        <ReviewCommentThreadView key={threadIdx} thread={thread} />
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
                                actionText = "closed this";
                                break;
                              case 'reopened':
                                icon = <RotateCw className="size-3.5 text-white" />;
                                colorClass = "bg-emerald-500";
                                actionText = "reopened this";
                                break;
                              case 'merged':
                                icon = <GitMerge className="size-3.5 text-white" />;
                                colorClass = "bg-purple-600";
                                const commitId = item.commit_id || item.merge_commit_sha || item.commit_sha;
                                const shortId = commitId?.substring(0, 7);
                                actionText = (
                                  <>
                                    merged commit <span className="font-mono bg-muted/50 px-1 rounded">{shortId || 'unknown'}</span> into <span className="font-semibold text-foreground/80">{pr.baseRefName || 'main'}</span>
                                  </>
                                );
                                break;
                              case 'committed':
                                icon = <GitCommit className="size-3.5 text-muted-foreground" />;
                                colorClass = "bg-muted border border-border/50";
                                actionText = "committed";
                                break;
                              case 'head_ref_force_pushed':
                                icon = <GitCommit className="size-3.5 text-white" />;
                                colorClass = "bg-amber-500";
                                actionText = "force-pushed this";
                                break;
                              case 'reviewed':
                                if (item.state === 'APPROVED') {
                                  icon = <CheckCircle2 className="size-3.5 text-white" />;
                                  colorClass = "bg-emerald-500";
                                  actionText = "approved this PR";
                                } else {
                                  icon = <MessageSquare className="size-3.5 text-white" />;
                                  colorClass = "bg-muted-foreground";
                                  actionText = "left a review";
                                }
                                break;
                              case 'referenced':
                              case 'cross-referenced':
                                icon = <ExternalLink className="size-3.5 text-muted-foreground" />;
                                colorClass = "bg-muted border border-border/50";
                                actionText = item.event === 'cross-referenced' ? "referenced this pull request" : "referenced this";
                                break;
                              case 'ready_for_review':
                                icon = <Eye className="size-3.5 text-white" />;
                                colorClass = "bg-blue-500";
                                actionText = "marked this pull request as ready for review";
                                break;
                              case 'converted_to_draft':
                              case 'convert_to_draft':
                                icon = <GitPullRequest className="size-3.5 text-muted-foreground" />;
                                colorClass = "bg-muted border border-border/50";
                                actionText = "marked this pull request as draft";
                                break;
                              case 'assigned':
                              case 'unassigned':
                                icon = <User className="size-3.5 text-white" />;
                                colorClass = item.event === 'assigned' ? "bg-blue-600" : "bg-muted-foreground";
                                const isSelf = item.assignee?.login === (item.actor?.login || item.author?.login);
                                actionText = item.event === 'assigned'
                                  ? (isSelf ? "self-assigned this" : `assigned ${item.assignee?.login}`)
                                  : (isSelf ? "removed their assignment" : `unassigned ${item.assignee?.login}`);
                                break;
                              case 'labeled':
                              case 'unlabeled':
                                icon = <Tag className="size-3.5 text-muted-foreground" />;
                                colorClass = "bg-muted";
                                actionText = `${item.event === 'labeled' ? 'added' : 'removed'} the ${item.label?.name || 'label'} label`;
                                break;
                              case 'review_requested':
                              case 'review_request_removed':
                                icon = <Eye className="size-3.5 text-muted-foreground" />;
                                colorClass = "bg-muted";
                                actionText = item.event === 'review_requested'
                                  ? `requested a review from ${item.requested_reviewer?.login || 'someone'}`
                                  : `removed review request for ${item.requested_reviewer?.login || 'someone'}`;
                                break;
                              case 'milestoned':
                              case 'demilestoned':
                                icon = <Milestone className="size-3.5 text-muted-foreground" />;
                                colorClass = "bg-muted";
                                actionText = item.event === 'milestoned'
                                  ? `added this to the ${item.milestone?.title} milestone`
                                  : `removed this from the ${item.milestone?.title} milestone`;
                                break;
                              case 'renamed':
                                icon = <Edit2 className="size-3.5 text-muted-foreground" />;
                                colorClass = "bg-muted";
                                actionText = `changed the title from "${item.rename?.from}" to "${item.rename?.to}"`;
                                break;
                              case 'deployed':
                              case 'deployment_status':
                                icon = <Rocket className="size-3.5 text-white" />;
                                colorClass = "bg-sidebar-accent shadow-sm";
                                const env = item.deployment?.environment || item.environment || 'Preview';
                                actionText = (
                                  <>
                                    deployed to <span className="font-bold">{env}</span>
                                    {item.deployment_status?.target_url && (
                                      <a
                                        href={item.deployment_status.target_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="ml-2 px-1.5 py-0.5 bg-muted hover:bg-muted-foreground/20 rounded border border-border/40 transition-colors inline-flex items-center gap-1"
                                      >
                                        View deployment <ExternalLink className="size-2.5" />
                                      </a>
                                    )}
                                  </>
                                );
                                break;
                              case 'head_ref_deleted':
                                icon = <GitBranch className="size-3.5 text-muted-foreground" />;
                                colorClass = "bg-muted";
                                actionText = "deleted the branch";
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
                                        bot
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
                                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
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
                                        {pr.statusCheckRollup.filter((c: StatusCheck) => c.state === 'SUCCESS' || c.conclusion === 'SUCCESS').length} of {pr.statusCheckRollup.length} checks passed
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
                                      <ReviewCommentThreadView key={threadIdx} thread={thread} />
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
                            className="flex items-center gap-2 px-4 py-2 rounded-md text-[12px] font-medium text-muted-foreground border border-border/60 bg-muted/30 hover:bg-muted/60 hover:text-foreground transition-colors"
                          >
                            Load more timeline events
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
                    <CommitList commits={prCommitsToListItems(pr.commits ?? [], owner, repo)} owner={owner} repo={repo} />
                  </div>
                )}

                {/* Files Changed tab */}
                {hasVisitedFiles && (
                  <div className={cn("pt-2 flex-1 min-h-0 overflow-hidden", activeMainTab !== 'files' && "hidden")} style={{ height: 'calc(100% - 120px)' }}>
                    <PRFilesTab
                      files={prFiles}
                      loading={prFilesLoading}
                      reviewComments={sidebarData?.review_comments ?? []}
                      owner={owner}
                      repo={repo}
                    />
                  </div>
                )}
              </div>

              <PRMetadataSidebar
                pr={pr}
                sidebarData={sidebarData}
                sidebarLoading={sidebarLoading}
                isSidebarCollapsed={isSidebarCollapsed}
              />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Detailed info not found...</div>
          )}
        </div>

        <PRActionBar
          loading={loading}
          pr={pr}
          actionLoading={actionLoading}
          mergeStrategy={mergeStrategy}
          onMergeStrategyChange={setMergeStrategy}
          onOpenGitHub={handleOpenGitHub}
          onOpenBetterHub={handleOpenBetterHub}
          onClose={() => handleClose()}
          onMerge={() => handleMerge()}
          onReopen={() => handleReopen()}
        />
      </DialogContent>
    </Dialog>
  );
}
