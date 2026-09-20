import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const partView = readFileSync(join(import.meta.dir, "../AgentPartView.tsx"), "utf8");
const overlay = readFileSync(join(import.meta.dir, "../SubagentConversationOverlay.tsx"), "utf8");
const subagent = readFileSync(join(import.meta.dir, "../SubAgentBlockView.tsx"), "utf8");

describe("subagent child tool rendering", () => {
  it("hides nested children in the main transcript and renders them in the overlay", () => {
    expect(partView).toContain("isNestedSubagentChild(part, parts)");
    expect(partView).toContain("<ToolView");
    expect(subagent).not.toContain("childTools.map");
    expect(subagent).not.toContain("<ToolView");
    expect(overlay).toContain("AgentChatMessageView");
    expect(overlay).toContain("messagesForSubagent");
    expect(overlay).not.toContain("AgentChatTranscriptList");
  });
});
