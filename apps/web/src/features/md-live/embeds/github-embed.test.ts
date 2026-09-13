import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { githubIssueStateOf, githubPrStateOf } from "./github-embed-state";

describe("github embed state", () => {
  test("maps draft and merged pull requests", () => {
    expect(githubPrStateOf("open", true)).toBe("draft");
    expect(githubPrStateOf("open", false)).toBe("open");
    expect(githubPrStateOf("merged", false)).toBe("merged");
    expect(githubPrStateOf("closed", false)).toBe("closed");
    expect(githubIssueStateOf("CLOSED")).toBe("closed");
    expect(githubIssueStateOf("open")).toBe("open");
  });

  test("picker and cards share status icons", () => {
    const picker = readFileSync(join(import.meta.dir, "picker.tsx"), "utf8");
    expect(picker).toContain("GithubPrStatusIcon");
    expect(picker).toContain("GithubIssueStatusIcon");
    expect(picker).toContain("item.state");
    expect(picker).toContain("is_draft");
  });
});
