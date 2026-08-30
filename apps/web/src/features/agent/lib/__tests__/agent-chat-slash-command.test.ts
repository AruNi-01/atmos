import { afterEach, describe, expect, it } from "bun:test";
import {
  composeAgentChatPrompt,
  expandAgentComposerText,
  parseLeadingAgentSlashCommand,
} from "@/features/agent/lib/agent-chat-slash-command";
import {
  __resetAiContextPayloadsForTests,
  registerAiContextPrompt,
} from "@/shared/lib/ai-context-protocol";

const commands = [
  { name: "hooks-list", description: "Show hooks" },
  { name: "compact", description: "Compress history" },
];

describe("agent chat slash commands", () => {
  it("composes a command token with optional arguments", () => {
    expect(composeAgentChatPrompt(null, " hello ")).toBe("hello");
    expect(composeAgentChatPrompt({ name: "hooks-list" }, "")).toBe("/hooks-list");
    expect(composeAgentChatPrompt({ name: "hooks-list" }, " ~/.atmos ")).toBe(
      "/hooks-list ~/.atmos",
    );
  });

  it("parses a leading available command into a chip payload", () => {
    expect(parseLeadingAgentSlashCommand("/hooks-list", commands)).toEqual({
      command: commands[0],
      rest: "",
    });
    expect(parseLeadingAgentSlashCommand("/hooks-list path/to/hooks", commands)).toEqual({
      command: commands[0],
      rest: "path/to/hooks",
    });
    expect(parseLeadingAgentSlashCommand("/unknown rest", commands)).toEqual({
      command: null,
      rest: "/unknown rest",
    });
    expect(parseLeadingAgentSlashCommand("plain text", commands)).toEqual({
      command: null,
      rest: "plain text",
    });
  });
});

describe("expandAgentComposerText", () => {
  afterEach(() => {
    __resetAiContextPayloadsForTests();
  });

  it("turns /cmd chips into ACP slash text and keeps file mentions", () => {
    expect(expandAgentComposerText("/cmd:copy-request-id\u00A0how is this?")).toBe(
      "/copy-request-id how is this?",
    );
    expect(expandAgentComposerText("@file:README.md\u00A0please review")).toBe(
      "@file:README.md please review",
    );
  });

  it("materializes AI context chips including terminal selections", () => {
    const token = registerAiContextPrompt("terminal-selection", "npm test\npass");
    expect(expandAgentComposerText(`${token}\u00A0why failed?`)).toBe(
      "npm test\npass why failed?",
    );
  });
});
