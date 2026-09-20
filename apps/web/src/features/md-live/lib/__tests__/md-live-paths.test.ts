import { describe, expect, test } from "bun:test";
import {
  createUntitledMarkdownPath,
  isLiveEligibleMarkdownPath,
  isUntitledMarkdownPath,
} from "../md-live-paths";

describe("md-live path eligibility", () => {
  test("untitled notes are live-eligible", () => {
    const path = createUntitledMarkdownPath("Untitled.md");
    expect(path).toBe("untitled:Untitled.md");
    expect(isUntitledMarkdownPath(path)).toBe(true);
    expect(isLiveEligibleMarkdownPath(path)).toBe(true);
  });

  test("worktree markdown is live-eligible", () => {
    expect(isLiveEligibleMarkdownPath("/repo/README.md", { language: "markdown" })).toBe(true);
    expect(isLiveEligibleMarkdownPath("/repo/plan.md", { fileName: "plan.md" })).toBe(true);
  });

  test("review reports and mdx are not live-eligible", () => {
    expect(
      isLiveEligibleMarkdownPath("/repo/.atmos/reviews/run-1.md", { fileName: "run-1.md" }),
    ).toBe(false);
    expect(isLiveEligibleMarkdownPath("/repo/page.mdx", { fileName: "page.mdx" })).toBe(false);
  });
});
