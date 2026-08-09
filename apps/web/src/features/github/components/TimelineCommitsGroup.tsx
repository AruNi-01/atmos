"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { GitCommit, Upload } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Locale } from "date-fns";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import {
  getTimelineCommitAuthor,
  getTimelineCommitSha,
  getTimelineCommitSubject,
  type TimelineCommitLike,
} from "@/features/github/lib/timeline-commits";
import { GithubUserHoverCard } from "@/features/github/components/GithubUserHoverCard";

export type TimelineCommitClickPayload = {
  sha: string;
  subject: string;
  authorName: string;
};

interface TimelineCommitsGroupProps<T extends TimelineCommitLike> {
  commits: T[];
  locale: Locale;
  onCommitClick?: (payload: TimelineCommitClickPayload) => void;
  className?: string;
}

// Shell matches other timeline events; glyph stays smaller so it isn't tight in the circle.
// Rail width matches reviewer avatars (size-8) so the vertical line passes through center.
const timelineIconRailClass =
  "z-10 flex w-8 shrink-0 items-center justify-center";
const timelineIconShellClass =
  "flex size-5 items-center justify-center rounded-full border border-border/50 bg-muted ring-4 ring-background";
const timelineIconClass = "size-3 text-muted-foreground";

/**
 * GitHub-style commit batch on a PR/Issue timeline:
 * "User added N commits · time" summary + clickable commit rows.
 */
export function TimelineCommitsGroup<T extends TimelineCommitLike>({
  commits,
  locale,
  onCommitClick,
  className,
}: TimelineCommitsGroupProps<T>) {
  const t = useTranslations("github.timeline");
  if (commits.length === 0) return null;

  // Chronological list is oldest→newest; the batch "pushed at" time is the last commit.
  const summaryCommit = commits[commits.length - 1] ?? commits[0];
  const pusher = getTimelineCommitAuthor(summaryCommit);
  const summaryTime =
    summaryCommit.createdAt || summaryCommit.created_at || "";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Summary: "User added N commits" — plain text, same shell as other timeline events */}
      <div className="relative flex items-center gap-3">
        <div className={timelineIconRailClass}>
          <div className={timelineIconShellClass}>
            <Upload className={timelineIconClass} />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
          <span className="shrink-0 font-semibold text-foreground/90">
            {pusher.login === "unknown" ? t("unknownUser") : pusher.login}
          </span>
          <span className="min-w-0 truncate text-muted-foreground">
            {t("addedCommits", { count: commits.length })}
          </span>
          {summaryTime ? (
            <span className="ml-auto shrink-0 whitespace-nowrap text-muted-foreground/60">
              {formatDistanceToNow(new Date(summaryTime), {
                addSuffix: true,
                locale,
              })}
            </span>
          ) : null}
        </div>
      </div>

      {/* Individual commits under the summary */}
      {commits.map((commit, index) => {
        const sha = getTimelineCommitSha(commit);
        const subject = getTimelineCommitSubject(commit);
        const author = getTimelineCommitAuthor(commit);
        const shortSha = sha ? sha.slice(0, 7) : "";
        const canClick = Boolean(onCommitClick && sha);

        return (
          <div
            key={sha || `commit-${index}`}
            role={canClick ? "button" : undefined}
            tabIndex={canClick ? 0 : undefined}
            onClick={
              canClick
                ? () =>
                    onCommitClick?.({
                      sha,
                      subject,
                      authorName: author.login,
                    })
                : undefined
            }
            onKeyDown={
              canClick
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onCommitClick?.({
                        sha,
                        subject,
                        authorName: author.login,
                      });
                    }
                  }
                : undefined
            }
            className={cn(
              "relative flex items-center gap-3 py-1.5 pr-2 text-xs",
              canClick &&
                "cursor-pointer rounded-md outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
          >
            <div className={timelineIconRailClass}>
              <div className={timelineIconShellClass}>
                <GitCommit className={timelineIconClass} />
              </div>
            </div>
            <GithubUserHoverCard
              username={author.login}
              avatarUrl={author.avatarUrl}
            >
              <Avatar className="size-5 shrink-0 border border-border/50">
                {author.avatarUrl ? (
                  <AvatarImage src={author.avatarUrl} alt={author.login} />
                ) : null}
                <AvatarFallback className="text-[7px]">
                  {author.login.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </GithubUserHoverCard>
            {subject ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground/80">
                    {subject}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-md text-xs break-all">
                  {subject}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {shortSha || t("unknownCommit")}
              </span>
            )}
            {shortSha ? (
              <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground/70">
                {shortSha}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
