import { describe, expect, it } from "bun:test";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { foldedPartIsOpen, foldedPartKey } from "../folded-agent-part";

function text(id: string, body: string, closedAt: string | null): AgentPart {
  return {
    type: "text",
    text: body,
    message_id: id,
    part_id: id,
    ordinal: 0,
    closed_at: closedAt,
  } as AgentPart;
}

function thinking(id: string, body: string, closedAt: string | null): AgentPart {
  return {
    type: "thinking",
    text: body,
    tool_call_id: id,
    part_id: id,
    ordinal: 1,
    closed_at: closedAt,
  } as AgentPart;
}

describe("folded agent part projection", () => {
  it("treats each text/thinking part as open from closed_at, not last-in-array", () => {
    const first = text("msg:0", "block one", null);
    const second = text("msg:1", "block two", "closed");
    const thought = thinking("think:0", "reason", null);

    expect(foldedPartIsOpen(first)).toBe(true);
    expect(foldedPartIsOpen(second)).toBe(false);
    expect(foldedPartIsOpen(thought)).toBe(true);
    expect(foldedPartIsOpen({ type: "error", message: "nope" })).toBe(false);
  });

  it("does not treat omitted closed_at as live", () => {
    expect(foldedPartIsOpen({ type: "text", text: "hi" })).toBe(false);
  });

  it("keys rows by fold part_id so sibling text blocks stay distinct", () => {
    expect(foldedPartKey(text("msg:0", "a", null), 3)).toBe("msg:0");
    expect(foldedPartKey(text("msg:1", "b", null), 4)).toBe("msg:1");
    expect(foldedPartKey({ type: "error", message: "x" }, 2)).toBe("error-2");
  });
});
