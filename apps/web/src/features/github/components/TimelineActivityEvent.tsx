"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import type { Locale } from "date-fns";
import {
  Copy,
  Edit2,
  ExternalLink,
  Eye,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Lock,
  MessageSquare,
  Milestone,
  Pin,
  Rocket,
  RotateCw,
  Tag,
  Unlock,
  User,
  ArrowRightLeft,
  XCircle,
} from "lucide-react";
import { GithubUserAvatar } from "@/features/github/components/GithubUserHoverCard";
import { useOpenGithubCenterTab } from "@/features/github/hooks/use-open-github-center-tab";
import type {
  MappedTimelineEvent,
  TimelineActivityCopyId,
  TimelineActivityIconId,
} from "@/features/github/lib/timeline-event-map";

const timelineIconRailClass =
  "z-10 flex w-8 shrink-0 items-center justify-center";
const timelineIconShellClass =
  "flex size-5 items-center justify-center rounded-full border border-border/50 bg-muted ring-4 ring-background";
const timelineIconClass = "size-3 text-muted-foreground";

function ActivityIcon({ id }: { id: TimelineActivityIconId }) {
  switch (id) {
    case "closed":
      return <XCircle className={timelineIconClass} />;
    case "reopened":
      return <RotateCw className={timelineIconClass} />;
    case "merged":
      return <GitMerge className={timelineIconClass} />;
    case "commit":
      return <GitCommit className={timelineIconClass} />;
    case "referenced":
      return <ExternalLink className={timelineIconClass} />;
    case "user":
      return <User className={timelineIconClass} />;
    case "tag":
      return <Tag className={timelineIconClass} />;
    case "eye":
      return <Eye className={timelineIconClass} />;
    case "milestone":
      return <Milestone className={timelineIconClass} />;
    case "rocket":
      return <Rocket className={timelineIconClass} />;
    case "branch":
      return <GitBranch className={timelineIconClass} />;
    case "lock":
      return <Lock className={timelineIconClass} />;
    case "unlock":
      return <Unlock className={timelineIconClass} />;
    case "pin":
      return <Pin className={timelineIconClass} />;
    case "copy":
      return <Copy className={timelineIconClass} />;
    case "transfer":
      return <ArrowRightLeft className={timelineIconClass} />;
    case "discussion":
    case "review":
      return <MessageSquare className={timelineIconClass} />;
    case "pr":
      return <GitPullRequest className={timelineIconClass} />;
    case "edit":
    default:
      return <Edit2 className={timelineIconClass} />;
  }
}

function lockReasonLabel(
  reason: string | undefined,
  t: ReturnType<typeof useTranslations<"github.timeline">>,
): string {
  switch (reason) {
    case "off-topic":
      return t("lockReasons.offTopic");
    case "too heated":
      return t("lockReasons.tooHeated");
    case "resolved":
      return t("lockReasons.resolved");
    case "spam":
      return t("lockReasons.spam");
    default:
      return reason || "";
  }
}

function activityCopy(
  copyId: TimelineActivityCopyId,
  mapped: MappedTimelineEvent,
  t: ReturnType<typeof useTranslations<"github.timeline">>,
): string {
  const extras = mapped.extras;
  const someone = t("someone");
  const lockReason = lockReasonLabel(extras.lockReason, t);
  switch (copyId) {
    case "closed":
      return t("events.closed");
    case "closedNotPlanned":
      return t("events.closedNotPlanned");
    case "closedDuplicate":
      return t("events.closedDuplicate");
    case "reopened":
      return t("events.reopened");
    case "assigned":
      return t("events.assigned", { login: extras.assigneeLogin || someone });
    case "selfAssigned":
      return t("events.selfAssigned");
    case "unassigned":
      return t("events.unassigned", { login: extras.assigneeLogin || someone });
    case "unassignedSelf":
      return t("events.unassignedSelf");
    case "labeled":
      return t("events.labeled");
    case "unlabeled":
      return t("events.unlabeled");
    case "referenced":
      return t("events.referenced");
    case "milestoned":
      return t("events.milestoned", { title: extras.milestoneTitle || "" });
    case "demilestoned":
      return t("events.demilestoned", { title: extras.milestoneTitle || "" });
    case "renamed":
      return t("events.renamed", {
        from: extras.renameFrom || "",
        to: extras.renameTo || "",
      });
    case "locked":
      return t("events.locked");
    case "lockedWithReason":
      return t("events.lockedWithReason", { reason: lockReason });
    case "unlocked":
      return t("events.unlocked");
    case "merged":
      return t("events.merged");
    case "committed":
      return t("events.committed");
    case "forcePushed":
      return t("events.forcePushed");
    case "readyForReview":
      return t("events.readyForReview");
    case "convertToDraft":
      return t("events.convertToDraft");
    case "reviewRequested":
      return t("events.reviewRequested", {
        login: extras.requestedReviewerLogin || someone,
      });
    case "reviewRequestRemoved":
      return t("events.reviewRequestRemoved", {
        login: extras.requestedReviewerLogin || someone,
      });
    case "reviewDismissed":
      return t("events.reviewDismissed");
    case "reviewApproved":
      return t("events.reviewApproved");
    case "reviewChangesRequested":
      return t("events.reviewChangesRequested");
    case "reviewCommented":
      return t("events.reviewCommented");
    case "deployed":
      return t("events.deployed");
    case "deploymentEnvironmentChanged":
      return t("events.deploymentEnvironmentChanged");
    case "headRefDeleted":
      return t("events.headRefDeleted");
    case "headRefRestored":
      return t("events.headRefRestored");
    case "baseRefChanged":
      return t("events.baseRefChanged");
    case "automaticBaseChangeSucceeded":
      return t("events.automaticBaseChangeSucceeded");
    case "automaticBaseChangeFailed":
      return t("events.automaticBaseChangeFailed");
    case "markedAsDuplicate":
      return t("events.markedAsDuplicate");
    case "unmarkedAsDuplicate":
      return t("events.unmarkedAsDuplicate");
    case "pinned":
      return t("events.pinned");
    case "unpinned":
      return t("events.unpinned");
    case "transferred":
      return extras.transferredRepo
        ? t("events.transferredTo", { repo: extras.transferredRepo })
        : t("events.transferred");
    case "convertedToDiscussion":
      return t("events.convertedToDiscussion");
    case "issueTypeAdded":
      return t("events.issueTypeAdded", { name: extras.issueTypeName || "" });
    case "issueTypeChanged":
      return t("events.issueTypeChanged", {
        from: extras.prevIssueTypeName || "",
        to: extras.issueTypeName || "",
      });
    case "issueTypeRemoved":
      return t("events.issueTypeRemoved", { name: extras.issueTypeName || "" });
    case "subIssueAdded":
      return t("events.subIssueAdded");
    case "subIssueRemoved":
      return t("events.subIssueRemoved");
    case "parentIssueAdded":
      return t("events.parentIssueAdded");
    case "parentIssueRemoved":
      return t("events.parentIssueRemoved");
    case "blockedByAdded":
      return t("events.blockedByAdded");
    case "blockedByRemoved":
      return t("events.blockedByRemoved");
    case "blockingAdded":
      return t("events.blockingAdded");
    case "blockingRemoved":
      return t("events.blockingRemoved");
    case "addedToProject":
      return t("events.addedToProject");
    case "addedToProjectColumn":
      return t("events.addedToProjectColumn", {
        column: extras.projectColumn || "",
      });
    case "movedInProject":
      return extras.projectPreviousColumn && extras.projectColumn
        ? t("events.movedInProjectFromTo", {
            from: extras.projectPreviousColumn,
            to: extras.projectColumn,
          })
        : t("events.movedInProject");
    case "removedFromProject":
      return t("events.removedFromProject");
    case "removedFromProjectColumn":
      return t("events.removedFromProjectColumn", {
        column: extras.projectColumn || "",
      });
    case "convertedNoteToIssue":
      return t("events.convertedNoteToIssue");
    case "updatedThis":
    default:
      return t("events.updatedThis");
  }
}

export function TimelineActivityEvent({
  mapped,
  actorLogin,
  actorAvatarUrl,
  isBot,
  locale,
  createdAt,
  baseRefName,
  onCommitClick,
  footer,
}: {
  mapped: MappedTimelineEvent;
  actorLogin?: string;
  actorAvatarUrl?: string;
  isBot?: boolean;
  locale: Locale;
  createdAt?: string;
  baseRefName?: string;
  onCommitClick?: (payload: {
    sha: string;
    subject: string;
    authorName: string;
  }) => void;
  footer?: React.ReactNode;
}) {
  const t = useTranslations("github.timeline");
  const { openPullRequestTab, openIssueTab } = useOpenGithubCenterTab();
  const copyId = mapped.copyId ?? "updatedThis";
  const text = activityCopy(copyId, mapped, t);
  const extras = mapped.extras;
  const time = createdAt
    ? formatDistanceToNow(new Date(createdAt), { addSuffix: true, locale })
    : "";
  const sha = extras.commitSha;
  const shortSha = sha ? sha.slice(0, 7) : "";
  const login = actorLogin || t("unknownUser");
  const openCommit = sha && onCommitClick
    ? () =>
        onCommitClick({
          sha,
          subject: extras.commitSubject || shortSha,
          authorName: login,
        })
    : undefined;
  const duplicate = extras.duplicate ?? extras.relatedIssue;

  return (
    <div className="relative flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <div className={timelineIconRailClass}>
          <div className={timelineIconShellClass}>
            <ActivityIcon id={mapped.iconId} />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
          <GithubUserAvatar
            username={actorLogin}
            avatarUrl={actorAvatarUrl}
            disabled={isBot}
            className="size-5 shrink-0 border border-border/50"
            fallbackClassName="text-[7px]"
            label={login}
            labelClassName="font-semibold text-foreground/90"
          />
          {isBot ? (
            <span className="flex h-3.5 shrink-0 items-center rounded-sm border border-border bg-muted/50 px-1 text-[9px] font-medium leading-none text-muted-foreground">
              {t("bot")}
            </span>
          ) : null}
          <span className="min-w-0 truncate text-muted-foreground">{text}</span>
          {extras.label?.name ? (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: extras.label.color
                  ? `#${extras.label.color.replace(/^#/, "")}20`
                  : undefined,
                color: extras.label.color
                  ? `#${extras.label.color.replace(/^#/, "")}`
                  : undefined,
                border: extras.label.color
                  ? `1px solid #${extras.label.color.replace(/^#/, "")}40`
                  : "1px solid var(--border)",
              }}
            >
              {extras.label.name}
            </span>
          ) : null}
          {extras.environment ? (
            <span className="shrink-0 font-bold text-foreground/80">
              {extras.environment}
            </span>
          ) : null}
          {copyId === "merged" && baseRefName ? (
            <span className="shrink-0 text-muted-foreground">
              {t("events.intoBase")}{" "}
              <span className="font-semibold text-foreground/80">{baseRefName}</span>
            </span>
          ) : null}
          {openCommit && sha ? (
            <button
              type="button"
              onClick={openCommit}
              className="shrink-0 rounded bg-muted/50 px-1 font-mono hover:bg-muted hover:text-foreground"
            >
              {shortSha}
            </button>
          ) : null}
          {openCommit && extras.commitSubject && copyId === "referenced" ? (
            <button
              type="button"
              onClick={openCommit}
              className="min-w-0 max-w-[280px] truncate text-left font-medium text-foreground/70 hover:text-foreground hover:underline hover:underline-offset-2"
            >
              {extras.commitSubject}
            </button>
          ) : null}
          {extras.deploymentUrl ? (
            <a
              href={extras.deploymentUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-1 inline-flex shrink-0 items-center gap-1 rounded border border-border/40 bg-muted px-1.5 py-0.5 hover:bg-muted-foreground/20"
            >
              {t("events.viewDeployment")} <ExternalLink className="size-2.5" />
            </a>
          ) : null}
          {time ? (
            <span className="ml-auto whitespace-nowrap text-muted-foreground/60">
              {time}
            </span>
          ) : null}
        </div>
      </div>
      {extras.dismissedReviewMessage ? (
        <p className="ml-11 truncate text-xs text-muted-foreground/80">
          {extras.dismissedReviewMessage}
        </p>
      ) : null}
      {duplicate ? (
        <button
          type="button"
          onClick={() => {
            if (duplicate.kind === "pull_request") {
              openPullRequestTab({
                owner: duplicate.owner,
                repo: duplicate.repo,
                prNumber: duplicate.number,
                branch: "",
                title: duplicate.title,
              });
              return;
            }
            openIssueTab({
              owner: duplicate.owner,
              repo: duplicate.repo,
              issueNumber: duplicate.number,
              title: duplicate.title,
            });
          }}
          className="ml-11 min-w-0 truncate text-left text-[13px] font-medium text-foreground underline decoration-border underline-offset-2 hover:text-primary"
        >
          {duplicate.title || t("untitled")} #{duplicate.number}
        </button>
      ) : null}
      {footer}
    </div>
  );
}
