import { describe, expect, it } from "bun:test";
import {
  composeAgentChatPrompt,
  parseLeadingAgentSlashCommand,
} from "@/features/agent/lib/agent-chat-slash-command";

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
