import { describe, expect, it } from "bun:test";
import {
  getTimelineReference,
  isTimelineConnectedItem,
  isTimelineCrossReferencedItem,
} from "../timeline-refs";

describe("getTimelineReference", () => {
  it("parses a PR that mentioned the current item (REST cross-referenced)", () => {
    const ref = getTimelineReference(
      {
        event: "cross-referenced",
        source: {
          type: "issue",
          issue: {
            number: 261,
            title: "chore(deps): bump tar from 0.4.45 to 0.4.46",
            html_url: "https://github.com/AruNi-01/atmos/pull/261",
            state: "closed",
            pull_request: { merged_at: null },
            repository: { full_name: "AruNi-01/atmos" },
          },
        },
      },
      "AruNi-01",
      "atmos",
    );
    expect(ref).toMatchObject({
      kind: "pull_request",
      number: 261,
      title: "chore(deps): bump tar from 0.4.45 to 0.4.46",
      owner: "AruNi-01",
      repo: "atmos",
      lifecycle: "closed",
    });
  });

  it("treats a merged PR source as merged via pull_request.merged_at", () => {
    const ref = getTimelineReference(
      {
        event: "cross-referenced",
        source: {
          issue: {
            number: 107,
            title: "feat: implement Terminal Canvas",
            state: "closed",
            pull_request: { merged_at: "2026-05-13T13:48:08Z" },
          },
        },
      },
      "AruNi-01",
      "atmos",
    );
    expect(ref?.kind).toBe("pull_request");
    expect(ref?.lifecycle).toBe("merged");
  });

  it("parses an issue-to-issue mention (no pull_request field)", () => {
    const ref = getTimelineReference(
      {
        event: "cross-referenced",
        source: {
          issue: {
            number: 64,
            title: "pty leak",
            html_url: "https://github.com/AruNi-01/atmos/issues/64",
            state: "closed",
          },
        },
      },
      "AruNi-01",
      "atmos",
    );
    expect(ref).toMatchObject({
      kind: "issue",
      number: 64,
      lifecycle: "closed",
    });
  });

  it("parses a connected PR on an issue timeline from subject", () => {
    const ref = getTimelineReference(
      {
        event: "connected",
        subject: {
          type: "pull_request",
          number: 68,
          title: "fix(terminal): eliminate PTY leak on page refresh",
          state: "merged",
          merged_at: "2026-04-06T08:30:01Z",
          draft: false,
          url: "https://api.github.com/repos/AruNi-01/atmos/pulls/68",
          repository: { full_name: "AruNi-01/atmos" },
        },
      },
      "AruNi-01",
      "atmos",
    );
    expect(ref).toMatchObject({
      kind: "pull_request",
      number: 68,
      lifecycle: "merged",
    });
  });

  it("infers an issue from a PR connected event when type/url are null", () => {
    const ref = getTimelineReference(
      {
        event: "connected",
        subject: {
          type: null,
          number: 64,
          title: "pty leak",
          state: "closed",
          merged_at: null,
          draft: null,
          url: null as unknown as undefined,
          repository: { full_name: "AruNi-01/atmos" },
        },
      },
      "AruNi-01",
      "atmos",
    );
    expect(ref).toMatchObject({
      kind: "issue",
      number: 64,
      lifecycle: "closed",
    });
  });

  it("uses the source repository when it differs from the current page", () => {
    const ref = getTimelineReference(
      {
        event: "cross-referenced",
        source: {
          issue: {
            number: 12,
            title: "upstream fix",
            state: "open",
            pull_request: { merged_at: null },
            repository: { full_name: "other/repo" },
          },
        },
      },
      "AruNi-01",
      "atmos",
    );
    expect(ref).toMatchObject({
      owner: "other",
      repo: "repo",
      kind: "pull_request",
      lifecycle: "open",
    });
  });

  it("returns null when the payload has no number", () => {
    expect(
      getTimelineReference(
        { event: "cross-referenced", source: { issue: { title: "x" } } },
        "AruNi-01",
        "atmos",
      ),
    ).toBeNull();
  });
});

describe("timeline ref event guards", () => {
  it("detects cross-referenced and connected events", () => {
    expect(isTimelineCrossReferencedItem({ event: "cross-referenced" })).toBe(
      true,
    );
    expect(isTimelineConnectedItem({ event: "connected" })).toBe(true);
    expect(isTimelineConnectedItem({ event: "disconnected" })).toBe(true);
    expect(isTimelineConnectedItem({ event: "cross-referenced" })).toBe(false);
  });
});
