import type { GitCommitCenterTab } from "@/features/git/store/use-git-commit-center-tabs";

export type GitCommitKeptSurfaceProps = {
  tab: GitCommitCenterTab;
  active: boolean;
  onCloseTab?: (value: string) => void;
};

export function gitCommitKeptSurfacePropsAreEqual(
  prev: GitCommitKeptSurfaceProps,
  next: GitCommitKeptSurfaceProps,
): boolean {
  if (prev.active !== next.active) return false;
  if (prev.onCloseTab !== next.onCloseTab) return false;
  const a = prev.tab;
  const b = next.tab;
  return (
    a.value === b.value &&
    a.sha === b.sha &&
    a.subject === b.subject &&
    a.authorName === b.authorName &&
    a.repoPath === b.repoPath &&
    a.owner === b.owner &&
    a.repo === b.repo &&
    a.focusFilePath === b.focusFilePath
  );
}
