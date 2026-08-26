/** Shared helpers for GitHub timeline cross-referenced / connected items. */

export type TimelineRefKind = "issue" | "pull_request";
export type TimelineRefLifecycle = "open" | "closed" | "merged" | "draft";

export type TimelineReference = {
  kind: TimelineRefKind;
  number: number;
  title: string;
  owner: string;
  repo: string;
  url?: string;
  lifecycle: TimelineRefLifecycle;
};

type TimelineRepoLike = {
  full_name?: string;
  name?: string;
  owner?: { login?: string } | string;
};

export type TimelineRefLike = {
  event?: string;
  createdAt?: string;
  created_at?: string;
  source?: {
    type?: string;
    issue?: {
      number?: number;
      title?: string;
      html_url?: string;
      url?: string;
      state?: string;
      draft?: boolean;
      pull_request?: {
        url?: string;
        html_url?: string;
        merged_at?: string | null;
      } | null;
      repository?: TimelineRepoLike;
    };
  };
  subject?: {
    type?: string | null;
    number?: number;
    title?: string;
    state?: string;
    url?: string;
    merged_at?: string | null;
    draft?: boolean | null;
    repository?: TimelineRepoLike;
  };
};

export function isTimelineCrossReferencedItem(item: {
  event?: string;
}): boolean {
  return item.event === "cross-referenced";
}

export function isTimelineConnectedItem(item: { event?: string }): boolean {
  return item.event === "connected" || item.event === "disconnected";
}

function parseOwnerRepo(
  repo: TimelineRepoLike | undefined,
  fallbackOwner: string,
  fallbackRepo: string,
): { owner: string; repo: string } {
  const fullName = repo?.full_name?.trim();
  if (fullName?.includes("/")) {
    const [owner, name] = fullName.split("/");
    if (owner && name) return { owner, repo: name };
  }
  const owner =
    typeof repo?.owner === "string" ? repo.owner : repo?.owner?.login;
  if (owner && repo?.name) return { owner, repo: repo.name };
  return { owner: fallbackOwner, repo: fallbackRepo };
}

function lifecycleFromIssue(
  issue: NonNullable<NonNullable<TimelineRefLike["source"]>["issue"]>,
): TimelineRefLifecycle {
  const state = String(issue.state ?? "").toLowerCase();
  const isPr = Boolean(issue.pull_request);
  if (isPr) {
    if (issue.pull_request?.merged_at || state === "merged") return "merged";
    if (state === "closed") return "closed";
    if (issue.draft) return "draft";
    return "open";
  }
  if (state === "closed") return "closed";
  return "open";
}

function inferSubjectKind(
  subject: NonNullable<TimelineRefLike["subject"]>,
): TimelineRefKind {
  const type = String(subject.type ?? "").toLowerCase();
  if (type === "pull_request" || type === "pr") return "pull_request";
  if (type === "issue") return "issue";
  if (subject.merged_at || String(subject.state).toLowerCase() === "merged") {
    return "pull_request";
  }
  if (subject.draft) return "pull_request";
  const url = subject.url ?? "";
  if (url.includes("/pulls/") || url.includes("/pull/")) return "pull_request";
  return "issue";
}

function lifecycleFromSubject(
  subject: NonNullable<TimelineRefLike["subject"]>,
  kind: TimelineRefKind,
): TimelineRefLifecycle {
  const state = String(subject.state ?? "").toLowerCase();
  if (state === "merged" || subject.merged_at) return "merged";
  if (state === "closed") return "closed";
  if (kind === "pull_request" && subject.draft) return "draft";
  return "open";
}

export function parseTimelineIssueSource(
  issue: NonNullable<NonNullable<TimelineRefLike["source"]>["issue"]> | undefined,
  fallbackOwner: string,
  fallbackRepo: string,
): TimelineReference | null {
  if (!issue?.number) return null;
  const { owner, repo } = parseOwnerRepo(
    issue.repository,
    fallbackOwner,
    fallbackRepo,
  );
  return {
    kind: issue.pull_request ? "pull_request" : "issue",
    number: issue.number,
    title: issue.title ?? "",
    owner,
    repo,
    url: issue.html_url ?? issue.url,
    lifecycle: lifecycleFromIssue(issue),
  };
}

/** Parse the other issue/PR from a GitHub REST timeline event. */
export function getTimelineReference(
  item: TimelineRefLike,
  fallbackOwner: string,
  fallbackRepo: string,
): TimelineReference | null {
  if (item.event === "cross-referenced") {
    return parseTimelineIssueSource(
      item.source?.issue,
      fallbackOwner,
      fallbackRepo,
    );
  }

  if (item.event === "connected" || item.event === "disconnected") {
    const subject = item.subject;
    if (!subject?.number) return null;
    const { owner, repo } = parseOwnerRepo(
      subject.repository,
      fallbackOwner,
      fallbackRepo,
    );
    const kind = inferSubjectKind(subject);
    return {
      kind,
      number: subject.number,
      title: subject.title ?? "",
      owner,
      repo,
      url: subject.url ?? undefined,
      lifecycle: lifecycleFromSubject(subject, kind),
    };
  }

  return null;
}
