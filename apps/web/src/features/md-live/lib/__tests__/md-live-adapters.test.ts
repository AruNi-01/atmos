import { describe, expect, test } from "bun:test";
import { renderAgentPrompt } from "@atmos/md-live";
import { buildHeadlessPrompt } from "../md-live-adapters";

const request = {
  instruction: "Rewrite",
  document: { path: "/repo/a.md", markdown: "hi", truncated: false },
  references: [],
  outputHint: "markdown" as const,
  execution: { kind: "headless" as const, agentId: "claude-code" },
};

describe("md-live adapters", () => {
  test("headless builder includes fence contract", () => {
    const text = buildHeadlessPrompt(request);
    expect(text).toContain("<!--atmos-md-live-->");
    expect(text).toContain("Do not modify the document file");
  });

  test("copy prompt stays citation-only", () => {
    const text = renderAgentPrompt({ ...request, execution: { kind: "copy" } });
    expect(text).not.toContain("[Output contract]");
    expect(text).not.toContain("<!--atmos-md-live-->");
  });
});
