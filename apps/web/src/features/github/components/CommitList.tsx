"use client";

import React, { useState, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { GitCommit as GitCommitIcon, Copy, Check, Loader2 } from "lucide-react";
import { Github } from "@workspace/ui/components/icons/lucide-brand-icons";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@workspace/ui";
import { formatDistanceToNow, format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/shared/lib/utils";

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
  const initials = name.trim().replace(/\s+/g, "").substring(0, 2).toUpperCase() || "??";
  return (
    <div className="flex size-6 shrink-0 cursor-default items-center justify-center overflow-hidden rounded-full border border-sidebar-border bg-sidebar-accent text-[10px] font-bold text-muted-foreground">
      {avatarUrl && !imgFailed ? (
        <img
          src={avatarUrl}
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

function HashCopyButton({ hash, shortHash }: { hash: string; shortHash: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(hash).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    },
    [hash],
  );

  return (
    <div
      className="group/hash flex cursor-pointer items-center gap-1.5 rounded px-2 py-0.5 hover:bg-sidebar-accent"
      onClick={handleCopy}
    >
      <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center opacity-0 transition-opacity group-hover/hash:opacity-100">
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.div
              key="copied"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.18 }}
            >
              <Check className="size-3.5 text-green-500" />
            </motion.div>
          ) : (
            <motion.div
              key="copy"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.18 }}
            >
              <Copy className="size-3.5 text-muted-foreground/60" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <span className="font-mono text-[10px] text-muted-foreground/60 select-none">
        {shortHash}
      </span>
    </div>
  );
}

function CommitRow({
  commit,
  owner,
  repo,
  onCommitClick,
}: {
  commit: CommitListItem;
  owner?: string;
  repo?: string;
  onCommitClick?: (commit: CommitListItem) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("github.commitList");
  const dateLocale = locale.startsWith("zh") ? zhCN : enUS;
  const timeAgo = formatDistanceToNow(commit.timestamp, {
    addSuffix: true,
    locale: dateLocale,
  });
  const fullMessage = commit.body ? `${commit.subject}\n\n${commit.body}` : commit.subject;
  const githubUrl =
    commit.githubUrl ??
    (owner && repo ? `https://github.com/${owner}/${repo}/commit/${commit.hash}` : null);
  const canOpenGithub = githubUrl && commit.isPushed !== false;

  return (
    <div
      className={cn(
        "group flex items-start gap-2.5 px-3 py-2.5 hover:bg-sidebar-accent/40",
        onCommitClick && commit.isPushed !== false && "cursor-pointer",
      )}
      onClick={() => onCommitClick?.(commit)}
    >
      <div className="mt-0.5 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <AuthorAvatar name={commit.authorName} avatarUrl={commit.authorAvatarUrl} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[11px]">
            {commit.authorName}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2 overflow-hidden">
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="line-clamp-2 min-w-0 flex-1 cursor-default text-left text-[12px] leading-snug font-medium text-foreground">
                {commit.subject}
              </p>
            </TooltipTrigger>
            <TooltipContent
              side="left"
              align="start"
              className="max-w-[260px] text-[11px] leading-relaxed whitespace-pre-wrap"
            >
              {fullMessage}
            </TooltipContent>
          </Tooltip>
          <div className="flex shrink-0 justify-end">
            <HashCopyButton hash={commit.hash} shortHash={commit.shortHash} />
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground/60">
            <span className="max-w-[90px] truncate font-medium text-muted-foreground/80">
              {commit.authorName}
            </span>
            <span className="shrink-0">·</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0 cursor-default">{timeAgo}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[11px]">
                {format(commit.timestamp, "PPpp", { locale: dateLocale })}
              </TooltipContent>
            </Tooltip>
          </div>
          {githubUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                {canOpenGithub ? (
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 rounded p-1 text-muted-foreground/60 hover:bg-sidebar-accent hover:text-foreground"
                  >
                    <Github className="size-3" />
                  </a>
                ) : (
                  <span className="shrink-0 cursor-not-allowed rounded p-1 text-muted-foreground/20">
                    <Github className="size-3" />
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[11px]">
                {canOpenGithub ? t("tooltips.viewOnGithub") : t("tooltips.localOnly")}
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
  onCommitClick?: (commit: CommitListItem) => void;
}

export function CommitList({ commits, loading, owner, repo, onCommitClick }: CommitListProps) {
  const locale = useLocale();
  const t = useTranslations("github.commitList");
  const dateLocale = locale.startsWith("zh") ? zhCN : enUS;
  if (loading && commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin opacity-50" />
        <span className="text-xs font-medium">{t("loading")}</span>
      </div>
    );
  }

  if (!loading && commits.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-muted-foreground/50">
        <GitCommitIcon className="size-8 opacity-20" />
        <span className="text-center text-xs">{t("empty")}</span>
      </div>
    );
  }

  // Group by day
  const groups: Array<{ dateLabel: string; commits: CommitListItem[] }> = [];
  const seen = new Map<string, number>();
  for (const commit of commits) {
    const key = format(commit.timestamp, "yyyy-MM-dd");
    const label = format(commit.timestamp, "MMM d, yyyy", { locale: dateLocale });
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
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-sidebar-border/30 bg-background/90 px-3 py-2 backdrop-blur-sm">
              <GitCommitIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
              <span className="text-[11px] font-semibold text-muted-foreground">
                {t("groupTitle", { date: group.dateLabel })}
              </span>
              {loading && (
                <Loader2 className="ml-auto size-3 animate-spin text-muted-foreground/40" />
              )}
            </div>
            <div className="mx-2 my-1.5 divide-y divide-sidebar-border/25 overflow-hidden rounded-md border border-sidebar-border/40">
              {group.commits.map((commit) => (
                <CommitRow
                  key={commit.hash}
                  commit={commit}
                  owner={owner}
                  repo={repo}
                  onCommitClick={onCommitClick}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
