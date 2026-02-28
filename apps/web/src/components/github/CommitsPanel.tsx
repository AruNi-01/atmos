"use client";

import React, { useMemo, useState, useCallback } from 'react';
import { GitCommit as GitCommitIcon, ChevronLeft, ChevronRight, Copy, Check, Loader2, Github } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@workspace/ui';
import { cn } from '@/lib/utils';
import { useGitLog, type GitCommit } from '@/hooks/use-github';
import { formatDistanceToNow, format, fromUnixTime } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

interface CommitsPanelProps {
  repoPath: string;
  branch: string;
  owner?: string;
  repo?: string;
}

function groupCommitsByDay(commits: GitCommit[]): Array<{ dateLabel: string; date: Date; commits: GitCommit[] }> {
  const groups: Map<string, { dateLabel: string; date: Date; commits: GitCommit[] }> = new Map();
  for (const commit of commits) {
    const date = fromUnixTime(commit.timestamp);
    const key = format(date, 'yyyy-MM-dd');
    if (!groups.has(key)) {
      groups.set(key, { dateLabel: format(date, 'MMM d, yyyy'), date, commits: [] });
    }
    groups.get(key)!.commits.push(commit);
  }
  return Array.from(groups.values());
}

function getInitials(name: string): string {
  if (!name) return '??';
  // Use first two characters as requested (all caps)
  const cleanName = name.trim().replace(/\s+/g, '');
  return cleanName.substring(0, 2).toUpperCase() || '??';
}

function AuthorAvatar({ name, avatarUrlFromBackend }: { name: string; avatarUrlFromBackend?: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = getInitials(name);

  return (
    <div className="size-6 rounded-full border border-sidebar-border bg-sidebar-accent flex items-center justify-center text-[10px] font-bold text-muted-foreground overflow-hidden shrink-0 cursor-default">
      {avatarUrlFromBackend && !imgFailed ? (
        <img
          src={avatarUrlFromBackend}
          alt={initials}
          className="size-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="tracking-tight">{initials}</span>
      )}
    </div>
  );
}

function HashAndCopyButton({ hash, shortHash }: { hash: string; shortHash: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [hash]);

  return (
    <div
      className="group/hash flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-sidebar-accent cursor-pointer transition-colors"
      onClick={handleCopy}
    >
      <div className="shrink-0 opacity-0 group-hover/hash:opacity-100 transition-opacity flex items-center justify-center w-3.5 h-3.5">
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.div
              key="copied"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <Check className="size-3.5 text-green-500" />
            </motion.div>
          ) : (
            <motion.div
              key="copy"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <Copy className="size-3.5 text-muted-foreground/60" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <span className="font-mono text-[10px] text-muted-foreground/60 select-none">{shortHash}</span>
    </div>
  );
}

function CommitRow({ commit, owner, repo }: { commit: GitCommit; owner?: string; repo?: string }) {
  const date = fromUnixTime(commit.timestamp);
  const timeAgo = formatDistanceToNow(date, { addSuffix: true });
  const fullMessage = commit.body ? `${commit.subject}\n\n${commit.body}` : commit.subject;
  const githubUrl = owner && repo ? `https://github.com/${owner}/${repo}/commit/${commit.hash}` : null;
  const canOpenGithub = githubUrl && commit.is_pushed;

  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-sidebar-accent/40 transition-colors group">
      {/* Author Avatar */}
      <div className="shrink-0 mt-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <AuthorAvatar name={commit.author_name} avatarUrlFromBackend={commit.author_avatar_url} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[11px]">
            {commit.author_name} &lt;{commit.author_email}&gt;
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Subject + hash aligned to the right */}
        <div className="flex items-start justify-between gap-2 overflow-hidden">
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="flex-1 text-[12px] font-medium text-foreground leading-snug line-clamp-2 cursor-default text-left min-w-0">
                {commit.subject}
              </p>
            </TooltipTrigger>
            <TooltipContent
              side="left"
              align="start"
              className="text-[11px] max-w-[260px] whitespace-pre-wrap wrap-break-word leading-relaxed"
            >
              {fullMessage}
            </TooltipContent>
          </Tooltip>

          {/* Hash area - aligned right */}
          <div className="shrink-0 flex justify-end">
            <HashAndCopyButton hash={commit.hash} shortHash={commit.short_hash} />
          </div>
        </div>

        {/* Meta row: author · time  +  GitHub icon always visible */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 min-w-0">
            <span className="font-medium text-muted-foreground/80 truncate max-w-[90px]">{commit.author_name}</span>
            <span className="shrink-0">·</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default shrink-0">{timeAgo}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[11px]">
                {format(date, 'PPpp')}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* GitHub button — shown always */}
          {githubUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                {canOpenGithub ? (
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="shrink-0 p-1 rounded hover:bg-sidebar-accent text-muted-foreground/60 hover:text-foreground transition-colors"
                  >
                    <Github className="size-3" />
                  </a>
                ) : (
                  <span className="shrink-0 p-1 rounded text-muted-foreground/20 cursor-not-allowed">
                    <Github className="size-3" />
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[11px]">
                {canOpenGithub ? 'View on GitHub' : 'Local commit — not yet pushed to remote'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}

export function CommitsPanel({ repoPath, owner, repo }: CommitsPanelProps) {
  const { commits, loading, page, hasMore, goToPrevPage, goToNextPage } = useGitLog({ repoPath });
  const grouped = useMemo(() => groupCommitsByDay(commits), [commits]);

  if (loading && commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground gap-3">
        <Loader2 className="size-5 animate-spin opacity-50" />
        <span className="text-xs font-medium">Loading commits…</span>
      </div>
    );
  }

  if (!loading && commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] text-muted-foreground/50 gap-3 p-8">
        <GitCommitIcon className="size-8 opacity-20" />
        <span className="text-xs text-center">No commits found on this branch</span>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full w-full">
        {/* Commit list — scrollable */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {grouped.map((group) => (
            <div key={group.dateLabel}>
              {/* Day header — sticky */}
              <div className="flex items-center gap-2 px-3 py-2 sticky top-0 bg-background/90 backdrop-blur-sm z-10 border-b border-sidebar-border/30">
                <GitCommitIcon className="size-3.5 text-muted-foreground/60 shrink-0" />
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Commits on {group.dateLabel}
                </span>
                {loading && <Loader2 className="size-3 animate-spin text-muted-foreground/40 ml-auto" />}
              </div>

              <div className="border border-sidebar-border/40 rounded-md mx-2 my-1.5 overflow-hidden divide-y divide-sidebar-border/25">
                {group.commits.map((commit) => (
                  <CommitRow key={commit.hash} commit={commit} owner={owner} repo={repo} />
                ))}
              </div>
            </div>
          ))}

          {/* Pagination — integrated in the list at the end */}
          {(page > 0 || hasMore) && (
            <div className="flex items-center justify-between px-4 py-4 border-t border-sidebar-border/10">
              <div className="flex-1" />
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={goToPrevPage}
                      disabled={page === 0 || loading}
                      className={cn(
                        "p-1.5 rounded-md border border-sidebar-border/50 transition-colors shadow-xs",
                        page === 0 || loading
                          ? "text-muted-foreground/30 cursor-not-allowed bg-transparent border-transparent shadow-none"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground cursor-pointer bg-background"
                      )}
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px]">Previous page</TooltipContent>
                </Tooltip>

                <div className="flex items-center gap-1.5 px-3 py-1 bg-sidebar-accent/50 rounded-sm border border-sidebar-border/30 select-none">
                  <span className="text-[10px] text-muted-foreground/60 font-medium tracking-tight">PAGE</span>
                  <span className="text-[11px] text-foreground font-bold font-mono">
                    {page + 1}
                  </span>
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={goToNextPage}
                      disabled={!hasMore || loading}
                      className={cn(
                        "p-1.5 rounded-md border border-sidebar-border/50 transition-colors shadow-xs",
                        !hasMore || loading
                          ? "text-muted-foreground/30 cursor-not-allowed bg-transparent border-transparent shadow-none"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground cursor-pointer bg-background"
                      )}
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px]">Next page</TooltipContent>
                </Tooltip>
              </div>
              <div className="flex-1" />
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
