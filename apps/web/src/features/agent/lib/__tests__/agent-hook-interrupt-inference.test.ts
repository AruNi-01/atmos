import { describe, expect, it, vi } from "vitest";
import {
  AGENT_HOOK_DOUBLE_ESCAPE_MS,
  AGENT_HOOK_INTERRUPT_SETTLE_MS,
  createAgentHookInterruptInference,
  isCtrlCInput,
  isPlainEscapeInput,
  type AgentHookInterruptSession,
} from "../agent-hook-interrupt-inference";

function makeSession(
  overrides: Partial<AgentHookInterruptSession> = {}
): AgentHookInterruptSession {
  return {
    session_id: "ws-1:agent",
    tool: "claude-code",
    state: "running",
    timestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("agent-hook-interrupt-inference", () => {
  it("detects ctrl-c and bare escape input", () => {
    expect(isCtrlCInput("\x03")).toBe(true);
    expect(isCtrlCInput("hello")).toBe(false);
    expect(isPlainEscapeInput("\x1b")).toBe(true);
    expect(isPlainEscapeInput("\x1b[A")).toBe(false);
  });

  it("force-idles after settle on ctrl-c when session still running", () => {
    vi.useFakeTimers();
    const force = vi.fn();
    const session = makeSession();
    const inference = createAgentHookInterruptInference({
      getStablePaneId: () => "ws-1:agent",
      getSession: () => session,
      forceSessionIdle: force,
    });

    inference.observeInput("\x03");
    expect(force).not.toHaveBeenCalled();
    vi.advanceTimersByTime(AGENT_HOOK_INTERRUPT_SETTLE_MS);
    expect(force).toHaveBeenCalledWith("ws-1:agent");
    inference.dispose();
    vi.useRealTimers();
  });

  it("does not force-idle when a newer hook update lands before settle", () => {
    vi.useFakeTimers();
    const force = vi.fn();
    let session = makeSession();
    const inference = createAgentHookInterruptInference({
      getStablePaneId: () => "ws-1:agent",
      getSession: () => session,
      forceSessionIdle: force,
    });

    inference.observeInput("\x03");
    session = makeSession({
      state: "idle",
      timestamp: "2026-01-01T00:00:01.000Z",
    });
    vi.advanceTimersByTime(AGENT_HOOK_INTERRUPT_SETTLE_MS);
    expect(force).not.toHaveBeenCalled();
    inference.dispose();
    vi.useRealTimers();
  });

  it("requires double escape for opencode", () => {
    vi.useFakeTimers();
    const force = vi.fn();
    const session = makeSession({ tool: "opencode" });
    const inference = createAgentHookInterruptInference({
      getStablePaneId: () => "ws-1:agent",
      getSession: () => session,
      forceSessionIdle: force,
    });

    inference.observeInput("\x1b");
    vi.advanceTimersByTime(AGENT_HOOK_INTERRUPT_SETTLE_MS);
    expect(force).not.toHaveBeenCalled();

    inference.observeInput("\x1b");
    vi.advanceTimersByTime(AGENT_HOOK_INTERRUPT_SETTLE_MS);
    expect(force).toHaveBeenCalledWith("ws-1:agent");
    inference.dispose();
    vi.useRealTimers();
  });

  it("ignores second escape after double-escape window expires", () => {
    vi.useFakeTimers();
    const force = vi.fn();
    const session = makeSession({ tool: "opencode" });
    const inference = createAgentHookInterruptInference({
      getStablePaneId: () => "ws-1:agent",
      getSession: () => session,
      forceSessionIdle: force,
    });

    inference.observeInput("\x1b");
    vi.advanceTimersByTime(AGENT_HOOK_DOUBLE_ESCAPE_MS + 1);
    inference.observeInput("\x1b");
    vi.advanceTimersByTime(AGENT_HOOK_INTERRUPT_SETTLE_MS);
    expect(force).not.toHaveBeenCalled();
    inference.dispose();
    vi.useRealTimers();
  });
});
