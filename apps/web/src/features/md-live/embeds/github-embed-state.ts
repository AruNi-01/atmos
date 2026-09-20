export type GithubIssueEmbedState = "open" | "closed";
export type GithubPrEmbedState = "open" | "draft" | "merged" | "closed";

export function githubIssueStateOf(raw: string | undefined): GithubIssueEmbedState {
  return raw?.toLowerCase() === "closed" ? "closed" : "open";
}

export function githubPrStateOf(raw: string | undefined, isDraft: boolean): GithubPrEmbedState {
  const state = raw?.toLowerCase() ?? "open";
  if (state === "merged") return "merged";
  if (state === "closed") return "closed";
  if (isDraft) return "draft";
  return "open";
}

export function githubIssueBadgeClass(state: GithubIssueEmbedState): string {
  return state === "closed"
    ? "bg-purple-500/10 text-purple-500 border-purple-500/20"
    : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
}

export function githubPrBadgeClass(state: GithubPrEmbedState): string {
  if (state === "merged") return "bg-purple-500/10 text-purple-500 border-purple-500/20";
  if (state === "closed") return "bg-red-500/10 text-red-500 border-red-500/20";
  if (state === "draft") return "bg-muted text-muted-foreground border-border/60";
  return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
}
