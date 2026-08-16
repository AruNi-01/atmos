import { describe, expect, test } from "bun:test";
import {
  collectGitHistoryMatchIndexes,
  gitHistoryCommitMatches,
  isGitHistoryHashQuery,
  splitHighlightedText,
} from "./git-history-search";

const commit = {
  hash: "abcdef1234567890",
  short_hash: "abcdef1",
  subject: "Fix web sidebar search",
  author_name: "Ada",
  author_email: "ada@example.com",
  refs: [{ kind: "branch" as const, label: "origin/web-fix" }],
};

describe("git history search", () => {
  test("treats 7–40 hex characters as a SHA prefix query", () => {
    expect(isGitHistoryHashQuery("abcdef1")).toBe(true);
    expect(isGitHistoryHashQuery("web")).toBe(false);
    expect(gitHistoryCommitMatches(commit, "abcdef12", false)).toBe(true);
    expect(
      gitHistoryCommitMatches(
        {
          ...commit,
          hash: "zzzzzzzzzzzzzzzz",
          short_hash: "zzzzzzz",
          subject: "abcdef12 in message",
        },
        "abcdef1",
        false,
      ),
    ).toBe(false);
  });

  test("matches subject, author, and ref labels unless the query is a SHA", () => {
    expect(gitHistoryCommitMatches(commit, "web", false)).toBe(true);
    expect(gitHistoryCommitMatches(commit, "WEB", true)).toBe(false);
    expect(gitHistoryCommitMatches(commit, "Ada", true)).toBe(true);
    expect(gitHistoryCommitMatches(commit, "web-fix", false)).toBe(true);
  });

  test("collects match indexes in list order", () => {
    const commits = [
      commit,
      {
        ...commit,
        hash: "1111111111111111",
        short_hash: "1111111",
        subject: "unrelated",
        refs: [],
      },
      { ...commit, hash: "2222222222222222", short_hash: "2222222", subject: "More Web work" },
    ];
    expect(collectGitHistoryMatchIndexes(commits, "web", false)).toEqual([0, 2]);
  });

  test("splits highlighted text without dropping surrounding characters", () => {
    expect(splitHighlightedText("Fix web sidebar", "web", false)).toEqual([
      { text: "Fix ", match: false },
      { text: "web", match: true },
      { text: " sidebar", match: false },
    ]);
  });

  test("highlights regex metacharacters as literal text", () => {
    expect(splitHighlightedText("fix (web) sidebar", "(web)", false)).toEqual([
      { text: "fix ", match: false },
      { text: "(web)", match: true },
      { text: " sidebar", match: false },
    ]);
    expect(splitHighlightedText("v1.2 files", "1.2", false)).toEqual([
      { text: "v", match: false },
      { text: "1.2", match: true },
      { text: " files", match: false },
    ]);
    expect(splitHighlightedText("array[0]", "[0]", false)).toEqual([
      { text: "array", match: false },
      { text: "[0]", match: true },
    ]);
  });
});
