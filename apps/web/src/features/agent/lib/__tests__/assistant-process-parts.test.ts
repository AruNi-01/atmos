import { describe, expect, it } from "bun:test";
import {
  shouldCollapseAssistantProcess,
  splitAssistantProcessParts,
} from "@/features/agent/lib/assistant-process-parts";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";

describe("assistant process collapse", () => {
  it("puts tools and thinking above the final answer even if history stored them last", () => {
    const parts: AgentPart[] = [
      { type: "text", text: "final answer" },
      { type: "thinking", text: "hmm" },
      {
        type: "tool_call",
        tool_call_id: "t1",
        name: "Read",
        kind: "read",
        status: "completed",
      },
    ];
    const { processParts, answerParts } = splitAssistantProcessParts(parts);
    expect(processParts.map((item) => item.part.type)).toEqual(["thinking", "tool_call"]);
    expect(answerParts.map((item) => item.part.type)).toEqual(["text"]);
    expect(answerParts[0]?.part).toMatchObject({ type: "text", text: "final answer" });
  });

  it("does not collapse while the turn is still streaming or only between text and tools", () => {
    expect(shouldCollapseAssistantProcess({ streaming: true }, false, true, true)).toBe(false);
    expect(shouldCollapseAssistantProcess({ streaming: false }, false, true, true)).toBe(false);
    expect(shouldCollapseAssistantProcess({ streaming: false, completed_at: null }, true, true, true)).toBe(false);
  });

  it("collapses process only after the turn has fully settled", () => {
    expect(shouldCollapseAssistantProcess(
      { streaming: false, completed_at: "2026-08-29T00:00:00.000Z" },
      false,
      true,
      true,
    )).toBe(true);
    expect(shouldCollapseAssistantProcess(
      { streaming: false, worked_ms: 3200 },
      false,
      true,
      true,
    )).toBe(true);
  });
});
