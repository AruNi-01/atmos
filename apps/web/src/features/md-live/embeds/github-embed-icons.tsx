"use client";

import {
  CircleDot,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  cn,
} from "@workspace/ui";
import type { GithubIssueEmbedState, GithubPrEmbedState } from "./github-embed-state";

export function GithubIssueStatusIcon({
  state,
  className,
}: {
  state: GithubIssueEmbedState;
  className?: string;
}) {
  return (
    <CircleDot
      className={cn(
        "size-3.5",
        state === "closed" ? "text-purple-500" : "text-emerald-500",
        className,
      )}
    />
  );
}

export function GithubPrStatusIcon({
  state,
  className,
}: {
  state: GithubPrEmbedState;
  className?: string;
}) {
  const tone = cn(
    "size-3.5",
    state === "merged" && "text-purple-500",
    state === "closed" && "text-red-500",
    state === "draft" && "text-muted-foreground",
    state === "open" && "text-emerald-500",
    className,
  );
  if (state === "merged") return <GitMerge className={tone} />;
  if (state === "closed") return <GitPullRequestClosed className={tone} />;
  if (state === "draft") return <GitPullRequestDraft className={tone} />;
  return <GitPullRequest className={tone} />;
}
