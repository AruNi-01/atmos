// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import {
  buildGithubActionsJobFixPrompt,
  buildPrReviewFixPrompt,
  buildPrReviewThreadFixPrompt,
} from "@/features/github/lib/agent-fix-prompts";

describe("APP-026 agent fix prompts", () => {
  it("S6 includes PR review thread context without unrelated timeline noise", () => {
    const prompt = buildPrReviewThreadFixPrompt(
      {
        owner: "acme",
        repo: "app",
        prNumber: 42,
        title: "Fix checkout",
        headRefName: "fix/checkout",
        baseRefName: "main",
        url: "https://github.com/acme/app/pull/42",
      },
      {
        path: "src/checkout.ts",
        line: 27,
        diffHunk: "@@ -24,6 +24,7 @@\n- old\n+ new",
        comments: [
          {
            body: "This still allows an empty cart.",
            user: { login: "reviewer" },
          },
        ],
      },
    );

    expect(prompt).toContain("Repository: acme/app");
    expect(prompt).toContain("Pull request: #42");
    expect(prompt).toContain("File: src/checkout.ts");
    expect(prompt).toContain("This still allows an empty cart.");
    expect(prompt).toContain("```diff");
    expect(prompt).not.toContain("approved this PR");
    expect(prompt).not.toContain("deployment");
  });

  it("S4 includes only focused GitHub Actions failure context", () => {
    const prompt = buildGithubActionsJobFixPrompt({
      owner: "acme",
      repo: "app",
      run: {
        databaseId: 1001,
        workflowName: "CI",
        displayTitle: "push",
        status: "completed",
        conclusion: "failure",
        headBranch: "fix/checkout",
        headSha: "abc123",
        url: "https://github.com/acme/app/actions/runs/1001",
      },
      job: {
        name: "test",
        status: "completed",
        conclusion: "failure",
        html_url: "https://github.com/acme/app/actions/runs/1001/job/2",
        steps: [
          { name: "Install", conclusion: "success", number: 1 },
          { name: "Run tests", conclusion: "failure", number: 2 },
        ],
      },
    });

    expect(prompt).toContain("Workflow: CI");
    expect(prompt).toContain("Run ID: 1001");
    expect(prompt).toContain("Branch: fix/checkout");
    expect(prompt).toContain("Name: test");
    expect(prompt).toContain("Run tests (#2): failure");
    expect(prompt).not.toContain("Install (#1)");
    expect(prompt).not.toContain("reviewer comments");
  });

  it("builds a parent PR review prompt from all inline review threads", () => {
    const prompt = buildPrReviewFixPrompt(
      {
        owner: "acme",
        repo: "app",
        prNumber: 42,
        title: "Fix checkout",
        headRefName: "fix/checkout",
        baseRefName: "main",
        url: "https://github.com/acme/app/pull/42",
      },
      {
        author: "coderabbitai[bot]",
        body: "Review found 2 potential issues.",
        createdAt: "2026-06-25T01:00:00Z",
        state: "COMMENTED",
        threads: [
          {
            path: "src/cart.ts",
            line: 12,
            diffHunk: "@@ -10,3 +10,3 @@\n-old\n+new",
            comments: [
              {
                body: "Guard the empty cart case.",
                user: { login: "coderabbitai[bot]" },
              },
            ],
          },
          {
            path: "src/checkout.ts",
            line: 28,
            diffHunk: "",
            comments: [
              {
                body: "This error should preserve the original cause.",
                user: { login: "reviewer" },
              },
            ],
          },
        ],
      },
    );

    expect(prompt).toContain("Review summary by coderabbitai[bot]");
    expect(prompt).toContain("Review found 2 potential issues.");
    expect(prompt).toContain("Thread 1: src/cart.ts (line 12)");
    expect(prompt).toContain("Guard the empty cart case.");
    expect(prompt).toContain("Thread 2: src/checkout.ts (line 28)");
    expect(prompt).toContain("This error should preserve the original cause.");
    expect(prompt).not.toContain("deployed to Preview");
  });
});
