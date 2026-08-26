"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import type { Locale } from "date-fns";
import {
  CheckCircle2,
  CircleDot,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Link2,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { GithubUserAvatar } from "@/features/github/components/GithubUserHoverCard";
import { useOpenGithubCenterTab } from "@/features/github/hooks/use-open-github-center-tab";
import {
  getTimelineReference,
  type TimelineRefKind,
  type TimelineRefLifecycle,
  type TimelineRefLike,
  type TimelineReference,
} from "@/features/github/lib/timeline-refs";

const timelineIconRailClass =
  "z-10 flex w-8 shrink-0 items-center justify-center";
const timelineIconShellClass =
  "flex size-5 items-center justify-center rounded-full border border-border/50 bg-muted ring-4 ring-background";
const timelineIconClass = "size-3 text-muted-foreground";

function lifecycleIcon(
  kind: TimelineRefKind,
  lifecycle: TimelineRefLifecycle,
  className: string,
) {
  if (kind === "pull_request") {
    if (lifecycle === "merged") return <GitMerge className={className} />;
    if (lifecycle === "closed") return <GitPullRequestClosed className={className} />;
    if (lifecycle === "draft") return <GitPullRequestDraft className={className} />;
    return <GitPullRequest className={className} />;
  }
  if (lifecycle === "closed") return <CheckCircle2 className={className} />;
  return <CircleDot className={className} />;
}

function lifecycleBadgeClass(
  kind: TimelineRefKind,
  lifecycle: TimelineRefLifecycle,
): string {
  if (lifecycle === "merged") return "bg-purple-600 text-white";
  if (lifecycle === "draft") return "bg-muted text-muted-foreground";
  if (lifecycle === "closed") {
    return kind === "pull_request"
      ? "bg-red-600 text-white"
      : "bg-purple-600 text-white";
  }
  return "bg-emerald-600 text-white";
}

function lifecycleLabel(
  lifecycle: TimelineRefLifecycle,
  t: ReturnType<typeof useTranslations<"github.timeline">>,
): string {
  if (lifecycle === "merged") return t("states.merged");
  if (lifecycle === "draft") return t("states.draft");
  if (lifecycle === "closed") return t("states.closed");
  return t("states.open");
}

function TimelineReferenceRow({
  reference,
  currentOwner,
  currentRepo,
  onOpen,
}: {
  reference: TimelineReference;
  currentOwner: string;
  currentRepo: string;
  onOpen: () => void;
}) {
  const t = useTranslations("github.timeline");
  const title = reference.title.trim() || t("untitled");
  const sameRepo =
    reference.owner === currentOwner && reference.repo === currentRepo;
  const numberLabel = sameRepo
    ? `#${reference.number}`
    : `${reference.owner}/${reference.repo}#${reference.number}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-muted/60"
    >
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-foreground underline decoration-border underline-offset-2">
          {title}
        </span>{" "}
        <span className="text-muted-foreground">{numberLabel}</span>
      </span>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
          lifecycleBadgeClass(reference.kind, reference.lifecycle),
        )}
      >
        {lifecycleIcon(
          reference.kind,
          reference.lifecycle,
          "size-2.5",
        )}
        {lifecycleLabel(reference.lifecycle, t)}
      </span>
    </button>
  );
}

export function TimelineReferencesEvent<T extends TimelineRefLike>({
  event,
  items,
  owner,
  repo,
  locale,
  actorLogin,
  actorAvatarUrl,
}: {
  event: "cross-referenced" | "connected" | "disconnected";
  items: T[];
  owner: string;
  repo: string;
  locale: Locale;
  actorLogin?: string;
  actorAvatarUrl?: string;
}) {
  const t = useTranslations("github.timeline");
  const { openPullRequestTab, openIssueTab } = useOpenGithubCenterTab();
  const references = items
    .map((item) => getTimelineReference(item, owner, repo))
    .filter((ref): ref is TimelineReference => Boolean(ref));
  if (references.length === 0) return null;

  const last = items[items.length - 1] ?? items[0];
  const timeValue = last?.createdAt || last?.created_at || "";
  const time = timeValue
    ? formatDistanceToNow(new Date(timeValue), { addSuffix: true, locale })
    : "";
  const firstKind = references[0]?.kind ?? "issue";
  const header =
    event === "cross-referenced"
      ? t("thisWasReferenced")
      : event === "disconnected"
        ? firstKind === "pull_request"
          ? t("unlinkedPullRequest")
          : t("unlinkedIssue")
        : firstKind === "pull_request"
          ? t("linkedPullRequest")
          : t("linkedIssue");

  const openReference = (reference: TimelineReference) => {
    if (reference.kind === "pull_request") {
      openPullRequestTab({
        owner: reference.owner,
        repo: reference.repo,
        prNumber: reference.number,
        branch: "",
        title: reference.title,
      });
      return;
    }
    openIssueTab({
      owner: reference.owner,
      repo: reference.repo,
      issueNumber: reference.number,
      title: reference.title,
    });
  };

  return (
    <div className="relative flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <div className={timelineIconRailClass}>
          <div className={timelineIconShellClass}>
            <Link2 className={timelineIconClass} />
          </div>
        </div>
        {event !== "cross-referenced" && actorLogin ? (
          <GithubUserAvatar
            username={actorLogin}
            avatarUrl={actorAvatarUrl}
            className="size-5 shrink-0 border border-border/50"
            fallbackClassName="text-[7px]"
            label={actorLogin}
            labelClassName="font-semibold text-foreground/90"
          />
        ) : null}
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {header}
        </span>
        {time ? (
          <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground/60">
            {time}
          </span>
        ) : null}
      </div>
      <div className="ml-11 flex flex-col gap-0.5">
        {references.map((reference, index) => (
          <TimelineReferenceRow
            key={`${reference.kind}:${reference.owner}/${reference.repo}#${reference.number}-${index}`}
            reference={reference}
            currentOwner={owner}
            currentRepo={repo}
            onOpen={() => openReference(reference)}
          />
        ))}
      </div>
    </div>
  );
}
