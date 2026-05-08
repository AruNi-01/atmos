"use client";

import React, { useState, useCallback } from 'react';
import { GitCommit as GitCommitIcon, Copy, Check, Github, Loader2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Avatar, AvatarImage, AvatarFallback } from '@workspace/ui';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

export interface CommitListItem {
  hash: string;
  shortHash: string;
  subject: string;
  body?: string;
  authorName: string;
  authorAvatarUrl?: string;
  timestamp: Date;
  isPushed?: boolean;
  githubUrl?: string;
}

function AuthorAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = name.trim().replace(/\s+/g, '').substring(0, 2).toUpperCase() || '??';
  return (
    <div className="size-6 rounded-full border border-sidebar-border bg-sidebar-accent flex items-center justify-center text-[10px] font-bold text-muted-foreground overflow-hidden shrink-0 cursor-default">
      {avatarUrl && !imgFailed ? (
        <img src={avatarUrl} alt={initials} className="size-full object-cover" onError={() => setImgFailed(true)} />
      ) : (
        <span className="tracking-tight">{initials}</span>
      )}
    </div>
  );
}

function HashCopyButton({ hash, shortHash }: { hash: string; shortHash: string }) {
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
            <motion.div key="copied" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.18 }}>
              <Check className="size-3.5 text-green-500" />
            </motion.div>
          ) : (
            <motion.div key="copy" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.18 }}>
              <Copy className="size-3.5 text-muted-foreground/60" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <span className="font-mono text-[10px] text-muted-foreground/60 select-none">{shortHash}</span>
    </div>
  );
}

function CommitRow({ commit, owner, repo }: { commit: CommitListItem; owner?: string; repo?: string }) {
  const timeAgo = formatDistanceToNow(commit.timestamp, { addSuffix: true });
  const fullMessage = commit.body ? `${commit.subject}\n\n${commit.body}` : commit.subject;
  const githubUrl = commit.githubUrl ?? (owner && repo ? `https://github.com/${owner}/${repo}/commit/${commit.hash}` : null);
  const canOpenGithub = githubUrl && commit.isPushed !== false;

  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-sidebar-accent/40 transition-colors group">
      <div className="shrink-0 mt-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <div><AuthorAvatar name={commit.authorName} avatarUrl={commit.authorAvatarUrl} /></div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[11px]">{commit.authorName}</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 overflow-hidden">
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="flex-1 text-[12px] font-medium text-foreground leading-snug line-clamp-2 cursor-default text-left min-w-0">
                {commit.subject}
              </p>
            </TooltipTrigger>
            <TooltipContent side="left" align="start" className="text-[11px] max-w-[260px] whitespace-pre-wrap leading-relaxed">
              {fullMessage}
            </TooltipContent>
          </Tooltip>
          <div className="shrink-0 flex justify-end">
            <HashCopyButton hash={commit.hash} shortHash={commit.shortHash} />
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 min-w-0">
            <span className="font-medium text-muted-foreground/80 truncate max-w-[90px]">{commit.authorName}</span>
            <span className="shrink-0">·</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default shrink-0">{timeAgo}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[11px]">{format(commit.timestamp, 'PPpp')}</TooltipContent>
            </Tooltip>
          </div>
          {githubUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                {canOpenGithub ? (
                  <a href={githubUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="shrink-0 p-1 rounded hover:bg-sidebar-accent text-muted-foreground/60 hover:text-foreground transition-colors">
                    <Github className="size-3" />
                  </a>
                ) : (
                  <span className="shrink-0 p-1 rounded text-muted-foreground/20 cursor-not-allowed"><Github className="size-3" /></span>
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

interface CommitListProps {
  commits: CommitListItem[];
  loading?: boolean;
  owner?: string;
  repo?: string;
}

export function CommitList({ commits, loading, owner, repo }: CommitListProps) {
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
        <span className="text-xs text-center">No commits found</span>
      </div>
    );
  }

  // Group by day
  const groups: Array<{ dateLabel: string; commits: CommitListItem[] }> = [];
  const seen = new Map<string, number>();
  for (const commit of commits) {
    const key = format(commit.timestamp, 'yyyy-MM-dd');
    const label = format(commit.timestamp, 'MMM d, yyyy');
    if (!seen.has(key)) {
      seen.set(key, groups.length);
      groups.push({ dateLabel: label, commits: [] });
    }
    groups[seen.get(key)!].commits.push(commit);
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col">
        {groups.map((group) => (
          <div key={group.dateLabel}>
            <div className="flex items-center gap-2 px-3 py-2 sticky top-0 bg-background/90 backdrop-blur-sm z-10 border-b border-sidebar-border/30">
              <GitCommitIcon className="size-3.5 text-muted-foreground/60 shrink-0" />
              <span className="text-[11px] font-semibold text-muted-foreground">Commits on {group.dateLabel}</span>
              {loading && <Loader2 className="size-3 animate-spin text-muted-foreground/40 ml-auto" />}
            </div>
            <div className="border border-sidebar-border/40 rounded-md mx-2 my-1.5 overflow-hidden divide-y divide-sidebar-border/25">
              {group.commits.map((commit) => (
                <CommitRow key={commit.hash} commit={commit} owner={owner} repo={repo} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
