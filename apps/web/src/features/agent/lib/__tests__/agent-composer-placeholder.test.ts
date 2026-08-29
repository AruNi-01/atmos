import { describe, expect, it } from "bun:test";
import { resolveAgentComposerPlaceholderKind } from "@/features/agent/lib/agent-composer-placeholder";

describe("resolveAgentComposerPlaceholderKind", () => {
  it("asks to create a session when chat has not started yet", () => {
    expect(
      resolveAgentComposerPlaceholderKind({
        canUseCurrentMode: true,
        agentName: "Claude Code",
        chatId: null,
        runtimeStatus: "detached",
        hasPersistenceHandle: false,
      }),
    ).toBe("createSession");
  });

  it("asks to resume when viewing a detached history session", () => {
    expect(
      resolveAgentComposerPlaceholderKind({
        canUseCurrentMode: true,
        agentName: "Claude Code",
        chatId: "chat-1",
        runtimeStatus: "detached",
        hasPersistenceHandle: true,
      }),
    ).toBe("resumeSession");
  });

  it("uses the selected agent while the session is live", () => {
    expect(
      resolveAgentComposerPlaceholderKind({
        canUseCurrentMode: true,
        agentName: "Claude Code",
        chatId: "chat-1",
        runtimeStatus: "ready",
        hasPersistenceHandle: true,
      }),
    ).toBe("connected");
  });

  it("falls back to select-agent and unavailable first", () => {
    expect(
      resolveAgentComposerPlaceholderKind({
        canUseCurrentMode: false,
        agentName: "Claude Code",
        chatId: null,
        runtimeStatus: "detached",
        hasPersistenceHandle: false,
      }),
    ).toBe("unavailable");
    expect(
      resolveAgentComposerPlaceholderKind({
        canUseCurrentMode: true,
        agentName: "",
        chatId: null,
        runtimeStatus: "detached",
        hasPersistenceHandle: false,
      }),
    ).toBe("selectAgent");
  });
});
