"use client";

import React from "react";
import dynamic from "next/dynamic";
import {
  gitCommitKeptSurfacePropsAreEqual,
  type GitCommitKeptSurfaceProps,
} from "@/app-shell/git-commit-kept-surface-equality";

export { gitCommitKeptSurfacePropsAreEqual };
export type { GitCommitKeptSurfaceProps };

const GitCommitDiffView = dynamic(
  () =>
    import("@/features/git/components/GitCommitDiffView").then(
      (mod) => mod.GitCommitDiffView,
    ),
  { ssr: false },
);

function GitCommitKeptSurfaceImpl({
  tab,
  active,
  onCloseTab,
}: GitCommitKeptSurfaceProps) {
  const onRequestClose = React.useCallback(() => {
    onCloseTab?.(tab.value);
  }, [onCloseTab, tab.value]);

  return (
    <GitCommitDiffView
      active={active}
      onRequestClose={onRequestClose}
      sha={tab.sha}
      subject={tab.subject}
      authorName={tab.authorName}
      repoPath={tab.repoPath}
      timestamp={tab.timestamp}
      owner={tab.owner}
      repo={tab.repo}
      focusFilePath={tab.focusFilePath}
    />
  );
}

export const GitCommitKeptSurface = React.memo(
  GitCommitKeptSurfaceImpl,
  gitCommitKeptSurfacePropsAreEqual,
);
GitCommitKeptSurface.displayName = "GitCommitKeptSurface";
