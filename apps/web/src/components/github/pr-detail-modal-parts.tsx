import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@workspace/ui';
import type { FileContents } from '@pierre/diffs';
import { MultiFileDiff } from '@pierre/diffs/react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  GitMerge,
  Github,
  Loader2,
  MessageSquare,
  RotateCw,
  XCircle,
} from 'lucide-react';
import { getFileIconProps } from '@workspace/ui';
import { formatDistanceToNow } from 'date-fns';
import { ATMOS_DIFF_THEME } from '@/components/diff/diff-view-constants';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { cn } from '@/lib/utils';
import type { CommitListItem } from './CommitList';

export interface StatusCheck {
  state?: string;
  conclusion?: string;
  status?: string;
  name?: string;
  context?: string;
  workflowName?: string;
}

export interface TimelineItem {
  event?: string;
  type?: string;
  actor?: Record<string, unknown>;
  author?: { login?: string; name?: string; avatar_url?: string; avatarUrl?: string; is_bot?: boolean; date?: string };
  user?: Record<string, unknown>;
  created_at?: string;
  submitted_at?: string;
  authoredDate?: string;
  body?: string;
  message?: string;
  messageHeadline?: string;
  state?: string;
  commit_id?: string;
  merge_commit_sha?: string;
  commit_sha?: string;
  assignee?: { login?: string };
  label?: { name?: string; color?: string };
  requested_reviewer?: { login?: string };
  milestone?: { title?: string };
  rename?: { from?: string; to?: string };
  deployment?: { environment?: string };
  deployment_status?: { target_url?: string };
  environment?: string;
  createdAt?: string;
}

export interface ReviewComment {
  id?: number;
  body?: string;
  path?: string;
  line?: number | null;
  original_line?: number | null;
  side?: string;
  diff_hunk?: string;
  user?: { login?: string; avatar_url?: string; is_bot?: boolean };
  created_at?: string;
  updated_at?: string;
  in_reply_to_id?: number;
  pull_request_review_id?: number;
  html_url?: string;
}

export interface ReviewCommentThread {
  path: string;
  line: number | null;
  diffHunk: string;
  comments: ReviewComment[];
}

export interface Reviewer {
  login: string;
  avatar_url?: string;
  state?: string;
}

export interface Label {
  name: string;
  color?: string;
  description?: string;
}

export interface Assignee {
  login: string;
  avatar_url?: string;
  avatarUrl?: string;
}

export interface ClosingIssue {
  number: number;
  title: string;
  url: string;
  state?: string;
  body?: string;
}

export interface ConversationItem extends TimelineItem {
  type: string;
  createdAt: string;
  reviewCommentThreads?: ReviewCommentThread[];
}

function CheckGroupItem({ groupName, checks }: { groupName: string, checks: StatusCheck[] }) {
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

export function PRDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse p-2">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-28 w-full rounded-xl border border-border/50" />
        <Skeleton className="h-28 w-full rounded-xl border border-border/50" />
      </div>

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

function buildDiffFiles(path: string, diffHunk: string): { oldFile: FileContents; newFile: FileContents } | null {
  const lines = diffHunk.split('\n');
  const oldLines: string[] = [];
  const newLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith('@@')) continue;
    if (line.startsWith('-')) {
      oldLines.push(line.slice(1));
      continue;
    }
    if (line.startsWith('+')) {
      newLines.push(line.slice(1));
      continue;
    }
    if (line.startsWith(' ')) {
      const content = line.slice(1);
      oldLines.push(content);
      newLines.push(content);
      continue;
    }
  }

  if (oldLines.length === 0 && newLines.length === 0) {
    return null;
  }

  return {
    oldFile: { name: path.split('/').pop() || path, contents: oldLines.join('\n') },
    newFile: { name: path.split('/').pop() || path, contents: newLines.join('\n') },
  };
}

function SafePatchDiffBlock({ path, options, isMounted, diffHunk }: {
  path: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any;
  isMounted: boolean;
  diffHunk: string;
}) {
  const diffFiles = useMemo(() => buildDiffFiles(path, diffHunk), [path, diffHunk]);

  if (!isMounted || !diffFiles) {
    return (
      <div className="max-h-[180px] overflow-auto border-b border-border/30">
        <pre className="text-[11px] bg-muted/20 px-3 py-2 overflow-x-auto font-mono text-muted-foreground leading-relaxed">
          {diffHunk}
        </pre>
      </div>
    );
  }

  return (
    <div className="max-h-[180px] overflow-auto border-b border-border/30">
      <MultiFileDiff oldFile={diffFiles.oldFile} newFile={diffFiles.newFile} options={options} />
    </div>
  );
}

export function ChecksSection({ checks }: { checks: StatusCheck[] }) {
  const [open, setOpen] = React.useState(false);
  const allPassed = checks.every((c: StatusCheck) => c.state === 'SUCCESS' || c.conclusion === 'SUCCESS');
  const passedCount = checks.filter((c: StatusCheck) => c.state === 'SUCCESS' || c.conclusion === 'SUCCESS').length;

  const groups: Record<string, StatusCheck[]> = {};
  checks.forEach((c: StatusCheck) => {
    let g = c.workflowName;
    if (!g) g = c.context && c.context.toLowerCase().includes('vercel') ? 'Vercel' : 'Other Checks';
    if (!groups[g]) groups[g] = [];
    groups[g].push(c);
  });

  return (
    <div className="flex flex-col gap-2">
      <button
        className="flex items-center gap-1.5 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider w-full text-left group cursor-pointer"
        onClick={() => setOpen(v => !v)}
      >
        <div className="relative size-3.5 shrink-0">
          {allPassed
            ? <CheckCircle2 className="absolute inset-0 size-3.5 text-emerald-500 transition-opacity duration-150 group-hover:opacity-0" />
            : <AlertCircle className="absolute inset-0 size-3.5 text-amber-500 transition-opacity duration-150 group-hover:opacity-0" />}
          <ChevronRight className={cn("absolute inset-0 size-3.5 opacity-0 transition-all duration-150 group-hover:opacity-100", open && "rotate-90")} />
        </div>
        <span>Checks</span>
        <span className="ml-auto font-normal normal-case tracking-normal text-[10px]">{passedCount}/{checks.length}</span>
      </button>
      {open && (
        <div className="flex flex-col border rounded-lg overflow-hidden border-border/50">
          {Object.entries(groups).map(([groupName, groupChecks]) => (
            <CheckGroupItem key={groupName} groupName={groupName} checks={groupChecks} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SidebarSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">
        {icon}
        <span>{title}</span>
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

export const ReviewCommentThreadView = React.memo(function ReviewCommentThreadView({ thread }: { thread: ReviewCommentThread }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const isMounted = React.useSyncExternalStore(
    () => () => { },
    () => true,
    () => false,
  );

  const diffPatch = useMemo(() => {
    if (!thread.diffHunk) return null;
    return `--- a/${thread.path}\n+++ b/${thread.path}\n${thread.diffHunk}`;
  }, [thread.diffHunk, thread.path]);

  const diffOptions = useMemo(() => {
    return {
      theme: ATMOS_DIFF_THEME,
      diffStyle: 'unified' as const,
      overflow: 'wrap' as const,
      disableLineNumbers: false,
      disableFileHeader: true,
    };
  }, []);

  return (
    <div className="ml-12 mt-2 border border-border/60 rounded-lg overflow-hidden bg-muted/10 shadow-sm">
      <button
        className="flex items-center gap-2 px-3 py-2 w-full text-left bg-muted/30 hover:bg-muted/50 transition-colors border-b border-border/40"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img {...getFileIconProps({ name: thread.path.split('/').pop() || thread.path, isDir: false })} className="size-4 shrink-0" alt="" aria-hidden="true" />
        <span className="text-[12px] font-mono text-foreground/80 truncate">{thread.path}</span>
        {thread.line && (
          <span className="text-[10px] text-muted-foreground shrink-0">line {thread.line}</span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{thread.comments.length} comment{thread.comments.length > 1 ? 's' : ''}</span>
        <ChevronRight className={cn("size-3 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            {diffPatch && (
              <SafePatchDiffBlock path={thread.path} options={diffOptions} isMounted={isMounted} diffHunk={thread.diffHunk} />
            )}
            <div className="flex flex-col divide-y divide-border/30">
              {thread.comments.map((comment, idx) => (
                <div key={comment.id || idx} className="px-3 py-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Avatar className="size-4 border border-border/50">
                      <AvatarImage src={comment.user?.avatar_url || `https://github.com/${comment.user?.login?.replace('[bot]', '')}.png?size=32`} />
                      <AvatarFallback className="text-[6px]">{comment.user?.login?.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="text-[11px] font-semibold text-foreground/90">{comment.user?.login}</span>
                    {comment.created_at && (
                      <span className="text-[10px] text-muted-foreground/60 ml-auto">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                  <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed prose-p:my-0 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-1">
                    {comment.body || ''}
                  </MarkdownRenderer>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface CommentBoxProps {
  prState: string;
  isDraft: boolean;
  mergeable: string;
  actionLoading: string | null;
  onComment: (body: string) => void;
  onClose: (body: string) => void;
  onMerge: (body: string) => void;
  onReopen: (body: string) => void;
}

export function CommentBox({ prState, isDraft, mergeable, actionLoading, onComment, onClose, onMerge, onReopen }: CommentBoxProps) {
  const [comment, setComment] = React.useState('');
  const [tab, setTab] = React.useState<'write' | 'preview'>('write');

  return (
    <div className="mt-8 border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold flex items-center gap-2">
          <MessageSquare className="size-3.5" /> Add a comment
        </span>
        <Tabs value={tab} onValueChange={(v: string) => setTab(v as 'write' | 'preview')}>
          <TabsList>
            <TabsTrigger value="write" className="text-[11px] px-3">Write</TabsTrigger>
            <TabsTrigger value="preview" className="text-[11px] px-3">Preview</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="p-0">
        {tab === 'write' ? (
          <Textarea
            placeholder="Leave a comment"
            className="min-h-[120px] w-full border-none focus-visible:ring-0 rounded-none resize-y p-4 text-[13px] bg-transparent dark:bg-transparent"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        ) : (
          <div className="p-4 min-h-[120px]">
            {comment.trim() ? (
              <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-[13px]">{comment}</MarkdownRenderer>
            ) : (
              <div className="text-muted-foreground italic text-xs">Nothing to preview</div>
            )}
          </div>
        )}
      </div>
      <div className="px-4 py-2 border-t border-border flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Github className="size-3" /> Markdown supported
        </div>
        <div className="flex gap-2">
          {prState === 'OPEN' && (
            <>
              <Button variant="outline" size="sm" className="h-8 text-xs font-medium" onClick={() => onClose(comment)} disabled={!!actionLoading}>
                <XCircle className="mr-2 size-3.5" /> {comment.trim() ? 'Comment & Close PR' : 'Close PR'}
              </Button>
              <Button
                variant="default" size="sm"
                className={cn("h-8 text-xs font-medium text-white", (isDraft || mergeable !== 'MERGEABLE') ? "bg-muted text-muted-foreground cursor-not-allowed opacity-70" : "bg-emerald-600 hover:bg-emerald-700")}
                onClick={() => onMerge(comment)} disabled={!!actionLoading || isDraft || mergeable !== 'MERGEABLE'}
              >
                <GitMerge className="mr-2 size-3.5" /> {comment.trim() ? 'Comment & Merge' : 'Merge'}
              </Button>
            </>
          )}
          {prState === 'CLOSED' && (
            <Button variant="outline" size="sm" className="h-8 text-xs font-medium" onClick={() => onReopen(comment)} disabled={!!actionLoading}>
              <RotateCw className="mr-2 size-3.5" /> {comment.trim() ? 'Comment & Reopen PR' : 'Reopen PR'}
            </Button>
          )}
          <Button variant="secondary" size="sm" className="h-8 text-xs font-medium" onClick={() => { onComment(comment); setComment(''); }} disabled={!comment.trim() || !!actionLoading}>
            {actionLoading === 'comment' ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <MessageSquare className="mr-2 size-3.5" />}
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}

export function prCommitsToListItems(
  commits: Array<{ oid: string; messageHeadline: string; messageBody?: string; authors?: Array<{ login?: string; avatarUrl?: string }>; committedDate?: string }>,
  owner: string,
  repo: string,
): CommitListItem[] {
  return commits.map(c => ({
    hash: c.oid,
    shortHash: c.oid.substring(0, 7),
    subject: c.messageHeadline,
    body: c.messageBody,
    authorName: c.authors?.[0]?.login ?? 'unknown',
    authorAvatarUrl: c.authors?.[0]?.avatarUrl ?? `https://github.com/${c.authors?.[0]?.login?.replace('[bot]', '')}.png?size=32`,
    timestamp: c.committedDate ? new Date(c.committedDate) : new Date(0),
    isPushed: true,
    githubUrl: `https://github.com/${owner}/${repo}/commit/${c.oid}`,
  }));
}
