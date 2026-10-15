import { describe, expect, it } from "bun:test";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { foldedPartIsOpen, foldedPartIsStreamingDisplayTail } from "./index";

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

describe("folded part projection", () => {
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

  it("buffers only the last open answer text", () => {
    const first = text("msg:0", "one", null);
    const second = text("msg:1", "two", null);
    const parts = [text("msg:done", "done", "closed"), first, second];
    expect(foldedPartIsStreamingDisplayTail(first, parts)).toBe(false);
    expect(foldedPartIsStreamingDisplayTail(second, parts)).toBe(true);
  });

  it("stops buffering when the tail closes", () => {
    const part = text("msg:0", "done", "closed");
    expect(foldedPartIsStreamingDisplayTail(part, [part])).toBe(false);
  });
});
