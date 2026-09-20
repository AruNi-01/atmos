import { describe, expect, test } from "bun:test";
import { renderAgentPrompt } from "./render-prompt";
import type { AgentRequest } from "./types";

const baseDoc = {
  path: "/repo/plan.md",
  markdown: "# Plan\n\nDo the thing.",
  truncated: false,
};

const githubRef = {
  kind: "github-issue",
  layout: "card" as const,
  title: "GitHub #128",
  attrs: { url: "https://github.com/acme/app/issues/128" },
};

function request(partial: Partial<AgentRequest> & Pick<AgentRequest, "execution">): AgentRequest {
  return {
    instruction: "Rewrite the selection.",
    document: baseDoc,
    references: [],
    outputHint: "markdown",
    ...partial,
  };
}

describe("renderAgentPrompt", () => {
  test("copy prompt is citation-only", () => {
    const text = renderAgentPrompt(
      request({
        execution: { kind: "copy" },
        selection: { markdown: "Do the thing." },
        references: [githubRef],
        workspace: { id: "w1", name: "ws", path: "/repo" },
      }),
    );
    expect(text).toContain("[Context]");
    expect(text).toContain("Path: /repo/plan.md");
    expect(text).toContain("[Selection]");
    expect(text).toContain("GitHub #128 — https://github.com/acme/app/issues/128");
    expect(text).not.toContain("[Output contract]");
    expect(text).not.toContain("atmos-md-live");
    expect(text.toLowerCase()).not.toContain("do not modify");
  });

  test("headless prompt includes fence and do-not-modify contract", () => {
    const text = renderAgentPrompt(
      request({
        execution: { kind: "headless", agentId: "claude-code" },
      }),
    );
    expect(text).toContain("[Instructions]");
    expect(text).toContain("[Output contract]");
    expect(text).toContain("<!--atmos-md-live-->");
    expect(text).toContain("<!--/atmos-md-live-->");
    expect(text).toContain("Do not modify the document file on disk");
    expect(text).toContain("/repo/plan.md");
    expect(text).toContain("[Document]");
  });
});
