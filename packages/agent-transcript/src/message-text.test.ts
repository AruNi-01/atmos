import { describe, expect, it } from "bun:test";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { assistantCopyText, textFromParts } from "./index";

describe("message text", () => {
  it("joins top-level text parts and skips nested tool text", () => {
    const parts: AgentPart[] = [
      { type: "text", text: " hello " },
      { type: "text", text: "nested", parent_tool_call_id: "tool-1" },
      { type: "thinking", text: "secret" },
      { type: "text", text: "world" },
    ];
    expect(textFromParts(parts)).toBe("hello \nworld");
  });

  it("copies assistant text and errors, skipping blanks and nested text", () => {
    const message: AgentMessage = {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "text", text: "  Hello  " },
        { type: "text", text: "   " },
        { type: "text", text: "inside", parent_tool_call_id: "tool-1" },
        { type: "error", message: " boom " },
        { type: "error", message: "  " },
      ],
    };
    expect(assistantCopyText(message)).toBe("Hello\n\nboom");
  });
});
