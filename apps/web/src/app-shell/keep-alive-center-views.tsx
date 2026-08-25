"use client";

import React from "react";
import dynamic from "next/dynamic";
import {
  githubKeptSurfacePropsAreEqual,
  type GithubKeptSurfaceProps,
} from "@/app-shell/github-kept-surface-equality";

export { githubKeptSurfacePropsAreEqual };
export type { GithubKeptSurfaceProps };

const PRDetailView = dynamic(
  () =>
    import("@/features/github/components/PRDetailView").then((mod) => mod.PRDetailView),
  { ssr: false },
);
const IssueDetailView = dynamic(
  () =>
    import("@/features/github/components/IssueDetailView").then(
      (mod) => mod.IssueDetailView,
    ),
  { ssr: false },
);
const ActionsDetailView = dynamic(
  () =>
    import("@/features/github/components/ActionsDetailView").then(
      (mod) => mod.ActionsDetailView,
    ),
  { ssr: false },
);
const CommitDetailView = dynamic(
  () =>
    import("@/features/github/components/CommitDetailView").then(
      (mod) => mod.CommitDetailView,
    ),
  { ssr: false },
);

function GithubKeptSurfaceImpl({
  tab,
  active,
  onPullRequestChanged,
  onCloseTab,
}: GithubKeptSurfaceProps) {
  const onRequestClose = React.useCallback(() => {
    onCloseTab?.(tab.value);
  }, [onCloseTab, tab.value]);

  if (tab.kind === "github-pr") {
    return (
      <PRDetailView
        active={active}
        branch={tab.branch}
        onClosed={onPullRequestChanged}
        onMerged={onPullRequestChanged}
        onRequestClose={onRequestClose}
        owner={tab.owner}
        prNumber={tab.prNumber}
        repo={tab.repo}
      />
    );
  }
  if (tab.kind === "github-issue") {
    return (
      <IssueDetailView
        active={active}
        owner={tab.owner}
        issueNumber={tab.issueNumber}
        repo={tab.repo}
      />
    );
  }
  if (tab.kind === "github-action") {
    return (
      <ActionsDetailView
        active={active}
        onRequestClose={onRequestClose}
        owner={tab.owner}
        repo={tab.repo}
        run={tab.run}
        runId={tab.runId}
      />
    );
  }
  return (
    <CommitDetailView
      active={active}
      onRequestClose={onRequestClose}
      owner={tab.owner}
      repo={tab.repo}
      sha={tab.sha}
      subject={tab.subject}
      authorName={tab.authorName}
    />
  );
}

/**
 * Loaded PR/CI/issue/commit trees. Memo skips when the center hop only
 * toggles wrapper opacity — `active` stays workspace-scoped so queries
 * do not disable/re-enable (that re-render is the post-load hitch).
 */
export const GithubKeptSurface = React.memo(
  GithubKeptSurfaceImpl,
  githubKeptSurfacePropsAreEqual,
);
GithubKeptSurface.displayName = "GithubKeptSurface";
