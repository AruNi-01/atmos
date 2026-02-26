import React from 'react';
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
  AvatarFallback
} from '@workspace/ui';
import { useGithubPRDetail } from '@/hooks/use-github';
import { useWebSocketStore } from '@/hooks/use-websocket';
import { Github, ExternalLink, GitMerge, XCircle, Expand, Shrink, Loader2, MessageSquare, CheckCircle2, RotateCcw, AlertCircle, GitPullRequest, GitCommit, Rocket } from 'lucide-react';
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

export function PRDetailModal({ owner, repo, branch, prNumber, isOpen, onOpenChange, onMerged, onClosed }: PRDetailModalProps) {
  const { data: pr, loading, fetch } = useGithubPRDetail(prNumber || 0, owner, repo);
  const send = useWebSocketStore(s => s.send);
  const [actionLoading, setActionLoading] = React.useState<'merge' | 'close' | 'reopen' | 'comment' | null>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [comment, setComment] = React.useState('');
  const [commentTab, setCommentTab] = React.useState<'write' | 'preview'>('write');

  const conversation = React.useMemo(() => {
    if (!pr) return [];

    // If backend provided timeline, use it to build a rich history
    if (pr.timeline && Array.isArray(pr.timeline)) {
      return pr.timeline
        .filter((item: any) => [
          'commented', 'committed', 'reviewed', 'merged', 'closed', 'reopened', 'head_ref_force_pushed', 'referenced'
        ].includes(item.event))
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
            createdAt: item.created_at || item.author?.date || item.submitted_at || pr.createdAt,
            // Normalize body
            body: item.body || item.message || ''
          };
        })
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
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
        strategy: 'squash',
        body: comment.trim() || undefined
      });
      setComment('');
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
      await send('github_pr_close', {
        owner,
        repo,
        pr_number: prNumber,
        comment: comment.trim() || undefined
      });
      setComment('');
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
    setActionLoading('reopen'); // Reuse state for simplicity or add 'ready'
    try {
      await send('github_pr_ready', { owner, repo, pr_number: prNumber });
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
      <DialogContent className={cn(
        "transition-all duration-200 flex flex-col gap-0 overflow-hidden",
        isFullscreen ? "max-w-none sm:max-w-none w-screen sm:w-screen h-screen max-h-screen p-6 sm:p-6 m-0 border-none rounded-none" : "max-w-5xl sm:max-w-5xl w-full max-h-[90vh] p-6 sm:p-6"
      )}>
        <button
          className="absolute right-12 top-4 flex h-4 w-4 items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none z-50"
          onClick={() => setIsFullscreen(!isFullscreen)}
        >
          {isFullscreen ? <Shrink className="size-3.5" /> : <Expand className="size-3.5" />}
          <span className="sr-only">Toggle Fullscreen</span>
        </button>
        <div className="flex-1 overflow-y-auto min-h-0 pr-4 -mr-4 pb-16 relative">
          <DialogHeader className="pr-20">
            <div className="flex items-center gap-2">
              <Github className="size-5" />
              <DialogTitle>Pull Request #{prNumber}</DialogTitle>
            </div>
            <DialogDescription className="text-xs truncate max-w-[calc(100%-80px)] leading-normal py-0.5" title={`${owner}/${repo} • ${branch}`}>
              {owner}/{repo} • {branch}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex justify-center p-10">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : pr ? (
            <div className="flex flex-col text-sm mt-0 relative">
              <div className="shrink-0 pb-4 pt-1 -mt-1 border-b border-border/50 sticky -top-1 z-10 bg-background/95 backdrop-blur-md">
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
                      <AvatarImage src={`https://github.com/${pr.author?.login}.png?size=28`} />
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
                      "flex items-start gap-4 p-4 border rounded-xl transition-all",
                      pr.statusCheckRollup.every((c: any) => c.state === 'SUCCESS' || c.conclusion === 'SUCCESS')
                        ? "bg-emerald-500/5 border-emerald-500/20 shadow-sm"
                        : "bg-amber-500/5 border-amber-500/20 shadow-sm"
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
                        <h5 className="text-sm font-bold flex items-center justify-between">
                          {pr.statusCheckRollup.every((c: any) => c.state === 'SUCCESS' || c.conclusion === 'SUCCESS')
                            ? 'All checks have passed'
                            : 'Some checks are still running or failed'}
                        </h5>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {pr.statusCheckRollup.filter((c: any) => c.state === 'SUCCESS' || c.conclusion === 'SUCCESS').length} successful checks
                        </p>
                        <div className="mt-3 flex flex-col gap-2 border-t border-border/20 pt-3">
                          {pr.statusCheckRollup.map((check: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-2.5">
                                {(check.state === 'SUCCESS' || check.conclusion === 'SUCCESS')
                                  ? <CheckCircle2 className="size-3 text-emerald-500" />
                                  : <Loader2 className="size-3 text-amber-500 animate-spin" />}
                                <span className="text-foreground/80 font-medium">{check.context || check.name}</span>
                              </div>
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">
                                {check.state || check.conclusion}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

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
                    <div className="flex-1">
                      <h5 className="text-sm font-bold">
                        {pr.mergeable === 'MERGEABLE' ? 'No conflicts with base branch' : 'Conflict check in progress'}
                      </h5>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {pr.mergeable === 'MERGEABLE' ? 'Merging can be performed automatically.' : 'Determining if this PR can be merged without manual intervention.'}
                      </p>
                    </div>
                  </div>

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

                    <div className="flex flex-col gap-6 relative z-10">
                      {conversation.map((item, i) => {
                        const isMainComment = item.type === 'comment' || (item.type === 'review' && item.body);
                        const isBot = item.author?.is_bot || item.author?.login === 'cursor' || item.author?.login === 'vercel' || item.author?.login?.endsWith('[bot]');

                        if (isMainComment) {
                          return (
                            <div key={i} className="flex gap-4 items-start group">
                              <div className="relative z-10">
                                <Avatar className="size-8 shrink-0 border border-border/50 shadow-sm transition-transform group-hover:scale-105">
                                  <AvatarImage src={`https://github.com/${item.author?.login}.png?size=64`} />
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
                            actionText = "merged this";
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
                            icon = <GitCommit className="size-3.5 text-muted-foreground" />;
                            colorClass = "bg-muted border border-border/50";
                            actionText = "referenced this";
                            break;
                        }

                        return (
                          <div key={i} className="flex items-center gap-3 pl-2.5">
                            <div className={cn(
                              "size-4 rounded-full flex items-center justify-center ring-4 ring-background z-10 shrink-0",
                              colorClass
                            )}>
                              {icon}
                            </div>
                            <div className="flex items-center gap-2 text-xs truncate">
                              <Avatar className="size-4 shrink-0 border border-border/50">
                                <AvatarImage src={`https://github.com/${item.author?.login}.png?size=32`} />
                                <AvatarFallback className="text-[6px]">{item.author?.login?.substring(0, 2).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <span className="font-semibold text-foreground/90">{item.author?.login}</span>
                              {isBot && (
                                <span className="text-[9px] px-1 rounded-sm border border-border bg-muted/50 text-muted-foreground font-medium py-0 leading-none h-3.5 flex items-center shrink-0">
                                  bot
                                </span>
                              )}
                              <span className="text-muted-foreground">{actionText}</span>
                              {item.event === 'committed' && (
                                <span className="text-foreground/70 font-medium truncate max-w-[200px]" title={item.body}>
                                  {item.body}
                                </span>
                              )}
                              <span className="text-muted-foreground opacity-60 ml-auto whitespace-nowrap">
                                {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
            {pr?.state === 'OPEN' && (
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
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleMerge}
                  disabled={!!actionLoading || pr.isDraft || pr.mergeable !== 'MERGEABLE'}
                  className={cn(
                    "shadow-md transition-all transform active:scale-95 text-white",
                    (pr.isDraft || pr.mergeable !== 'MERGEABLE') ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"
                  )}
                >
                  {actionLoading === 'merge' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <GitMerge className="mr-2 size-4" />}
                  Squash and Merge
                </Button>
              </>
            )}

            {pr?.state === 'CLOSED' && (
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
            )}

            {pr?.state === 'MERGED' && (
              <Button
                variant="secondary"
                size="sm"
                disabled
                className="shadow-sm bg-purple-600/90 text-white opacity-100 cursor-default"
              >
                <GitMerge className="mr-2 size-4" />
                Merged
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
