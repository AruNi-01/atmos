import type { GithubCenterTab } from "@/features/github/store/use-github-center-tabs";

export type GithubKeptSurfaceProps = {
  tab: GithubCenterTab;
  /** Workspace-active, not pane-visible. Pane hide is CSS on the wrapper. */
  active: boolean;
  onPullRequestChanged?: () => void;
  onCloseTab?: (value: string) => void;
};

export function githubKeptSurfacePropsAreEqual(
  prev: GithubKeptSurfaceProps,
  next: GithubKeptSurfaceProps,
): boolean {
  if (prev.active !== next.active) return false;
  if (prev.onPullRequestChanged !== next.onPullRequestChanged) return false;
  if (prev.onCloseTab !== next.onCloseTab) return false;
  const a = prev.tab;
  const b = next.tab;
  if (a.kind !== b.kind || a.value !== b.value || a.owner !== b.owner || a.repo !== b.repo) {
    return false;
  }
  if (a.kind === "github-pr" && b.kind === "github-pr") {
    return a.branch === b.branch && a.prNumber === b.prNumber;
  }
  if (a.kind === "github-issue" && b.kind === "github-issue") {
    return a.issueNumber === b.issueNumber;
  }
  if (a.kind === "github-action" && b.kind === "github-action") {
    return a.runId === b.runId;
  }
  if (a.kind === "github-commit" && b.kind === "github-commit") {
    return a.sha === b.sha && a.subject === b.subject && a.authorName === b.authorName;
  }
  return false;
}
