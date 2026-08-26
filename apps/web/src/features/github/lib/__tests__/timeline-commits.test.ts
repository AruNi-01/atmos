import { describe, expect, it } from "bun:test";
import {
  getTimelineCommitSha,
  getTimelineCommitSubject,
  groupConsecutiveTimelineCommits,
  isTimelineCommitItem,
} from "../timeline-commits";

describe("groupConsecutiveTimelineCommits", () => {
  it("groups consecutive committed events into a single batch", () => {
    const items = [
      { event: "commented", body: "hello" },
      { event: "committed", sha: "aaa", message: "first" },
      { event: "committed", sha: "bbb", message: "second" },
      { event: "committed", sha: "ccc", message: "third" },
      { event: "closed" },
      { event: "committed", sha: "ddd", message: "solo" },
    ];

    const grouped = groupConsecutiveTimelineCommits(items);
    expect(grouped).toHaveLength(4);
    expect(grouped[0]).toMatchObject({ kind: "item", item: { event: "commented" } });
    expect(grouped[1]).toMatchObject({
      kind: "commits",
      commits: [{ sha: "aaa" }, { sha: "bbb" }, { sha: "ccc" }],
      startIndex: 1,
    });
    expect(grouped[2]).toMatchObject({ kind: "item", item: { event: "closed" } });
    expect(grouped[3]).toMatchObject({
      kind: "commits",
      commits: [{ sha: "ddd" }],
      startIndex: 5,
    });
  });

  it("groups consecutive cross-referenced events like GitHub", () => {
    const items = [
      { event: "commented", body: "hello" },
      { event: "cross-referenced", source: { issue: { number: 261 } } },
      { event: "cross-referenced", source: { issue: { number: 262 } } },
      { event: "cross-referenced", source: { issue: { number: 264 } } },
      { event: "closed" },
      { event: "cross-referenced", source: { issue: { number: 90 } } },
    ];

    const grouped = groupConsecutiveTimelineCommits(items);
    expect(grouped).toHaveLength(4);
    expect(grouped[0]).toMatchObject({ kind: "item", item: { event: "commented" } });
    expect(grouped[1]).toMatchObject({
      kind: "cross-referenced",
      items: [
        { source: { issue: { number: 261 } } },
        { source: { issue: { number: 262 } } },
        { source: { issue: { number: 264 } } },
      ],
      startIndex: 1,
    });
    expect(grouped[2]).toMatchObject({ kind: "item", item: { event: "closed" } });
    expect(grouped[3]).toMatchObject({
      kind: "cross-referenced",
      items: [{ source: { issue: { number: 90 } } }],
      startIndex: 5,
    });
  });

  it("does not fold connected events into the cross-referenced group", () => {
    const items = [
      { event: "cross-referenced" },
      { event: "connected" },
      { event: "cross-referenced" },
    ];
    const grouped = groupConsecutiveTimelineCommits(items);
    expect(grouped.map((entry) => entry.kind)).toEqual([
      "cross-referenced",
      "item",
      "cross-referenced",
    ]);
  });

  it("treats type=commit as a commit item", () => {
    expect(isTimelineCommitItem({ type: "commit" })).toBe(true);
    expect(isTimelineCommitItem({ event: "labeled" })).toBe(false);
  });

  it("resolves sha and subject fields", () => {
    expect(getTimelineCommitSha({ commit_id: "abc123" })).toBe("abc123");
    expect(getTimelineCommitSubject({ messageHeadline: "hi" })).toBe("hi");
  });
});
