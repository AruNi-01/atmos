import { describe, expect, it } from "bun:test";

import {
  isChatAgentSelected,
  resolveSetupAgentId,
  shouldAutofillChatAgent,
  shouldAutofillTerminalAgent,
} from "../automation-setup-agents";

describe("automation-setup-agents", () => {
  it("does not autofill a terminal agent in chat mode", () => {
    expect(
      shouldAutofillTerminalAgent({
        executeMode: "chat",
        terminalAgentId: "",
        hasSupportedTerminalAgents: true,
      }),
    ).toBe(false);
  });

  it("autofills a supported terminal agent only for headless or terminal", () => {
    expect(
      shouldAutofillTerminalAgent({
        executeMode: "headless",
        terminalAgentId: "",
        hasSupportedTerminalAgents: true,
      }),
    ).toBe(true);
    expect(
      shouldAutofillTerminalAgent({
        executeMode: "terminal",
        terminalAgentId: "codex",
        hasSupportedTerminalAgents: true,
      }),
    ).toBe(false);
  });

  it("autofills a chat agent only in chat mode", () => {
    expect(
      shouldAutofillChatAgent({
        executeMode: "chat",
        chatAgentId: "",
        hasChatAgents: true,
      }),
    ).toBe(true);
    expect(
      shouldAutofillChatAgent({
        executeMode: "headless",
        chatAgentId: "",
        hasChatAgents: true,
      }),
    ).toBe(false);
    expect(
      shouldAutofillChatAgent({
        executeMode: "chat",
        chatAgentId: "claude",
        hasChatAgents: true,
      }),
    ).toBe(false);
  });

  it("keeps chat and terminal agent ids separate", () => {
    expect(
      resolveSetupAgentId({
        executeMode: "chat",
        terminalAgentId: "codex",
        chatAgentId: "claude",
      }),
    ).toBe("claude");
    expect(
      resolveSetupAgentId({
        executeMode: "terminal",
        terminalAgentId: "codex",
        chatAgentId: "claude",
      }),
    ).toBe("codex");
  });

  it("requires a catalog chat provider once the list is ready", () => {
    expect(
      isChatAgentSelected({
        chatAgentId: "codex",
        chatProviderIds: ["claude"],
        catalogReady: true,
      }),
    ).toBe(false);
    expect(
      isChatAgentSelected({
        chatAgentId: "claude",
        chatProviderIds: ["claude"],
        catalogReady: true,
      }),
    ).toBe(true);
    expect(
      isChatAgentSelected({
        chatAgentId: "",
        chatProviderIds: ["claude"],
        catalogReady: true,
      }),
    ).toBe(false);
  });
});
