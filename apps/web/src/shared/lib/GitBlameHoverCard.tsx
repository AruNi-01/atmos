"use client";

import React, { useCallback, useState } from "react";
import { SquareArrowOutUpRight } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";
import type { GitBlameCommit, GitCommitDetailResponse } from "@/api/ws-api-types";
import type { GitBlameStrings } from "@/shared/lib/codemirror-git-blame";

function authorInitials(name: string): string {
  return name.trim().replace(/\s+/g, "").substring(0, 2).toUpperCase() || "?";
}

export function GitBlameHoverCard({
  commit,
  detail,
  uncommitted,
  strings,
  onOpen,
}: {
  commit: GitBlameCommit | null;
  detail: GitCommitDetailResponse | null;
  uncommitted: boolean;
  strings: GitBlameStrings;
  onOpen?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!commit) return;
      void navigator.clipboard.writeText(commit.hash).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      });
    },
    [commit],
  );

  if (uncommitted || !commit) {
    return <div className="text-[13px] font-medium">{strings.notCommittedYet}</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Avatar className="size-6">
          <AvatarFallback className="bg-muted text-[10px] font-medium text-muted-foreground">
            {authorInitials(commit.author_name)}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 truncate text-[13px] font-medium">{commit.author_name}</span>
        <span className="ml-auto min-w-0 text-right text-[11px] leading-snug text-muted-foreground">
          {strings.when(commit.timestamp)}
        </span>
      </div>
      <div className="text-[13px] font-medium leading-snug">{commit.subject}</div>
      {detail?.body ? (
        <div className="max-h-[9.5em] overflow-hidden whitespace-pre-wrap text-[12px] text-muted-foreground">
          {detail.body}
        </div>
      ) : null}
      {detail ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          <span>{strings.filesChanged(detail.files_changed)}</span>
          <span className="text-emerald-600 dark:text-emerald-400">+{detail.insertions}</span>
          <span className="text-red-500 dark:text-red-400">-{detail.deletions}</span>
        </div>
      ) : null}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="font-mono text-[11px] text-muted-foreground"
          title={strings.copyHash}
          onClick={handleCopy}
        >
          {copied ? strings.copied : commit.short_hash}
        </Button>
        {onOpen ? (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={strings.openCommit}
                  className="ml-auto"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpen();
                  }}
                >
                  <SquareArrowOutUpRight className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{strings.openCommit}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
    </div>
  );
}
