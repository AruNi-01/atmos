/**
 * Catalog + parser for GitHub REST issue/timeline events.
 *
 * Source of truth: GitHub docs “Issue event types”
 * (content/rest/using-the-rest-api/issue-event-types.md).
 *
 * Every documented `event` is classified here: structured activity/chrome,
 * or an explicit GitHub-hidden omit. Unknown future events map to a generic
 * "updated this" activity row — never a raw underscore-replaced event name.
 */

import {
  getTimelineReference,
  parseTimelineIssueSource,
  type TimelineRefLike,
  type TimelineReference,
} from "./timeline-refs";

/** Official REST issue-event-types that GitHub.com hides on the conversation. */
export const GITHUB_HIDDEN_TIMELINE_EVENTS = [
  "mentioned",
  "subscribed",
  "unsubscribed",
  "user_blocked",
] as const;

/**
 * Official REST issue-event-types list (github/docs), plus spelling aliases
 * GitHub still emits on `GET .../issues/{n}/timeline`.
 */
export const GITHUB_REST_ISSUE_EVENT_TYPES = [
  "assigned",
  "automatic_base_change_failed",
  "automatic_base_change_succeeded",
  "base_ref_changed",
  "closed",
  "commented",
  "committed",
  "connected",
  "convert_to_draft",
  "converted_to_discussion",
  "cross-referenced",
  "demilestoned",
  "deployed",
  "deployment_environment_changed",
  "disconnected",
  "head_ref_deleted",
  "head_ref_restored",
  "head_ref_force_pushed",
  "labeled",
  "locked",
  "mentioned",
  "marked_as_duplicate",
  "merged",
  "milestoned",
  "pinned",
  "ready_for_review",
  "referenced",
  "renamed",
  "reopened",
  "review_dismissed",
  "review_requested",
  "review_request_removed",
  "reviewed",
  "subscribed",
  "transferred",
  "unassigned",
  "unlabeled",
  "unlocked",
  "unmarked_as_duplicate",
  "unpinned",
  "unsubscribed",
  "user_blocked",
] as const;

export type GithubRestIssueEventType =
  (typeof GITHUB_REST_ISSUE_EVENT_TYPES)[number];

/**
 * Extra `event` values on OpenAPI `timeline-issue-events` (GET
 * `/repos/{owner}/{repo}/issues/{number}/timeline`) that are not headings on
 * the REST “Issue event types” page.
 */
export const GITHUB_OPENAPI_TIMELINE_EXTRA_EVENTS = [
  "issue_type_added",
  "issue_type_changed",
  "issue_type_removed",
  "sub_issue_added",
  "sub_issue_removed",
  "parent_issue_added",
  "parent_issue_removed",
  "blocked_by_added",
  "blocked_by_removed",
  "blocking_added",
  "blocking_removed",
  "line-commented",
  "commit-commented",
  "added_to_project",
  "moved_columns_in_project",
  "removed_from_project",
  "converted_note_to_issue",
] as const;

export const GITHUB_TIMELINE_CATALOG = [
  ...GITHUB_REST_ISSUE_EVENT_TYPES,
  ...GITHUB_OPENAPI_TIMELINE_EXTRA_EVENTS,
] as const;

/** Inline review/commit comments already shown elsewhere; hide as timeline rows. */
export const GITHUB_INLINE_COMMENT_TIMELINE_EVENTS = [
  "line-commented",
  "commit-commented",
] as const;

const HIDDEN_SET = new Set<string>(GITHUB_HIDDEN_TIMELINE_EVENTS);

/** Spellings GitHub emits that are not the canonical docs heading. */
export const GITHUB_TIMELINE_EVENT_ALIASES: Record<string, string> = {
  converted_to_draft: "convert_to_draft",
  deployment_status: "deployed",
  moved_column_in_project: "moved_columns_in_project",
};

export type TimelineEventClassification =
  | "omit"
  | "comment"
  | "review"
  | "commit"
  | "cross-referenced"
  | "connected"
  | "disconnected"
  | "activity";

export type TimelineActivityCopyId =
  | "closed"
  | "closedNotPlanned"
  | "closedDuplicate"
  | "reopened"
  | "assigned"
  | "selfAssigned"
  | "unassigned"
  | "unassignedSelf"
  | "labeled"
  | "unlabeled"
  | "referenced"
  | "milestoned"
  | "demilestoned"
  | "renamed"
  | "locked"
  | "lockedWithReason"
  | "unlocked"
  | "merged"
  | "committed"
  | "forcePushed"
  | "readyForReview"
  | "convertToDraft"
  | "reviewRequested"
  | "reviewRequestRemoved"
  | "reviewDismissed"
  | "reviewApproved"
  | "reviewChangesRequested"
  | "reviewCommented"
  | "deployed"
  | "deploymentEnvironmentChanged"
  | "headRefDeleted"
  | "headRefRestored"
  | "baseRefChanged"
  | "automaticBaseChangeSucceeded"
  | "automaticBaseChangeFailed"
  | "markedAsDuplicate"
  | "unmarkedAsDuplicate"
  | "pinned"
  | "unpinned"
  | "transferred"
  | "convertedToDiscussion"
  | "issueTypeAdded"
  | "issueTypeChanged"
  | "issueTypeRemoved"
  | "subIssueAdded"
  | "subIssueRemoved"
  | "parentIssueAdded"
  | "parentIssueRemoved"
  | "blockedByAdded"
  | "blockedByRemoved"
  | "blockingAdded"
  | "blockingRemoved"
  | "addedToProject"
  | "addedToProjectColumn"
  | "movedInProject"
  | "removedFromProject"
  | "removedFromProjectColumn"
  | "convertedNoteToIssue"
  | "updatedThis";

export type TimelineActivityIconId =
  | "closed"
  | "reopened"
  | "merged"
  | "commit"
  | "referenced"
  | "user"
  | "tag"
  | "eye"
  | "milestone"
  | "edit"
  | "rocket"
  | "branch"
  | "lock"
  | "unlock"
  | "pin"
  | "copy"
  | "transfer"
  | "discussion"
  | "review"
  | "pr";

export type TimelineEventExtras = {
  assigneeLogin?: string;
  label?: { name?: string; color?: string };
  renameFrom?: string;
  renameTo?: string;
  milestoneTitle?: string;
  requestedReviewerLogin?: string;
  lockReason?: string;
  stateReason?: string;
  commitSha?: string;
  commitSubject?: string;
  environment?: string;
  deploymentUrl?: string;
  dismissedReviewState?: string;
  dismissedReviewMessage?: string;
  reviewState?: string;
  transferredRepo?: string;
  duplicate?: TimelineReference | null;
  relatedIssue?: TimelineReference | null;
  isSelfAssignment?: boolean;
  issueTypeName?: string;
  prevIssueTypeName?: string;
  projectColumn?: string;
  projectPreviousColumn?: string;
  projectId?: number;
  commentCount?: number;
};

export type TimelineItemLike = TimelineRefLike & {
  event?: string;
  type?: string;
  body?: string;
  message?: string;
  messageHeadline?: string;
  sha?: string;
  commit_id?: string;
  commit_sha?: string;
  merge_commit_sha?: string;
  state?: string;
  state_reason?: string;
  lock_reason?: string | null;
  assignee?: { login?: string };
  actor?: { login?: string };
  author?: { login?: string; name?: string };
  user?: { login?: string };
  label?: { name?: string; color?: string };
  milestone?: { title?: string };
  rename?: { from?: string; to?: string };
  requested_reviewer?: { login?: string };
  requested_team?: { name?: string; slug?: string };
  dismissed_review?: {
    state?: string;
    review_id?: string | number;
    dismissal_message?: string | null;
    dismissal_commit_id?: string | null;
  };
  deployment?: { environment?: string };
  deployment_status?: { target_url?: string };
  environment?: string;
  repository?: { full_name?: string; name?: string };
  issue_type?: { id?: number; name?: string; color?: string } | null;
  prev_issue_type?: { id?: number; name?: string; color?: string } | null;
  sub_issue?: RelatedIssueLike | null;
  parent_issue?: RelatedIssueLike | null;
  blocked_by?: RelatedIssueLike | null;
  blocking?: RelatedIssueLike | null;
  project_card?: {
    id?: number;
    column_name?: string;
    previous_column_name?: string;
    project_id?: number;
    project_url?: string;
  };
  comments?: unknown[];
};

type RelatedIssueLike = {
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
  repository?: {
    full_name?: string;
    name?: string;
    owner?: { login?: string } | string;
  };
};

export type MappedTimelineEvent = {
  rawEvent: string;
  canonicalEvent: string;
  classification: TimelineEventClassification;
  copyId: TimelineActivityCopyId | null;
  iconId: TimelineActivityIconId;
  extras: TimelineEventExtras;
};

export type MapTimelineEventContext = {
  owner?: string;
  repo?: string;
};

export function normalizeTimelineEventName(event?: string | null): string {
  const raw = String(event ?? "").trim();
  if (!raw) return "";
  return GITHUB_TIMELINE_EVENT_ALIASES[raw] ?? raw;
}

function actorLogin(item: TimelineItemLike): string {
  return (
    item.actor?.login ||
    item.author?.login ||
    item.user?.login ||
    ""
  );
}

function commitSha(item: TimelineItemLike): string {
  return item.sha || item.commit_sha || item.commit_id || item.merge_commit_sha || "";
}

function commitSubject(item: TimelineItemLike): string {
  return item.body || item.message || item.messageHeadline || "";
}

function requestedReviewerLogin(item: TimelineItemLike): string {
  return (
    item.requested_reviewer?.login ||
    item.requested_team?.name ||
    item.requested_team?.slug ||
    ""
  );
}

function duplicateFrom(item: TimelineItemLike, owner: string, repo: string) {
  return parseTimelineIssueSource(item.source?.issue, owner, repo);
}

function parseRelatedIssue(
  ref: RelatedIssueLike | null | undefined,
  owner: string,
  repo: string,
): TimelineReference | null {
  if (!ref?.number) return null;
  return parseTimelineIssueSource(ref, owner, repo);
}

function fillProjectCard(
  extras: TimelineEventExtras,
  item: TimelineItemLike,
) {
  extras.projectColumn = item.project_card?.column_name ?? undefined;
  extras.projectPreviousColumn =
    item.project_card?.previous_column_name ?? undefined;
  extras.projectId = item.project_card?.project_id ?? undefined;
}

/**
 * Pure mapping of a GitHub REST timeline item. Safe to call from tests with
 * fixture JSON — no React, no i18n.
 */
export function mapTimelineEvent(
  item: TimelineItemLike,
  context: MapTimelineEventContext = {},
): MappedTimelineEvent {
  const rawEvent = String(item.event ?? item.type ?? "").trim();
  const canonicalEvent = normalizeTimelineEventName(rawEvent);
  const owner = context.owner ?? "";
  const repo = context.repo ?? "";
  const extras: TimelineEventExtras = {};

  const mapped = (
    classification: TimelineEventClassification,
    copyId: TimelineActivityCopyId | null,
    iconId: TimelineActivityIconId,
  ): MappedTimelineEvent => ({
    rawEvent,
    canonicalEvent,
    classification,
    copyId,
    iconId,
    extras,
  });

  if (!canonicalEvent) {
    return mapped("activity", "updatedThis", "edit");
  }

  if (HIDDEN_SET.has(canonicalEvent)) {
    return mapped("omit", null, "edit");
  }

  switch (canonicalEvent) {
    case "commented":
      return mapped("comment", null, "discussion");
    case "committed":
      extras.commitSha = commitSha(item);
      extras.commitSubject = commitSubject(item);
      return mapped("commit", "committed", "commit");
    case "cross-referenced":
      extras.duplicate = duplicateFrom(item, owner, repo);
      return mapped("cross-referenced", null, "referenced");
    case "connected":
    case "disconnected":
      extras.duplicate = getTimelineReference(item, owner, repo);
      return mapped(
        canonicalEvent === "disconnected" ? "disconnected" : "connected",
        null,
        "referenced",
      );
    case "reviewed": {
      extras.reviewState = String(item.state ?? "").toUpperCase();
      extras.commitSha = commitSha(item);
      if (extras.reviewState === "APPROVED") {
        return mapped("review", "reviewApproved", "review");
      }
      if (extras.reviewState === "CHANGES_REQUESTED") {
        return mapped("review", "reviewChangesRequested", "review");
      }
      return mapped("review", "reviewCommented", "review");
    }
    case "closed": {
      extras.stateReason = item.state_reason ?? undefined;
      extras.commitSha = commitSha(item);
      extras.commitSubject = commitSubject(item);
      const reason = String(item.state_reason ?? "").toLowerCase();
      if (reason === "not_planned") {
        return mapped("activity", "closedNotPlanned", "closed");
      }
      if (reason === "duplicate") {
        extras.duplicate = duplicateFrom(item, owner, repo);
        return mapped("activity", "closedDuplicate", "closed");
      }
      return mapped("activity", "closed", "closed");
    }
    case "reopened":
      extras.stateReason = item.state_reason ?? undefined;
      return mapped("activity", "reopened", "reopened");
    case "assigned":
    case "unassigned": {
      extras.assigneeLogin = item.assignee?.login ?? "";
      extras.isSelfAssignment = Boolean(
        extras.assigneeLogin && extras.assigneeLogin === actorLogin(item),
      );
      if (canonicalEvent === "assigned") {
        return mapped(
          "activity",
          extras.isSelfAssignment ? "selfAssigned" : "assigned",
          "user",
        );
      }
      return mapped(
        "activity",
        extras.isSelfAssignment ? "unassignedSelf" : "unassigned",
        "user",
      );
    }
    case "labeled":
    case "unlabeled":
      extras.label = item.label
        ? { name: item.label.name, color: item.label.color }
        : undefined;
      return mapped(
        "activity",
        canonicalEvent === "labeled" ? "labeled" : "unlabeled",
        "tag",
      );
    case "referenced":
      extras.commitSha = commitSha(item);
      extras.commitSubject = commitSubject(item);
      return mapped("activity", "referenced", "referenced");
    case "milestoned":
    case "demilestoned":
      extras.milestoneTitle = item.milestone?.title ?? "";
      return mapped(
        "activity",
        canonicalEvent === "milestoned" ? "milestoned" : "demilestoned",
        "milestone",
      );
    case "renamed":
      extras.renameFrom = item.rename?.from ?? "";
      extras.renameTo = item.rename?.to ?? "";
      return mapped("activity", "renamed", "edit");
    case "locked": {
      extras.lockReason = item.lock_reason ?? undefined;
      return mapped(
        "activity",
        extras.lockReason ? "lockedWithReason" : "locked",
        "lock",
      );
    }
    case "unlocked":
      extras.lockReason = item.lock_reason ?? undefined;
      return mapped("activity", "unlocked", "unlock");
    case "merged":
      extras.commitSha = commitSha(item);
      extras.commitSubject = commitSubject(item);
      return mapped("activity", "merged", "merged");
    case "head_ref_force_pushed":
      extras.commitSha = commitSha(item);
      return mapped("activity", "forcePushed", "commit");
    case "head_ref_deleted":
      return mapped("activity", "headRefDeleted", "branch");
    case "head_ref_restored":
      return mapped("activity", "headRefRestored", "branch");
    case "base_ref_changed":
      return mapped("activity", "baseRefChanged", "branch");
    case "automatic_base_change_succeeded":
      return mapped("activity", "automaticBaseChangeSucceeded", "branch");
    case "automatic_base_change_failed":
      return mapped("activity", "automaticBaseChangeFailed", "branch");
    case "ready_for_review":
      return mapped("activity", "readyForReview", "eye");
    case "convert_to_draft":
      return mapped("activity", "convertToDraft", "pr");
    case "review_requested":
    case "review_request_removed":
      extras.requestedReviewerLogin = requestedReviewerLogin(item);
      return mapped(
        "activity",
        canonicalEvent === "review_requested"
          ? "reviewRequested"
          : "reviewRequestRemoved",
        "eye",
      );
    case "review_dismissed":
      extras.dismissedReviewState = item.dismissed_review?.state ?? undefined;
      extras.dismissedReviewMessage =
        item.dismissed_review?.dismissal_message ?? undefined;
      extras.commitSha =
        item.dismissed_review?.dismissal_commit_id || commitSha(item) || "";
      return mapped("activity", "reviewDismissed", "eye");
    case "deployed":
      extras.environment =
        item.deployment?.environment || item.environment || "";
      extras.deploymentUrl = item.deployment_status?.target_url ?? undefined;
      extras.commitSha = commitSha(item);
      return mapped("activity", "deployed", "rocket");
    case "deployment_environment_changed":
      extras.environment =
        item.deployment?.environment || item.environment || "";
      extras.deploymentUrl = item.deployment_status?.target_url ?? undefined;
      return mapped("activity", "deploymentEnvironmentChanged", "rocket");
    case "marked_as_duplicate":
      extras.duplicate = duplicateFrom(item, owner, repo);
      return mapped("activity", "markedAsDuplicate", "copy");
    case "unmarked_as_duplicate":
      extras.duplicate = duplicateFrom(item, owner, repo);
      return mapped("activity", "unmarkedAsDuplicate", "copy");
    case "pinned":
      return mapped("activity", "pinned", "pin");
    case "unpinned":
      return mapped("activity", "unpinned", "pin");
    case "transferred":
      extras.transferredRepo =
        item.repository?.full_name || item.repository?.name || "";
      return mapped("activity", "transferred", "transfer");
    case "converted_to_discussion":
      return mapped("activity", "convertedToDiscussion", "discussion");
    case "issue_type_added":
      extras.issueTypeName = item.issue_type?.name ?? "";
      return mapped("activity", "issueTypeAdded", "tag");
    case "issue_type_changed":
      extras.issueTypeName = item.issue_type?.name ?? "";
      extras.prevIssueTypeName = item.prev_issue_type?.name ?? "";
      return mapped("activity", "issueTypeChanged", "tag");
    case "issue_type_removed":
      extras.issueTypeName =
        item.prev_issue_type?.name || item.issue_type?.name || "";
      return mapped("activity", "issueTypeRemoved", "tag");
    case "sub_issue_added":
      extras.relatedIssue = parseRelatedIssue(item.sub_issue, owner, repo);
      return mapped("activity", "subIssueAdded", "referenced");
    case "sub_issue_removed":
      extras.relatedIssue = parseRelatedIssue(item.sub_issue, owner, repo);
      return mapped("activity", "subIssueRemoved", "referenced");
    case "parent_issue_added":
      extras.relatedIssue = parseRelatedIssue(item.parent_issue, owner, repo);
      return mapped("activity", "parentIssueAdded", "referenced");
    case "parent_issue_removed":
      extras.relatedIssue = parseRelatedIssue(item.parent_issue, owner, repo);
      return mapped("activity", "parentIssueRemoved", "referenced");
    case "blocked_by_added":
      extras.relatedIssue = parseRelatedIssue(item.blocked_by, owner, repo);
      return mapped("activity", "blockedByAdded", "referenced");
    case "blocked_by_removed":
      extras.relatedIssue = parseRelatedIssue(item.blocked_by, owner, repo);
      return mapped("activity", "blockedByRemoved", "referenced");
    case "blocking_added":
      extras.relatedIssue = parseRelatedIssue(item.blocking, owner, repo);
      return mapped("activity", "blockingAdded", "referenced");
    case "blocking_removed":
      extras.relatedIssue = parseRelatedIssue(item.blocking, owner, repo);
      return mapped("activity", "blockingRemoved", "referenced");
    case "added_to_project":
      fillProjectCard(extras, item);
      return mapped(
        "activity",
        extras.projectColumn ? "addedToProjectColumn" : "addedToProject",
        "pin",
      );
    case "moved_columns_in_project":
      fillProjectCard(extras, item);
      return mapped("activity", "movedInProject", "pin");
    case "removed_from_project":
      fillProjectCard(extras, item);
      return mapped(
        "activity",
        extras.projectColumn ? "removedFromProjectColumn" : "removedFromProject",
        "pin",
      );
    case "converted_note_to_issue":
      fillProjectCard(extras, item);
      return mapped("activity", "convertedNoteToIssue", "discussion");
    case "line-commented":
    case "commit-commented":
      extras.commentCount = Array.isArray(item.comments) ? item.comments.length : 0;
      extras.commitSha = commitSha(item);
      return mapped("omit", null, "review");
    default:
      return mapped("activity", "updatedThis", "edit");
  }
}

export function isOmittedTimelineEvent(item: TimelineItemLike): boolean {
  return mapTimelineEvent(item).classification === "omit";
}

export function retainVisibleTimelineItems<T extends TimelineItemLike>(
  items: T[],
): T[] {
  return items.filter((item) => !isOmittedTimelineEvent(item));
}

export function isReferenceTimelineClassification(
  classification: TimelineEventClassification,
): classification is "cross-referenced" | "connected" | "disconnected" {
  return (
    classification === "cross-referenced" ||
    classification === "connected" ||
    classification === "disconnected"
  );
}
