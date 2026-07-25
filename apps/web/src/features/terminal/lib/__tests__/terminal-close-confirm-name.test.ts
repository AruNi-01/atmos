import { describe, expect, test } from "bun:test";
import { getTerminalCloseConfirmName } from "../terminal-close-confirm-name";

const claudeAgent = {
  id: "claude",
  label: "Claude Code",
  command: "claude",
  iconType: "built-in" as const,
};

const codexAgent = {
  id: "codex",
  label: "Codex",
  command: "codex",
  iconType: "built-in" as const,
};

const configuredAgents = [claudeAgent, codexAgent];

describe("getTerminalCloseConfirmName", () => {
  test("prefers recognized agent name over raw binary title", () => {
    expect(
      getTerminalCloseConfirmName(
        {
          label: "1",
          dynamicTitle: "claude",
          agent: claudeAgent,
        },
        configuredAgents,
      ),
    ).toBe("Claude Code");
  });

  test("resolves agent from dynamic title even without stored agent", () => {
    expect(
      getTerminalCloseConfirmName(
        {
          label: "Term",
          dynamicTitle: "codex",
        },
        configuredAgents,
      ),
    ).toBe("Codex");
  });

  test("uses stored agent label when dynamic title is an ugly binary", () => {
    expect(
      getTerminalCloseConfirmName(
        {
          label: "Claude Code",
          dynamicTitle: "/usr/local/bin/claude",
          agent: claudeAgent,
        },
        configuredAgents,
      ),
    ).toBe("Claude Code");
  });

  test("combines custom label with agent name", () => {
    expect(
      getTerminalCloseConfirmName(
        {
          label: "Claude Code",
          customLabel: "Review",
          dynamicTitle: "claude",
          agent: claudeAgent,
        },
        configuredAgents,
      ),
    ).toBe("Review · Claude Code");
  });

  test("shortens non-agent command names", () => {
    expect(
      getTerminalCloseConfirmName(
        {
          label: "1",
          dynamicTitle: "/opt/homebrew/bin/node server.js",
        },
        configuredAgents,
      ),
    ).toBe("node");
  });

  test("falls back to pane label when nothing else is useful", () => {
    expect(
      getTerminalCloseConfirmName(
        {
          label: "2",
        },
        configuredAgents,
      ),
    ).toBe("2");
  });
});
