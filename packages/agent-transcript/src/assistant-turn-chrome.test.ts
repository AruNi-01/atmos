import { describe, expect, it } from "bun:test";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { isSessionChromeOnly, shouldShowAssistantTurnEndedChrome } from "./index";

function assistant(parts: AgentPart[], extra: Partial<AgentMessage> = {}): AgentMessage {
  return { id: "a1", role: "assistant", parts, ...extra };
}

describe("assistant turn ended chrome", () => {
  it("treats empty and session-only parts as chrome", () => {
    expect(isSessionChromeOnly([])).toBe(true);
    expect(
      isSessionChromeOnly([
        { type: "session_lifecycle", action: "create", status: "completed" },
        { type: "session_hint", tone: "info", kind: "session_op_failed" },
      ]),
    ).toBe(true);
    expect(isSessionChromeOnly([{ type: "text", text: "hi" }])).toBe(false);
  });

  it("hides the footer while streaming, on chrome-only rows, and before completed_at", () => {
    const chrome = assistant([
      { type: "session_lifecycle", action: "create", status: "completed", duration_ms: 3000 },
    ]);
    expect(shouldShowAssistantTurnEndedChrome(chrome, "")).toBe(false);
    expect(
      shouldShowAssistantTurnEndedChrome(
        assistant([{ type: "text", text: "hi" }], { streaming: true, completed_at: "t" }),
        "hi",
      ),
    ).toBe(false);
    expect(
      shouldShowAssistantTurnEndedChrome(
        assistant([{ type: "text", text: "hi" }], { streaming: false, worked_ms: 20 }),
        "hi",
      ),
    ).toBe(false);
  });

  it("shows the footer for text, usage, or a positive worked clock after the turn completes", () => {
    const done = { streaming: false, completed_at: "2026-10-15T00:00:00Z" };
    expect(
      shouldShowAssistantTurnEndedChrome(assistant([{ type: "text", text: "hi" }], done), "hi"),
    ).toBe(true);
    expect(
      shouldShowAssistantTurnEndedChrome(
        assistant([{ type: "tool_call", tool_call_id: "t", name: "Edit", status: "completed" }], {
          ...done,
          usage: { total_tokens: 10 },
        }),
        "",
      ),
    ).toBe(true);
    expect(
      shouldShowAssistantTurnEndedChrome(
        assistant([{ type: "tool_call", tool_call_id: "t", name: "Edit", status: "completed" }], {
          ...done,
          worked_ms: 1500,
        }),
        "  ",
      ),
    ).toBe(true);
    expect(
      shouldShowAssistantTurnEndedChrome(
        assistant([{ type: "tool_call", tool_call_id: "t", name: "Edit", status: "completed" }], {
          ...done,
          worked_ms: 0,
        }),
        "",
      ),
    ).toBe(false);
  });
});
