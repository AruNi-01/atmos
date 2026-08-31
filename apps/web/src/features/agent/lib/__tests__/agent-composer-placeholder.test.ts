import { describe, expect, it } from "bun:test";
import {
  isAgentNewChatLanding,
  resolveAgentComposerPlaceholderKind,
} from "@/features/agent/lib/agent-composer-placeholder";

describe("isAgentNewChatLanding", () => {
  it("is true for an empty chat that is not restoring history", () => {
    expect(
      isAgentNewChatLanding({
        chatId: null,
        messageCount: 0,
        isResumingHistory: false,
      }),
    ).toBe(true);
    expect(
      isAgentNewChatLanding({
        chatId: "chat-1",
        messageCount: 0,
        isResumingHistory: false,
      }),
    ).toBe(true);
  });

  it("is false after messages arrive or history is restoring", () => {
    expect(
      isAgentNewChatLanding({
        chatId: null,
        messageCount: 1,
        isResumingHistory: false,
      }),
    ).toBe(false);
    expect(
      isAgentNewChatLanding({
        chatId: "chat-1",
        messageCount: 0,
        isResumingHistory: true,
      }),
    ).toBe(false);
  });
});


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
