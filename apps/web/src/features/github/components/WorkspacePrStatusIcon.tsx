"use client";

import React from "react";
import {
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  cn,
} from "@workspace/ui";
import type { GithubPrPayload } from "@/api/ws/github-api";
import { useWorkspacePrStatus } from "@/features/github/hooks/use-workspace-pr-status";
import {
  resolvePrIconColorClass,
  type WorkspacePrChecksTone,
  type WorkspacePrLifecycleState,
} from "@/features/github/lib/workspace-pr-status";

export type WorkspacePrStatusIconProps = {
  githubPr?: GithubPrPayload | null;
  branch?: string | null;
  /** Project/worktree path — resolve owner/repo for branch-linked PRs. */
  repoPath?: string | null;
  owner?: string | null;
  repo?: string | null;
  /** Hover / popover / selection — enables lazy checks fetch. */
  interested?: boolean;
  /** When false and no managed PR, render nothing (kanban title prefix). */
  showBranchFallback?: boolean;
  className?: string;
  /** Extra classes when open PR has no check-driven color (active row, muted, etc.). */
  fallbackClassName?: string;
};

function PrLifecycleIcon({
  state,
  className,
}: {
  state: WorkspacePrLifecycleState;
  className?: string;
}) {
  if (state === "merged") {
    return <GitMerge className={className} />;
  }
  if (state === "closed") {
    return <GitPullRequestClosed className={className} />;
  }
  if (state === "draft") {
    return <GitPullRequestDraft className={className} />;
  }
  return <GitPullRequest className={className} />;
}

/**
 * Leading workspace icon: branch by default, or GitHub-style PR lifecycle icon
 * (open / draft / closed / merged) when the workspace manages a PR.
 * Open PR color can follow checks; draft gray, merged purple, closed red.
 */
export function WorkspacePrStatusIcon({
  githubPr,
  branch,
  repoPath,
  owner,
  repo,
  interested = false,
  showBranchFallback = true,
  className,
  fallbackClassName = "text-muted-foreground",
}: WorkspacePrStatusIconProps) {
  const { presentation } = useWorkspacePrStatus({
    githubPr,
    branch,
    repoPath,
    owner,
    repo,
    interested,
  });

  if (!presentation) {
    if (!showBranchFallback) return null;
    return <GitBranch className={cn("size-3.5 shrink-0", fallbackClassName, className)} />;
  }

  const colorClass = resolvePrIconColorClass(
    presentation.state,
    presentation.checksTone,
    fallbackClassName,
  );

  return (
    <PrLifecycleIcon
      state={presentation.state}
      className={cn("size-3.5 shrink-0", colorClass, className)}
    />
  );
}

/**
 * Pure presentational icon when the parent already owns `useWorkspacePrStatus`
 * (avoids a second subscription on the same row).
 */
export function WorkspacePrLifecycleIcon({
  state,
  checksTone,
  className,
  fallbackClassName = "text-muted-foreground",
}: {
  state: WorkspacePrLifecycleState;
  checksTone: WorkspacePrChecksTone;
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <PrLifecycleIcon
      state={state}
      className={cn(
        "size-3.5 shrink-0",
        resolvePrIconColorClass(state, checksTone, fallbackClassName),
        className,
      )}
    />
  );
}
