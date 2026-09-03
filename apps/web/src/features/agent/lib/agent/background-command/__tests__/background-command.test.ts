import { describe, expect, it } from "bun:test";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import {
  displayBackgroundCommand,
  isBackgroundToolCall,
  isLiveBackgroundToolCall,
} from "@/features/agent/lib/agent/background-command";

function execute(
  overrides: Partial<AgentToolCallPart> & { params: Extract<AgentToolCallPart["params"], { type: "execute" }> },
): AgentToolCallPart {
  return {
    type: "tool_call",
    tool_call_id: "t-bg",
    name: "Execute",
    kind: "execute",
    status: "running",
    ...overrides,
  };
}

describe("background execute params", () => {
  it("treats execute params.background as the live SOT", () => {
    const part = execute({
      params: { type: "execute", command: "sleep 60", background: true, task_id: "task-1" },
    });
    expect(isBackgroundToolCall(part)).toBe(true);
    expect(isLiveBackgroundToolCall(part)).toBe(true);
    expect(displayBackgroundCommand(part)).toBe("sleep 60");
  });

  it("ignores foreground execute", () => {
    const part = execute({
      params: { type: "execute", command: "ls", background: false },
    });
    expect(isBackgroundToolCall(part)).toBe(false);
    expect(isLiveBackgroundToolCall(part)).toBe(false);
  });

  it("does not treat a completed background execute as live", () => {
    const part = execute({
      status: "completed",
      params: { type: "execute", command: "count", background: true },
    });
    expect(isBackgroundToolCall(part)).toBe(true);
    expect(isLiveBackgroundToolCall(part)).toBe(false);
  });
});
