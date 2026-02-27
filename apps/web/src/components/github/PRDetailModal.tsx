import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsPanel,
  Textarea,
  Avatar,
  AvatarImage,
  AvatarFallback,
  DialogClose,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@workspace/ui';
import { useGithubPRDetail } from '@/hooks/use-github';
import { useWebSocketStore } from '@/hooks/use-websocket';
import { Github, ExternalLink, GitMerge, XCircle, Expand, Shrink, Loader2, MessageSquare, CheckCircle2, RotateCcw, AlertCircle, GitPullRequest, GitCommit, Rocket, X, ChevronRight, ChevronDown, Check, Eye, Tag, GitBranch, User, Milestone, Edit2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';

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

function CheckGroupItem({ groupName, checks }: { groupName: string, checks: any[] }) {
  const hasFailure = checks.some(c => c.state === 'FAILURE' || c.state === 'ERROR' || c.conclusion === 'FAILURE' || c.conclusion === 'ACTION_REQUIRED');
  const hasInProgress = checks.some(c => c.state === 'PENDING' || c.state === 'IN_PROGRESS' || c.state === 'EXPECTED' || (c.status && c.status !== 'COMPLETED'));

  const [isOpen, setIsOpen] = React.useState(hasFailure || hasInProgress);

  const GroupIcon = hasFailure ? XCircle : hasInProgress ? Loader2 : CheckCircle2;
  const groupIconClass = hasFailure ? "text-red-500" : hasInProgress ? "text-amber-500 animate-spin" : "text-emerald-500";

  return (
    <div className="flex flex-col border-b border-border/40 last:border-0 overflow-hidden bg-background">
      <button
        className="flex items-center gap-2.5 px-4 py-3 hover:bg-muted/40 transition-colors w-full text-left"
        onClick={(e) => { e.preventDefault(); setIsOpen(!isOpen); }}
      >
        <div className={cn("shrink-0 flex items-center justify-center size-3 text-muted-foreground/50 transition-transform duration-200", isOpen ? "rotate-90" : "rotate-0")}>
          <ChevronRight className="size-3.5" />
        </div>
        <div className="flex-1 min-w-0 font-medium text-[13px] text-foreground truncate">
          {groupName}
        </div>
        <div className="shrink-0 flex items-center">
          <GroupIcon className={cn("size-3.5", groupIconClass)} />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="bg-muted/20 shadow-inner overflow-hidden"
          >
            <div className="flex flex-col pb-1.5 pt-0.5">
              {checks.map((check, idx) => {
                const isFailure = check.state === 'FAILURE' || check.state === 'ERROR' || check.conclusion === 'FAILURE';
                const isSkipped = check.conclusion === 'SKIPPED' || check.conclusion === 'NEUTRAL';
                const isSuccess = check.state === 'SUCCESS' || check.conclusion === 'SUCCESS';

                return (
                  <div key={idx} className="flex items-center justify-between text-[13px] px-4 py-2 pl-10 hover:bg-muted/40 group transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0 flex items-center justify-center">
                        {isFailure ? <XCircle className="size-3.5 text-red-500" /> :
                          isSuccess ? <CheckCircle2 className="size-3.5 text-emerald-500" /> :
                            isSkipped ? <div className="size-3 rounded-full border-[1.5px] border-muted-foreground/40" /> :
                              <Loader2 className="size-3.5 text-amber-500 animate-spin" />}
                      </div>
                      <span className={cn("font-medium truncate", isFailure ? "text-red-500" : "text-foreground/80")}>
                        {check.name || check.context}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PRDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse p-2">
      {/* Header Skeleton */}
      <div className="space-y-4 pb-6 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-2/3 rounded-md" />
          <Skeleton className="h-4 w-12 rounded-sm" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-3 w-40 rounded-md" />
          <Skeleton className="h-4 w-20 rounded-md" />
          <Skeleton className="h-4 w-24 rounded-md" />
        </div>
      </div>

      {/* Status Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-28 w-full rounded-xl border border-border/50" />
        <Skeleton className="h-28 w-full rounded-xl border border-border/50" />
      </div>

      {/* Conversation Skeleton */}
      <div className="space-y-8 mt-4 relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border/30 ml-[2px]" />
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-4 items-start relative z-10">
            <Skeleton className="size-8 rounded-full shrink-0 border border-background shadow-sm" />
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-24 rounded-md" />
                <Skeleton className="h-3 w-32 rounded-md" />
              </div>
              <Skeleton className="h-24 w-full rounded-lg border border-border/50" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PRDetailModal({ owner, repo, branch, prNumber, isOpen, onOpenChange, onMerged, onClosed }: PRDetailModalProps) {
  const { data: pr, loading, fetch } = useGithubPRDetail(prNumber || 0, owner, repo);
  const send = useWebSocketStore(s => s.send);
  const [actionLoading, setActionLoading] = React.useState<'merge' | 'close' | 'reopen' | 'comment' | null>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [comment, setComment] = React.useState('');
  const [commentTab, setCommentTab] = React.useState<'write' | 'preview'>('write');
  const [mergeStrategy, setMergeStrategy] = React.useState<'merge' | 'squash' | 'rebase'>('merge');

  const conversation = React.useMemo(() => {
    if (!pr) return [];

    // If backend provided timeline, use it to build a rich history
    if (pr.timeline && Array.isArray(pr.timeline)) {
      return pr.timeline
        .map((item: any) => {
          let author = item.actor || item.author || (item.user);
          // For commits in timeline
          if (item.event === 'committed') {
            author = { login: 'AruNi-01' }; // Fallback or extract from commit info if possible
          }

          return {
            ...item,
            type: item.event === 'commented' ? 'comment' : (item.event === 'committed' ? 'commit' : (item.event === 'reviewed' ? 'review' : 'activity')),
            author: author,
            createdAt: item.created_at || item.author?.date || item.submitted_at || item.authoredDate || pr.createdAt,
            // Normalize body - handle different GitHub API field names
            body: item.body || item.message || item.messageHeadline || ''
          };
        })
        .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = [];
    if (pr.comments) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items.push(...pr.comments.map((c: any) => ({ ...c, type: 'comment' })));
    }
    if (pr.reviews) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items.push(...pr.reviews.map((r: any) => ({ ...r, type: 'review' })));
    }
    if (pr.commits) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items.push(...pr.commits.map((c: any) => ({
        ...c,
        type: 'commit',
        createdAt: c.authoredDate,
        body: c.messageHeadline,
        author: c.authors?.[0]
      })));
    }
    return items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [pr]);

  React.useEffect(() => {
    // If we want to fetch details immediately when opening: handled by hook due to dependency
  }, [prNumber, isOpen]);

  const handleMerge = async () => {
    if (!prNumber) return;
    setActionLoading('merge');
    try {
      await send('github_pr_merge', {
        owner,
        repo,
        pr_number: prNumber,
        strategy: mergeStrategy,
        body: comment.trim() || undefined
      });
      setComment('');
      fetch?.();
      onMerged?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleClose = async () => {
    if (!prNumber) return;
    setActionLoading('close');
    try {
      await send('github_pr_close', { owner, repo, pr_number: prNumber, comment: comment.trim() || undefined });
      setComment('');
      fetch?.();
      onClosed?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReopen = async () => {
    if (!prNumber) return;
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

  const handlePostComment = async () => {
    if (!prNumber || !comment.trim()) return;
    setActionLoading('comment');
    try {
      await send('github_pr_comment', { owner, repo, pr_number: prNumber, body: comment });
      setComment('');
      fetch(); // Refresh details to show new comment
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
          isFullscreen ? "max-w-none sm:max-w-none w-screen sm:w-screen h-screen max-h-screen px-6 pb-6 pt-0 m-0 border-none rounded-none" : "max-w-5xl sm:max-w-5xl w-full max-h-[90vh] px-6 pb-6 pt-0"
        )}
      >
        <div className="flex-1 overflow-y-auto min-h-[600px] pr-4 -mr-4 pb-16 relative no-scrollbar">
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
            <div className="pt-2 px-0.5">
              <PRDetailSkeleton />
            </div>
          ) : pr ? (
            <div className="flex flex-col text-sm relative">
              <div className="shrink-0 pb-4 pt-1 border-b border-border/50 sticky top-0 z-30 bg-background/98 backdrop-blur-md">
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
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-4">
                {pr.body && (
                  <div className="bg-sidebar-accent/30 p-4 rounded-md border border-sidebar-border shadow-inner text-[13px] shrink-0">
                    <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed">
                      {pr.body}
                    </MarkdownRenderer>
                  </div>
                )}

                {/* PR Status Section */}
                <div className="flex flex-col gap-3 py-2">
                  {pr.statusCheckRollup?.length > 0 && (
                    <div className={cn(
                      "flex flex-col border rounded-xl transition-all shadow-sm overflow-hidden",
                      pr.statusCheckRollup.every((c: any) => c.state === 'SUCCESS' || c.conclusion === 'SUCCESS')
                        ? "border-emerald-500/20"
                        : "border-amber-500/20"
                    )}>
                      <div className={cn(
                        "flex items-start gap-4 p-4",
                        pr.statusCheckRollup.every((c: any) => c.state === 'SUCCESS' || c.conclusion === 'SUCCESS')
                          ? "bg-emerald-500/5"
                          : "bg-amber-500/5"
                      )}>
                        <div className={cn(
                          "mt-0.5 rounded-full p-1.5 shadow-sm",
                          pr.statusCheckRollup.every((c: any) => c.state === 'SUCCESS' || c.conclusion === 'SUCCESS')
                            ? "bg-emerald-500 text-white"
                            : "bg-amber-500 text-white"
                        )}>
                          {pr.statusCheckRollup.every((c: any) => c.state === 'SUCCESS' || c.conclusion === 'SUCCESS')
                            ? <CheckCircle2 className="size-4" />
                            : <AlertCircle className="size-4" />}
                        </div>
                        <div className="flex-1">
                          <h5 className="text-sm font-bold flex items-center justify-between text-foreground">
                            {pr.statusCheckRollup.every((c: any) => c.state === 'SUCCESS' || c.conclusion === 'SUCCESS')
                              ? 'All checks have passed'
                              : 'Some checks are still running or failed'}
                          </h5>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {pr.statusCheckRollup.filter((c: any) => c.state === 'SUCCESS' || c.conclusion === 'SUCCESS').length} successful checks
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col border-t border-border/40 bg-background">
                        {(() => {
                          const groups: Record<string, any[]> = {};
                          pr.statusCheckRollup.forEach((c: any) => {
                            let g = c.workflowName;
                            if (!g) {
                              g = c.context && c.context.toLowerCase().includes('vercel') ? 'Vercel' : 'Other Checks';
                            }
                            if (!groups[g]) groups[g] = [];
                            groups[g].push(c);
                          });
                          return Object.entries(groups).map(([groupName, checks]) => (
                            <CheckGroupItem key={groupName} groupName={groupName} checks={checks} />
                          ));
                        })()}
                      </div>
                    </div>
                  )}

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

                {conversation.length > 0 && (
                  <div className="mt-8 flex flex-col gap-0 relative">
                    <h4 className="text-sm font-semibold border-b border-border pb-2 shrink-0 mb-6">Timeline</h4>

                    {/* Vertical Timeline Line */}
                    <div className="absolute left-4 top-12 bottom-0 w-0.5 bg-border/60 z-0" />

                    <TooltipProvider delayDuration={300}>
                      <div className="flex flex-col gap-6 relative z-10">
                        {conversation.map((item: any, i: number) => {
                          const isMainComment = item.type === 'comment' || (item.type === 'review' && item.body);
                          const isBot = item.author?.is_bot || item.author?.login === 'cursor' || item.author?.login === 'vercel' || item.author?.login?.endsWith('[bot]');

                          if (isMainComment) {
                            return (
                              <div key={i} className="flex gap-4 items-start group">
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
                                    <span className="opacity-60 ml-auto">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                                  </div>
                                  <div className="p-4 bg-background">
                                    <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed">
                                      {item.body}
                                    </MarkdownRenderer>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // Activity Row (Commit, Merge, Close, etc)
                          let icon = <GitCommit className="size-3.5 text-muted-foreground" />;
                          let colorClass = "bg-muted";
                          let actionText = "";

                          switch (item.event) {
                            case 'closed':
                              icon = <XCircle className="size-3.5 text-white" />;
                              colorClass = "bg-red-500";
                              actionText = "closed this";
                              break;
                            case 'reopened':
                              icon = <RotateCcw className="size-3.5 text-white" />;
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
                              ) as any;
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
                              ) as any;
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
                                    {pr.statusCheckRollup.every((c: any) => c.state === 'SUCCESS' || c.conclusion === 'SUCCESS') ? (
                                      <CheckCircle2 className="size-3 text-emerald-500" />
                                    ) : (
                                      <XCircle className="size-3 text-red-500" />
                                    )}
                                    <span>
                                      {pr.statusCheckRollup.filter((c: any) => c.state === 'SUCCESS' || c.conclusion === 'SUCCESS').length} of {pr.statusCheckRollup.length} checks passed
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
                            </div>
                          );
                        })}
                      </div>
                    </TooltipProvider>
                  </div>
                )}

                {/* Add a comment section */}
                <div className="mt-8 border border-border rounded-lg overflow-hidden bg-background shadow-sm">
                  <div className="bg-muted/50 px-4 py-2 border-b border-border flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-2">
                      <MessageSquare className="size-3.5" /> Add a comment
                    </span>
                    <Tabs value={commentTab} onValueChange={(v: any) => setCommentTab(v)}>
                      <TabsList>
                        <TabsTrigger value="write" className="text-[11px] px-3">Write</TabsTrigger>
                        <TabsTrigger value="preview" className="text-[11px] px-3">Preview</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="p-0">
                    {commentTab === 'write' ? (
                      <Textarea
                        placeholder="Leave a comment"
                        className="min-h-[120px] w-full border-none focus-visible:ring-0 rounded-none resize-y p-4 text-[13px]"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                    ) : (
                      <div className="p-4 min-h-[120px] bg-background">
                        {comment.trim() ? (
                          <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-[13px]">
                            {comment}
                          </MarkdownRenderer>
                        ) : (
                          <div className="text-muted-foreground italic text-xs">Nothing to preview</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="px-4 py-2 bg-muted/30 border-t border-border flex items-center justify-between">
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Github className="size-3" /> Markdown supported
                    </div>
                    <div className="flex gap-2">
                      {pr.state === 'OPEN' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs font-medium"
                            onClick={handleClose}
                            disabled={!!actionLoading}
                          >
                            <XCircle className="mr-2 size-3.5" /> {comment.trim() ? 'Comment & Close PR' : 'Close PR'}
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            className={cn(
                              "h-8 text-xs font-medium text-white",
                              (pr.isDraft || pr.mergeable !== 'MERGEABLE') ? "bg-muted text-muted-foreground cursor-not-allowed opacity-70" : "bg-emerald-600 hover:bg-emerald-700"
                            )}
                            onClick={handleMerge}
                            disabled={!!actionLoading || pr.isDraft || pr.mergeable !== 'MERGEABLE'}
                          >
                            <GitMerge className="mr-2 size-3.5" /> {comment.trim() ? 'Comment & Merge' : 'Merge'}
                          </Button>
                        </>
                      )}
                      {pr.state === 'CLOSED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs font-medium"
                          onClick={handleReopen}
                          disabled={!!actionLoading}
                        >
                          <RotateCcw className="mr-2 size-3.5" /> {comment.trim() ? 'Comment & Reopen PR' : 'Reopen PR'}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 text-xs font-medium"
                        onClick={handlePostComment}
                        disabled={!comment.trim() || !!actionLoading}
                      >
                        {actionLoading === 'comment' ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <MessageSquare className="mr-2 size-3.5" />}
                        Comment
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Detailed info not found...</div>
          )}
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex sm:justify-between items-center bg-background/90 backdrop-blur-md px-4 py-2.5 rounded-xl border border-dashed border-border/80 shadow-xl gap-6">
          <div className="flex gap-2.5">
            <Button variant="outline" size="sm" onClick={handleOpenGitHub} className="shadow-sm hover:shadow-md transition-shadow h-8 text-[11px] px-3">
              <ExternalLink className="mr-1.5 size-3.5" />
              GitHub
            </Button>

            <Button variant="outline" size="sm" onClick={handleOpenBetterHub} className="shadow-sm hover:shadow-md transition-shadow h-8 text-[11px] px-3">
              <ExternalLink className="mr-1.5 size-3.5" />
              BetterHub
            </Button>
          </div>

          <div className="w-px h-5 bg-border/40 shrink-0 mx-1" />

          <div className="flex gap-2.5">
            {loading ? (
              <>
                <Skeleton className="h-8 w-24 rounded-md" />
                <Skeleton className="h-8 w-32 rounded-md" />
              </>
            ) : pr?.state === 'OPEN' ? (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleClose}
                  disabled={!!actionLoading}
                  className="shadow-sm hover:shadow-md hover:bg-red-600 transition-all"
                >
                  {actionLoading === 'close' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <XCircle className="mr-2 size-4" />}
                  Close PR
                </Button>
                <div className="flex h-8 items-stretch gap-px shadow-sm rounded-md overflow-hidden">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleMerge}
                    disabled={!!actionLoading || pr.isDraft || pr.mergeable !== 'MERGEABLE'}
                    className={cn(
                      "rounded-none h-full shadow-none transition-all transform active:scale-[0.98] text-white border-r border-white/10",
                      (pr.isDraft || pr.mergeable !== 'MERGEABLE') ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"
                    )}
                  >
                    {actionLoading === 'merge' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <GitMerge className="mr-2 size-4" />}
                    {mergeStrategy === 'merge' ? 'Merge pull request' : mergeStrategy === 'squash' ? 'Squash and merge' : 'Rebase and merge'}
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="default"
                        size="sm"
                        className={cn(
                          "px-2 rounded-none h-full min-w-0 shadow-none transition-all text-white",
                          (pr.isDraft || pr.mergeable !== 'MERGEABLE') ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"
                        )}
                        disabled={!!actionLoading || pr.isDraft || pr.mergeable !== 'MERGEABLE'}
                      >
                        <ChevronDown className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[320px] p-1">
                      <DropdownMenuItem
                        className="flex flex-col items-start gap-1 py-2.5 px-3 cursor-pointer"
                        onClick={() => setMergeStrategy('merge')}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-bold text-[13px]">Create a merge commit</span>
                          {mergeStrategy === 'merge' && <Check className="size-3.5 text-blue-500" />}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-normal">
                          All commits from this branch will be added to the base branch via a merge commit.
                        </p>
                      </DropdownMenuItem>
                      <div className="h-px bg-border/40 my-1" />
                      <DropdownMenuItem
                        className="flex flex-col items-start gap-1 py-2.5 px-3 cursor-pointer"
                        onClick={() => setMergeStrategy('squash')}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-bold text-[13px]">Squash and merge</span>
                          {mergeStrategy === 'squash' && <Check className="size-3.5 text-blue-500" />}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-normal">
                          The {pr.commits?.length || 0} commits from this branch will be combined into one commit in the base branch.
                        </p>
                      </DropdownMenuItem>
                      <div className="h-px bg-border/40 my-1" />
                      <DropdownMenuItem
                        className="flex flex-col items-start gap-1 py-2.5 px-3 cursor-pointer"
                        onClick={() => setMergeStrategy('rebase')}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-bold text-[13px]">Rebase and merge</span>
                          {mergeStrategy === 'rebase' && <Check className="size-3.5 text-blue-500" />}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-normal">
                          The {pr.commits?.length || 0} commits from this branch will be rebased and added to the base branch.
                        </p>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            ) : pr?.state === 'CLOSED' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReopen}
                disabled={!!actionLoading}
                className="shadow-sm hover:shadow-md transition-all font-semibold"
              >
                {actionLoading === 'reopen' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RotateCcw className="mr-2 size-4" />}
                Reopen PR
              </Button>
            ) : pr?.state === 'MERGED' ? (
              <Button
                variant="secondary"
                size="sm"
                disabled
                className="shadow-sm bg-purple-600/90 text-white opacity-100 cursor-default"
              >
                <GitMerge className="mr-2 size-4" />
                Merged
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
