import { describe, expect, it } from "bun:test";
import {
  GITHUB_HIDDEN_TIMELINE_EVENTS,
  GITHUB_INLINE_COMMENT_TIMELINE_EVENTS,
  GITHUB_OPENAPI_TIMELINE_EXTRA_EVENTS,
  GITHUB_REST_ISSUE_EVENT_TYPES,
  GITHUB_TIMELINE_CATALOG,
  mapTimelineEvent,
  normalizeTimelineEventName,
  retainVisibleTimelineItems,
} from "../timeline-event-map";

const CTX = { owner: "AruNi-01", repo: "atmos" };

describe("GitHub REST issue-event-types catalog", () => {
  it("locks the official docs heading count", () => {
    expect(GITHUB_REST_ISSUE_EVENT_TYPES).toHaveLength(42);
    expect(GITHUB_OPENAPI_TIMELINE_EXTRA_EVENTS).toHaveLength(17);
    expect(GITHUB_TIMELINE_CATALOG).toHaveLength(59);
    expect(GITHUB_HIDDEN_TIMELINE_EVENTS).toEqual([
      "mentioned",
      "subscribed",
      "unsubscribed",
      "user_blocked",
    ]);
  });

  it("classifies every official event (no raw-name fallback)", () => {
    const omitted = new Set<string>([
      ...GITHUB_HIDDEN_TIMELINE_EVENTS,
      ...GITHUB_INLINE_COMMENT_TIMELINE_EVENTS,
    ]);
    for (const event of GITHUB_TIMELINE_CATALOG) {
      const mapped = mapTimelineEvent({ event }, CTX);
      expect(mapped.canonicalEvent).toBe(event);
      expect(mapped.classification).not.toBeUndefined();
      if (omitted.has(event)) {
        expect(mapped.classification).toBe("omit");
        expect(mapped.copyId).toBeNull();
      } else {
        expect(mapped.classification).not.toBe("omit");
        if (mapped.classification === "activity") {
          expect(mapped.copyId).not.toBeNull();
          expect(mapped.copyId).not.toBe("updatedThis");
        }
      }
    }
  });

  it("omits GitHub-hidden events instead of displaying them", () => {
    for (const event of GITHUB_HIDDEN_TIMELINE_EVENTS) {
      expect(mapTimelineEvent({ event }, CTX).classification).toBe("omit");
    }
    const kept = retainVisibleTimelineItems([
      { event: "labeled" },
      { event: "mentioned" },
      { event: "subscribed" },
      { event: "unsubscribed" },
      { event: "user_blocked" },
      { event: "closed" },
    ]);
    expect(kept.map((item) => item.event)).toEqual(["labeled", "closed"]);
  });

  it("aliases convert_to_draft / converted_to_draft and deployment_status", () => {
    expect(normalizeTimelineEventName("converted_to_draft")).toBe("convert_to_draft");
    expect(mapTimelineEvent({ event: "converted_to_draft" }, CTX)).toMatchObject({
      canonicalEvent: "convert_to_draft",
      classification: "activity",
      copyId: "convertToDraft",
    });
    expect(mapTimelineEvent({ event: "deployment_status" }, CTX)).toMatchObject({
      canonicalEvent: "deployed",
      copyId: "deployed",
    });
  });

  it("maps unknown future events to generic activity, not raw event text", () => {
    const mapped = mapTimelineEvent({ event: "brand_new_event" }, CTX);
    expect(mapped.classification).toBe("activity");
    expect(mapped.copyId).toBe("updatedThis");
  });
});

describe("REST-shaped extra field parsing", () => {
  it("parses PR cross-referenced source.issue.pull_request", () => {
    const mapped = mapTimelineEvent(
      {
        event: "cross-referenced",
        source: {
          type: "issue",
          issue: {
            number: 261,
            title: "chore(deps): bump tar from 0.4.45 to 0.4.46",
            state: "closed",
            html_url: "https://github.com/AruNi-01/atmos/pull/261",
            pull_request: { merged_at: null },
            repository: { full_name: "AruNi-01/atmos" },
          },
        },
      },
      CTX,
    );
    expect(mapped.classification).toBe("cross-referenced");
    expect(mapped.extras.duplicate).toMatchObject({
      kind: "pull_request",
      number: 261,
      title: "chore(deps): bump tar from 0.4.45 to 0.4.46",
      lifecycle: "closed",
    });
  });

  it("parses issue-to-issue cross-referenced without pull_request", () => {
    const mapped = mapTimelineEvent(
      {
        event: "cross-referenced",
        source: {
          issue: {
            number: 64,
            title: "pty leak",
            state: "closed",
            html_url: "https://github.com/AruNi-01/atmos/issues/64",
          },
        },
      },
      CTX,
    );
    expect(mapped.classification).toBe("cross-referenced");
    expect(mapped.extras.duplicate).toMatchObject({
      kind: "issue",
      number: 64,
      lifecycle: "closed",
    });
  });

  it("parses connected with subject only (type/url null)", () => {
    const mapped = mapTimelineEvent(
      {
        event: "connected",
        subject: {
          type: null,
          number: 64,
          title: "pty leak",
          state: "closed",
          merged_at: null,
          draft: null,
          repository: { full_name: "AruNi-01/atmos" },
        },
      },
      CTX,
    );
    expect(mapped.classification).toBe("connected");
    expect(mapped.extras.duplicate).toMatchObject({
      kind: "issue",
      number: 64,
      title: "pty leak",
      lifecycle: "closed",
    });
  });

  it("parses disconnected subject the same way as connected", () => {
    const mapped = mapTimelineEvent(
      {
        event: "disconnected",
        subject: {
          type: "pull_request",
          number: 68,
          title: "fix pty leak",
          state: "merged",
          merged_at: "2026-04-06T08:30:01Z",
          repository: { full_name: "AruNi-01/atmos" },
        },
      },
      CTX,
    );
    expect(mapped.classification).toBe("disconnected");
    expect(mapped.extras.duplicate).toMatchObject({
      kind: "pull_request",
      number: 68,
      lifecycle: "merged",
    });
  });

  it("parses renamed from/to", () => {
    const mapped = mapTimelineEvent(
      {
        event: "renamed",
        rename: { from: "old title", to: "new title" },
      },
      CTX,
    );
    expect(mapped).toMatchObject({
      classification: "activity",
      copyId: "renamed",
      extras: { renameFrom: "old title", renameTo: "new title" },
    });
  });

  it("parses locked lock_reason", () => {
    const mapped = mapTimelineEvent(
      { event: "locked", lock_reason: "off-topic" },
      CTX,
    );
    expect(mapped).toMatchObject({
      classification: "activity",
      copyId: "lockedWithReason",
      extras: { lockReason: "off-topic" },
    });
    expect(mapTimelineEvent({ event: "locked" }, CTX).copyId).toBe("locked");
  });

  it("parses marked_as_duplicate canonical from source.issue", () => {
    const mapped = mapTimelineEvent(
      {
        event: "marked_as_duplicate",
        source: {
          issue: {
            number: 90,
            title: "feat(ui): migrate ScrollArea",
            state: "closed",
            pull_request: { merged_at: "2026-05-01T00:00:00Z" },
          },
        },
      },
      CTX,
    );
    expect(mapped.copyId).toBe("markedAsDuplicate");
    expect(mapped.extras.duplicate).toMatchObject({
      kind: "pull_request",
      number: 90,
      lifecycle: "merged",
    });
  });

  it("parses review_dismissed dismissed_review fields", () => {
    const mapped = mapTimelineEvent(
      {
        event: "review_dismissed",
        dismissed_review: {
          state: "approved",
          review_id: 441,
          dismissal_message: "superseded",
          dismissal_commit_id: "abc1234def",
        },
      },
      CTX,
    );
    expect(mapped).toMatchObject({
      classification: "activity",
      copyId: "reviewDismissed",
      extras: {
        dismissedReviewState: "approved",
        dismissedReviewMessage: "superseded",
        commitSha: "abc1234def",
      },
    });
  });

  it("parses base_ref_changed and head_ref_restored as structured activity", () => {
    expect(mapTimelineEvent({ event: "base_ref_changed" }, CTX)).toMatchObject({
      classification: "activity",
      copyId: "baseRefChanged",
    });
    expect(mapTimelineEvent({ event: "head_ref_restored" }, CTX)).toMatchObject({
      classification: "activity",
      copyId: "headRefRestored",
    });
  });

  it("parses assignee, label, milestone, reviewer, commit, and closed extras", () => {
    expect(
      mapTimelineEvent(
        {
          event: "assigned",
          actor: { login: "alice" },
          assignee: { login: "alice" },
        },
        CTX,
      ).copyId,
    ).toBe("selfAssigned");
    expect(
      mapTimelineEvent(
        {
          event: "labeled",
          label: { name: "bug", color: "d73a4a" },
        },
        CTX,
      ).extras.label,
    ).toEqual({ name: "bug", color: "d73a4a" });
    expect(
      mapTimelineEvent(
        { event: "milestoned", milestone: { title: "v1.0" } },
        CTX,
      ).extras.milestoneTitle,
    ).toBe("v1.0");
    expect(
      mapTimelineEvent(
        {
          event: "review_requested",
          requested_reviewer: { login: "octocat" },
        },
        CTX,
      ).extras.requestedReviewerLogin,
    ).toBe("octocat");
    expect(
      mapTimelineEvent(
        {
          event: "review_requested",
          requested_team: { name: "core", slug: "core" },
        },
        CTX,
      ).extras.requestedReviewerLogin,
    ).toBe("core");
    expect(
      mapTimelineEvent(
        { event: "referenced", commit_id: "deadbeef0123" },
        CTX,
      ).extras.commitSha,
    ).toBe("deadbeef0123");
    expect(
      mapTimelineEvent(
        { event: "merged", commit_id: "cafebabe99" },
        CTX,
      ),
    ).toMatchObject({ copyId: "merged", extras: { commitSha: "cafebabe99" } });
    expect(
      mapTimelineEvent({ event: "closed", state_reason: "not_planned" }, CTX)
        .copyId,
    ).toBe("closedNotPlanned");
    expect(
      mapTimelineEvent(
        {
          event: "committed",
          sha: "aa11bb22cc33",
          message: "fix leak",
        },
        CTX,
      ),
    ).toMatchObject({
      classification: "commit",
      extras: { commitSha: "aa11bb22cc33", commitSubject: "fix leak" },
    });
    expect(
      mapTimelineEvent(
        {
          event: "transferred",
          repository: { full_name: "new-owner/atmos" },
        },
        CTX,
      ),
    ).toMatchObject({
      copyId: "transferred",
      extras: { transferredRepo: "new-owner/atmos" },
    });
  });

  it("parses OpenAPI issue type / sub-issue / parent / blocking extras", () => {
    expect(
      mapTimelineEvent(
        {
          event: "issue_type_added",
          issue_type: { id: 1, name: "Bug", color: "red" },
        },
        CTX,
      ),
    ).toMatchObject({
      classification: "activity",
      copyId: "issueTypeAdded",
      extras: { issueTypeName: "Bug" },
    });
    expect(
      mapTimelineEvent(
        {
          event: "issue_type_changed",
          issue_type: { name: "Feature" },
          prev_issue_type: { name: "Bug" },
        },
        CTX,
      ),
    ).toMatchObject({
      copyId: "issueTypeChanged",
      extras: { issueTypeName: "Feature", prevIssueTypeName: "Bug" },
    });
    expect(
      mapTimelineEvent(
        { event: "issue_type_removed", prev_issue_type: { name: "Task" } },
        CTX,
      ),
    ).toMatchObject({
      copyId: "issueTypeRemoved",
      extras: { issueTypeName: "Task" },
    });
    expect(
      mapTimelineEvent(
        {
          event: "sub_issue_added",
          sub_issue: {
            number: 12,
            title: "child",
            state: "open",
            repository: { full_name: "AruNi-01/atmos" },
          },
        },
        CTX,
      ).extras.relatedIssue,
    ).toMatchObject({ kind: "issue", number: 12, title: "child" });
    expect(
      mapTimelineEvent(
        {
          event: "parent_issue_removed",
          parent_issue: { number: 9, title: "parent", state: "closed" },
        },
        CTX,
      ).copyId,
    ).toBe("parentIssueRemoved");
    expect(
      mapTimelineEvent(
        {
          event: "blocked_by_added",
          blocked_by: { number: 4, title: "blocker", state: "open" },
        },
        CTX,
      ),
    ).toMatchObject({
      copyId: "blockedByAdded",
      extras: { relatedIssue: { number: 4, title: "blocker" } },
    });
    expect(
      mapTimelineEvent(
        {
          event: "blocking_removed",
          blocking: { number: 8, title: "downstream", state: "open" },
        },
        CTX,
      ).copyId,
    ).toBe("blockingRemoved");
  });

  it("parses classic project_card extras", () => {
    const moved = mapTimelineEvent(
      {
        event: "moved_columns_in_project",
        project_card: {
          id: 99,
          project_id: 7,
          column_name: "Done",
          previous_column_name: "In progress",
        },
      },
      CTX,
    );
    expect(moved.copyId).toBe("movedInProject");
    expect(moved.extras).toMatchObject({
      projectColumn: "Done",
      projectPreviousColumn: "In progress",
      projectId: 7,
    });
    expect(
      mapTimelineEvent(
        {
          event: "added_to_project",
          project_card: { column_name: "Todo", project_id: 7 },
        },
        CTX,
      ).copyId,
    ).toBe("addedToProjectColumn");
    expect(
      mapTimelineEvent(
        { event: "removed_from_project", project_card: { column_name: "Todo" } },
        CTX,
      ).copyId,
    ).toBe("removedFromProjectColumn");
    expect(
      mapTimelineEvent({ event: "converted_note_to_issue" }, CTX).copyId,
    ).toBe("convertedNoteToIssue");
    expect(
      mapTimelineEvent({ event: "moved_column_in_project" }, CTX).canonicalEvent,
    ).toBe("moved_columns_in_project");
  });

  it("maps live GitHub payloads from probe issues 269-271", () => {
    const renamed = mapTimelineEvent(
      {
        event: "renamed",
        rename: {
          from: "[probe] timeline mapping A — safe to close",
          to: "[probe] timeline mapping A — renamed",
        },
      },
      CTX,
    );
    expect(renamed.copyId).toBe("renamed");
    expect(renamed.extras.renameTo).toContain("renamed");

    const closed = mapTimelineEvent(
      { event: "closed", state_reason: "not_planned" },
      CTX,
    );
    expect(closed.copyId).toBe("closedNotPlanned");

    const locked = mapTimelineEvent(
      { event: "locked", lock_reason: "off-topic" },
      CTX,
    );
    expect(locked.copyId).toBe("lockedWithReason");

    const fromPr = mapTimelineEvent(
      {
        event: "cross-referenced",
        source: {
          type: "issue",
          issue: {
            number: 271,
            title: "chore: timeline probe for #269 and #270 — close me",
            state: "closed",
            html_url: "https://github.com/AruNi-01/atmos/pull/271",
            pull_request: { merged_at: null },
            repository: { full_name: "AruNi-01/atmos" },
          },
        },
      },
      CTX,
    );
    expect(fromPr.classification).toBe("cross-referenced");
    expect(fromPr.extras.duplicate).toMatchObject({
      kind: "pull_request",
      number: 271,
      lifecycle: "closed",
    });
  });

  it("omits line-commented and commit-commented after parsing comments[]", () => {
    const line = mapTimelineEvent(
      {
        event: "line-commented",
        comments: [{ id: 1 }, { id: 2 }],
      },
      CTX,
    );
    expect(line.classification).toBe("omit");
    expect(line.copyId).toBeNull();
    expect(line.extras.commentCount).toBe(2);

    const commit = mapTimelineEvent(
      {
        event: "commit-commented",
        commit_id: "abc1234",
        comments: [{ id: 9 }],
      },
      CTX,
    );
    expect(commit.classification).toBe("omit");
    expect(commit.copyId).not.toBe("updatedThis");
    expect(commit.extras).toMatchObject({
      commentCount: 1,
      commitSha: "abc1234",
    });
  });
});
